// handlers/media.ts
import { type WASocket } from "baileys";
import { type MediaPayload } from "../messageTypes";
import path from "path";
import { lookup } from "mime-types";

export const mediaHandlers: Record<
	string,
	(sock: WASocket, jid: string, payload: MediaPayload) => Promise<void>
> = {
	voiceNote: async (sock, jid, { url }) => {
		await sock.sendMessage(jid, { audio: { url }, ptt: true });
	},

	audio: async (sock, jid, { url }) => {
		await sock.sendMessage(jid, { audio: { url } });
	},

	video: async (sock, jid, { url, caption }) => {
		await sock.sendMessage(jid, { video: { url }, caption });
	},

	image: async (sock, jid, { url, caption }) => {
		await sock.sendMessage(jid, { image: { url }, caption });
	},

	sticker: async (sock, jid, { url }) => {
		await sock.sendMessage(jid, { sticker: { url } });
	},

	document: async (sock, jid, { url }) => {
		const fileName = path.basename(url);
		const mimetype = lookup(url) || "application/octet-stream";
		await sock.sendMessage(jid, {
			document: { url },
			fileName,
			mimetype,
		});
	},
};
