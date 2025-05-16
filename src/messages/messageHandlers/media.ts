// handlers/media.ts
import { proto, type WASocket } from "baileys";
import { type MediaPayload } from "../messageTypes";
import path from "path";
import { lookup } from "mime-types";
import {
	audioDurationValidator,
	size16MbValidator,
	size2GbValidator,
} from "../validators/messageValidators";
import { logStatus } from "../../wsp";

export const mediaHandlers: Record<
	string,
	(sock: WASocket, msgId: string, jid: string, payload: MediaPayload) => Promise<string>
> = {
	voiceNote: async (sock, msgId, jid, { url, quoted }) => {
		if (await audioDurationValidator(url)) {
			logStatus(msgId, 1);
			const msg = await sock.sendMessage(jid, { audio: { url }, ptt: true }, { quoted });
			logStatus(msgId, 2);
			return msg?.key.id ?? "";
		} else {
			logStatus(msgId, 6);
			return "";
		}
	},

	audio: async (sock, msgId, jid, { url, quoted }) => {
		if (await audioDurationValidator(url)) {
			logStatus(msgId, 1);
			const msg = await sock.sendMessage(jid, { audio: { url } }, { quoted });
			logStatus(msgId, 2);
			return msg?.key.id ?? "";
		} else {
			logStatus(msgId, 6);
			return "";
		}
	},

	video: async (sock, msgId, jid, { url, caption, quoted }) => {
		if (size16MbValidator(url)) {
			logStatus(msgId, 1);
			console.log(msgId);
			const msg = await sock.sendMessage(jid, { video: { url }, caption }, { quoted });
			logStatus(msgId, 2);
			return msg?.key.id ?? "";
		} else {
			logStatus(msgId, 6);
			return "";
		}
	},

	image: async (sock, msgId, jid, { url, caption, quoted }) => {
		if (size16MbValidator(url)) {
			logStatus(msgId, 1);
			const msg = await sock.sendMessage(jid, { image: { url }, caption }, { quoted });
			logStatus(msgId, 2);
			return msg?.key.id ?? "";
		} else {
			logStatus(msgId, 6);
			return "";
		}
	},

	sticker: async (sock, msgId, jid, { url, quoted }) => {
		if (size16MbValidator(url)) {
			logStatus(msgId, 1);
			const msg = await sock.sendMessage(jid, { sticker: { url } }, { quoted });
			logStatus(msgId, 2);
			return msg?.key.id ?? "";
		} else {
			logStatus(msgId, 6);
			return "";
		}
	},

	document: async (sock, msgId, jid, { url, caption, quoted }) => {
		if (size2GbValidator(url)) {
			logStatus(msgId, 1);
			const fileName = path.basename(url);
			const mimetype = lookup(url) || "application/octet-stream";
			const msg = await sock.sendMessage(
				jid,
				{
					document: { url },
					caption,
					fileName,
					mimetype,
				},
				{ quoted }
			);
			logStatus(msgId, 2);
			return msg?.key.id ?? "";
		} else {
			logStatus(msgId, 6);
			return "";
		}
	},
};
