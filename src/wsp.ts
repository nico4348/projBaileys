import { Boom } from "@hapi/boom";
import NodeCache from "@cacheable/node-cache";
import readline from "readline";
import QRCode from "qrcode";
import makeWASocket, {
	type AnyMessageContent,
	BinaryInfo,
	delay,
	makeInMemoryStore,
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
import { stringify } from "querystring";

const store = makeInMemoryStore({
	logger: P({ level: "silent" }),
});
const logger = P(
	{ timestamp: () => `,"time":"${new Date().toJSON()}"` },
	P.destination("./wa-logs.txt")
);
logger.level = "silent";

const onDemandMap = new Map<string, string>();
// external map to store retry counts of messages when decryption/encryption fails
// keep this out of the socket itself, so as to prevent a message decryption/encryption loop across socket restarts
const msgRetryCounterCache = new NodeCache();
const groupCache = new NodeCache({});

// start a connection
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
		// ignore all broadcast messages -- to receive the same
		// comment the line below out
		// shouldIgnoreJid: jid => isJidBroadcast(jid),
		// implement to handle retries & poll updates
		getMessage,
	});

	// } else if (msg.message?.stickerMessage) {
	// 	console.log("[[[[EL MENSAJE ES UN STICKER]]]]");
	// } else {
	// 	console.log("[[[[EL MENSAJE ES UN ALGO]]]]");
	// }

	const sendMessage = async (jid: string, type: string, payload: any) => {
		switch (type) {
			case "text":
				await sock.sendMessage(jid, { text: payload.text });
				break;

			case "textQuoted":
				await sock.sendMessage(jid, { text: payload.text }, { quoted: payload.quoted });

				break;

			case "voiceNote":
				await sock.sendMessage(jid, { audio: { url: payload.url }, ptt: true });

				break;

			case "audio":
				await sock.sendMessage(jid, { audio: { url: payload.url } });

				break;

			case "video":
				await sock.sendMessage(jid, {
					video: { url: payload.url },
					caption: payload.caption,
				});

				break;

			case "image":
				await sock.sendMessage(jid, {
					image: { url: payload.url },
					caption: payload.caption,
				});

				break;

			case "document":
				const nombreArchivo = path.basename(payload.url);
				const tipoMime = lookup(payload.url) || "application/octet-stream";

				await sock.sendMessage(jid, {
					document: { url: payload.url },
					fileName: nombreArchivo,
					mimetype: tipoMime,
				});

				break;

			case "reaction":
				await sock.sendMessage(jid, {
					react: {
						key: payload.key,
						text: payload.emoji,
					},
				});

				break;

			case "sticker":
				await sock.sendMessage(jid, { sticker: payload.url });

				break;

			default:
				console.log("nadaaaaaa");
				break;
		}
	};

	//! const saveFiles = async (url: string, name: string = Date.now().toString(), mime: string) => {
	// 	let mimetype = mime.split("/")[1];
	// 	if (mimetype?.includes(";")) {
	// 		mimetype.split(";")[0];
	// 	}
	// 	console.log(mimetype);

	// 	fs.writeFile(`${name}.${mimetype}`, url, (err) => {
	// 		if (err) {
	// 			console.error("Error al guardar el archivo:", err);
	// 		} else {
	// 			console.log("Archivo guardado correctamente.");
	// 		}
	// 	});
	// };

	const sendMessageWQuote = async (msg: AnyMessageContent, jid: string, quoted = undefined) => {
		await sock.presenceSubscribe(jid);
		await delay(500);

		await sock.sendPresenceUpdate("composing", jid);
		await delay(2000);

		await sock.sendPresenceUpdate("paused", jid);

		await sock.sendMessage(jid, msg, { quoted });
	};

	const sendMessageWTyping = async (msg: AnyMessageContent, jid: string, quoted = undefined) => {
		await sock.presenceSubscribe(jid);
		await delay(500);

		await sock.sendPresenceUpdate("composing", jid);
		await delay(2000);

		await sock.sendPresenceUpdate("paused", jid);
		if (quoted) {
			await sock.sendMessage(jid, msg, { quoted });
		} else {
			await sock.sendMessage(jid, msg);
		}
	};

	store.bind(sock.ev);
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
				console.log("received on-demand history sync, messages=", messages);
			}
			console.log(
				`recv ${chats.length} chats, ${contacts.length} contacts, ${messages.length} msgs (is latest: ${isLatest}, progress: ${progress}%), type: ${syncType}`
			);
		}

		if (events["messages.upsert"]) {
			const upsert = events["messages.upsert"];
			console.log("recv messages ", JSON.stringify(upsert, undefined, 2));

			if (upsert.type === "notify") {
				for (const msg of upsert.messages) {
					const userJid = msg.key.participant || msg.key.remoteJid!;
					const numero = userJid.split("@")[0];

					if (!msg.key.fromMe && !isJidNewsletter(msg.key?.remoteJid!)) {
						console.log("replying to", msg.key.remoteJid);
						await sock!.readMessages([msg.key]);

						sendMessage(msg.key.remoteJid!, "sticker", {
							key: msg.key,
							text: "😊",
						});
						// await sendMessageWQuote({ text: "Hello there!" }, msg.key.remoteJid!, msg);
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

		if (events["chats.delete"]) {
			console.log("chats deleted ", events["chats.delete"]);
		}
	});

	return sock;

	async function getMessage(key: WAMessageKey): Promise<WAMessageContent | undefined> {
		console.log("[getMessage]");
		return proto.Message.fromObject({});
	}
};

startSock();
