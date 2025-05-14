import { Boom } from "@hapi/boom";
import NodeCache from "@cacheable/node-cache";
import readline from "readline";
import { sendMessage } from "./messages/sendMessage";
import QRCode from "qrcode";
import makeWASocket, {
	type AnyMessageContent,
	BinaryInfo,
	delay,
	DisconnectReason,
	downloadAndProcessHistorySyncNotification,
	encodeWAM,
	fetchLatestBaileysVersion,
	getAggregateVotesInPollMessage,
	getHistoryMsg,
	isJidNewsletter,
	makeCacheableSignalKeyStore,
	proto,
	type WAMessageKey,
	type WAMessageContent,
	useMultiFileAuthState,
} from "baileys";
//import MAIN_LOGGER from '../src/Utils/logger'
import open from "open";
import fs from "fs";
import P from "pino";
import path from "path";
import { lookup, extension } from "mime-types";
import { error } from "console";

const logger = P(
	{ timestamp: () => `,"time":"${new Date().toJSON()}"` },
	P.destination("./wa-logs.txt")
);
logger.level = "silent";

const onDemandMap = new Map<string, string>();
const msgRetryCounterCache = new NodeCache();
const groupCache = new NodeCache({});

const startSock = async () => {
	const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");

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
		msgRetryCounterCache,
		generateHighQualityLinkPreview: true,
		cachedGroupMetadata: async (jid) => groupCache.get(jid),
		getMessage,
	});

	/**
	 * update.status:
	 * PENDING: No enviado.
	 * SERVER_ACK: Enviado al servidor (1 check).
	 * DELIVERY_ACK: Entregado al destinatario (2 checks grises).
   	 + READ: Leído por el destinatario (2 checks azules).
	 * PLAYED: (Para notas de voz, videos) Reproducido.
	 */
	sock.ev.on("messages.update", (updates) => {
		for (const update of updates) {
			if (update.key.fromMe == false) {
				console.log("Estado actualizado:", update);
			}
		}
	});

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

		if (events["labels.association"]) {
			console.log(events["labels.association"]);
		}

		if (events["labels.edit"]) {
			console.log(events["labels.edit"]);
		}

		if (events.call) {
			await new Promise((resolve) => setTimeout(resolve, 2000));

			const call = events.call[0];
			if (call) {
				await sock!.rejectCall(call.id, call.from);
			}
		}

		if (events["messaging-history.set"]) {
			const { chats, contacts, messages, isLatest, progress, syncType } =
				events["messaging-history.set"];
			if (syncType === proto.HistorySync.HistorySyncType.ON_DEMAND) {
				// console.log("received on-demand history sync, messages=", messages);
			}
			console.log(
				`recv ${chats.length} chats, ${contacts.length} contacts, ${messages.length} msgs (is latest: ${isLatest}, progress: ${progress}%), type: ${syncType}`
			);
		}

		if (events["messages.upsert"]) {
			const upsert = events["messages.upsert"];
			// console.log("recv messages ", JSON.stringify(upsert, undefined, 2));

			if (upsert.type === "notify") {
				for (const msg of upsert.messages) {
					const userJid = msg.key.participant || msg.key.remoteJid!;
					const numero = userJid.split("@")[0];

					if (msg.message?.conversation?.length! < 4096) {
						if (!msg.key.fromMe && !isJidNewsletter(msg.key?.remoteJid!)) {
							console.log("replying to", msg.key.remoteJid);
							await sock!.readMessages([msg.key]);

							// sendMessage(sock, msg.key.remoteJid!, "react", "react", {
							// 	key: msg.key,
							// 	emoji: "😊",
							// });
							sendMessage(sock, msg.key.remoteJid!, "txt", "text", {
								text: "aaaa",
								quoted: { key: msg.key, message: msg.message },
							});
						}
					} else {
						throw console.error("El mensaje excede el maximo de caracteres\n\n");
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

		if (events["chats.update"]) {
			console.log(events["chats.update"]);
		}

		if (events["chats.delete"]) {
			console.log("chats deleted ", events["chats.delete"]);
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
