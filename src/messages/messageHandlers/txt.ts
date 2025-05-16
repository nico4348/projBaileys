import { proto, type WASocket } from "baileys";
import { type TextPayload } from "../messageTypes";
import { textValidator } from "../validators/messageValidators";
import { logStatus } from "../../wsp";
import { randomUUID } from "crypto";

export const txtHandlers: Record<
	string,
	(sock: WASocket, msgId: string, jid: string, payload: TextPayload) => Promise<string>
> = {
	text: async (sock, msgId, jid, { text, quoted }) => {
		if (textValidator(text)) {
			logStatus(msgId, 1);
			const msg = await sock.sendMessage(jid, { text }, { quoted });
			logStatus(msgId, 2);
			return msg?.key.id ?? "";
		} else {
			logStatus(msgId, 6);
			return "";
		}
	},
};
