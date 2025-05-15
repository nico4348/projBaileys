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
	(sock: WASocket, msgKey: proto.IMessageKey, jid: string, payload: MediaPayload) => Promise<void>
> = {
	voiceNote: async (sock, msgKey, jid, { url, quoted }) => {
		if (await audioDurationValidator(url)) {
			logStatus(msgKey, 1);
			await sock.sendMessage(jid, { audio: { url }, ptt: true }, { quoted });
			logStatus(msgKey, 2);
		} else {
			logStatus(msgKey, 6);
		}
	},

	audio: async (sock, msgKey, jid, { url, quoted }) => {
		if (await audioDurationValidator(url)) {
			logStatus(msgKey, 1);
			await sock.sendMessage(jid, { audio: { url } }, { quoted });
			logStatus(msgKey, 2);
		} else {
			logStatus(msgKey, 6);
		}
	},

	video: async (sock, msgKey, jid, { url, caption, quoted }) => {
		if (size16MbValidator(url)) {
			logStatus(msgKey, 1);
			await sock.sendMessage(jid, { video: { url }, caption }, { quoted });
			logStatus(msgKey, 2);
		} else {
			logStatus(msgKey, 6);
		}
	},

	image: async (sock, msgKey, jid, { url, caption, quoted }) => {
		if (size16MbValidator(url)) {
			logStatus(msgKey, 1);
			await sock.sendMessage(jid, { image: { url }, caption }, { quoted });
			logStatus(msgKey, 2);
		} else {
			logStatus(msgKey, 6);
		}
	},

	sticker: async (sock, msgKey, jid, { url, quoted }) => {
		if (size16MbValidator(url)) {
			logStatus(msgKey, 1);
			await sock.sendMessage(jid, { sticker: { url } }, { quoted });
			logStatus(msgKey, 2);
		} else {
			logStatus(msgKey, 6);
		}
	},

	document: async (sock, msgKey, jid, { url, caption, quoted }) => {
		if (size2GbValidator(url)) {
			logStatus(msgKey, 1);
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
			logStatus(msgKey, 2);
		} else {
			logStatus(msgKey, 6);
		}
	},
};
