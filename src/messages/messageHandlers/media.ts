// handlers/media.ts
import { type WASocket } from "baileys";
import { type MediaPayload } from "../messageTypes";
import path from "path";
import { lookup } from "mime-types";

export const mediaHandlers: Record<
	string,
	(sock: WASocket, jid: string, payload: MediaPayload) => Promise<void>
> = {
	voiceNote: async (sock, jid, { url, quoted }) => {
		await sock.sendMessage(jid, { audio: { url }, ptt: true }, { quoted });
	},

	audio: async (sock, jid, { url, quoted }) => {
		await sock.sendMessage(jid, { audio: { url } }, { quoted });
	},

	video: async (sock, jid, { url, caption, quoted }) => {
		await sock.sendMessage(jid, { video: { url }, caption }, { quoted });
	},

	image: async (sock, jid, { url, caption, quoted }) => {
		await sock.sendMessage(jid, { image: { url }, caption }, { quoted });
	},

	sticker: async (sock, jid, { url, quoted }) => {
		await sock.sendMessage(jid, { sticker: { url } }, { quoted });
	},

	document: async (sock, jid, { url, caption, quoted }) => {
		const fileName = path.basename(url);
		const mimetype = lookup(url) || "application/octet-stream";
		await sock.sendMessage(
			jid,
			{
				document: { url },
				caption,
				fileName,
				mimetype,
			},
			{ quoted }
		);
	},
};
