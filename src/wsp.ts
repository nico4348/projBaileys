import { Boom } from "@hapi/boom";
import NodeCache from "@cacheable/node-cache";
import { sendMessage } from "./messages/sendMessage";
import readline from "readline";
import { usePostgresAuthState } from "./bd";
import makeWASocket, {
	getAggregateVotesInPollMessage,
	DisconnectReason,
	fetchLatestBaileysVersion,
	isJidNewsletter,
	makeCacheableSignalKeyStore,
	proto,
	useMultiFileAuthState,
	type WAMessageKey,
	type WAMessageContent,
	Browsers,
} from "baileys";

import P from "pino";
import { downloadMedia } from "./messages/downloadMessage";

const logger = P(
	{ timestamp: () => `,"time":"${new Date().toJSON()}"` },
	P.destination("./wa-logs.txt")
);

logger.level = "silent";

const msgRetryCounterCache = new NodeCache();
const lastStatusById = new Map();

export function logStatus(key: proto.IMessageKey, status: number) {
	const names: Record<number, string> = {
		[0]: "Mensaje Usuario Recibido",
		[1]: "Respuesta Validada",
		[proto.WebMessageInfo.Status.SERVER_ACK]: "Respuesta enviada a Servidor Whatsapp",
		[proto.WebMessageInfo.Status.DELIVERY_ACK]: "Respuesta recibida por el Usuario",
		[proto.WebMessageInfo.Status.READ]: "Respuesta Leida",
		[proto.WebMessageInfo.Status.PLAYED]: "Audio escuchado",
		[6]: "Entrega Fallida",
	};
	console.log(`➡️ Mensaje ${key.id}: ${names[status] || status}`);
	lastStatusById.set(key.id, status);
}

const startSock = async () => {
	// const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info"); //* Auth en local
	const { state, saveCreds } = await usePostgresAuthState();
	const { version, isLatest } = await fetchLatestBaileysVersion();
	console.log(`using WA v${version.join(".")}, isLatest: ${isLatest}`);

	const sock = makeWASocket({
		version,
		logger,
		printQRInTerminal: true,
		auth: {
			creds: state.creds,
			keys: makeCacheableSignalKeyStore(state.keys, logger),
		},
		browser: Browsers.ubuntu("MyApp"),
		connectTimeoutMs: 60_000,
	});

	// Intento de pairing con reintentos
	const tryPairing = async (attempt = 1) => {
		try {
			if (!sock.authState.creds.registered) {
				console.log("⌛ Generando código de emparejamiento...");
				const code = await sock.requestPairingCode("573022949109");
				console.log(`✅ Código: ${code}\nIngrésalo en WhatsApp en 20 segundos:`);
				console.log("Ajustes → Dispositivos vinculados → Vincular dispositivo");

				// Espera activa
				await new Promise((resolve) => setTimeout(resolve, 30_000));

				if (!sock.authState.creds.registered) {
					throw new Error("Tiempo agotado");
				}
			}
		} catch (error) {
			if (attempt <= 3) {
				console.log(`🔄 Reintento ${attempt}/3 (${error.message})`);
				await tryPairing(attempt + 1);
			} else {
				console.error("❌ Fallo definitivo. Prueba más tarde o usa QR.");
				process.exit(1);
			}
		}
	};

	sock.ev.on("messages.update", (updates) => {
		for (const u of updates) {
			if (!u.key.fromMe) {
				return;
			}
			const prev = lastStatusById.get(u.key.id) || 0;

			if (u.update?.status == 4 && prev < 3) {
				logStatus(u.key, proto.WebMessageInfo.Status.DELIVERY_ACK);
			}
			if (u.update?.status == 5 && prev < 3) {
				logStatus(u.key, proto.WebMessageInfo.Status.DELIVERY_ACK);
			}

			logStatus(u.key, u.update?.status!);
		}
	});

	sock.ev.on("creds.update", saveCreds);

	sock.ev.process(async (events) => {
		if (events["connection.update"]) {
			const update = events["connection.update"];

			const { connection, lastDisconnect, qr } = update;

			// if (qr) {
			// 	console.log(await QRCode.toString(qr, { type: "terminal" }));
			// }

			if (connection === "close") {
				//* Reconexion
				if (
					(lastDisconnect?.error as Boom)?.output?.statusCode !==
					DisconnectReason.loggedOut
				) {
					startSock();
				} else {
					console.log("Connection closed. You are logged out.");
				}
			}

			console.log("connection update", update);
		}

		if (events["creds.update"]) {
			await saveCreds();
		}

		if (events.call) {
			await new Promise((resolve) => setTimeout(resolve, 2000));

			const call = events.call[0];
			if (call) {
				await sock!.rejectCall(call.id, call.from);
			}
		}

		if (events["messages.upsert"]) {
			const upsert = events["messages.upsert"];
			// console.log("recv messages ", JSON.stringify(upsert, undefined, 2));

			if (upsert.type === "notify") {
				for (const msg of upsert.messages) {
					logStatus(msg.key, 0);
					const userJid = msg.key.participant || msg.key.remoteJid!;
					const numero = userJid.split("@")[0];

					if (!msg.key.fromMe && !isJidNewsletter(msg.key?.remoteJid!)) {
						downloadMedia(msg);
						console.log("replying to", msg.key.remoteJid);
						await sock!.readMessages([msg.key]);

						// sendMessage(sock, msg.key, msg.key.remoteJid!, "react", "react", {
						// 	key: msg.key,
						// 	emoji: "😊",
						// });

						await sendMessage(sock, msg.key, msg.key.remoteJid!, "media", "video", {
							url: "./public/DSC0603-1.webp",
							caption: "holisss",
							quoted: { key: msg.key, message: msg.message },
						});
					}
				}
			}
		}

		// messages updated like status delivered, message deleted etc.
		if (events["messages.update"]) {
			for (const { key, update } of events["messages.update"]) {
				if (update.pollUpdates) {
					const pollCreation: proto.IMessage = {};
					if (pollCreation) {
						console.log(
							"got poll update, aggregation: ",
							getAggregateVotesInPollMessage({
								message: pollCreation,
								pollUpdates: update.pollUpdates,
							})
						);
					}
				}
			}
		}

		if (events["message-receipt.update"]) {
			console.log(events["message-receipt.update"]);
		}

		if (events["messages.reaction"]) {
			console.log(events["messages.reaction"]);
		}

		if (events["presence.update"]) {
			console.log(events["presence.update"]);
		}

		if (events["contacts.update"]) {
			for (const contact of events["contacts.update"]) {
				if (typeof contact.imgUrl !== "undefined") {
					const newUrl =
						contact.imgUrl === null
							? null
							: await sock!.profilePictureUrl(contact.id!).catch(() => null);
					console.log(`contact ${contact.id} has a new profile pic: ${newUrl}`);
				}
			}
		}
	});

	return sock;

	async function getMessage(key: WAMessageKey): Promise<WAMessageContent | undefined> {
		console.log("[getMessage]");
		return proto.Message.fromObject({});
	}
};

startSock();
