import { proto, type WASocket } from "baileys";
import { type TextPayload } from "../messageTypes";
import { textValidator } from "../validators/messageValidators";
import { logStatus } from "../../wsp";

export const txtHandlers: Record<
	string,
	(sock: WASocket, msgKey: proto.IMessageKey, jid: string, payload: TextPayload) => Promise<void>
> = {
	text: async (sock, msgKey, jid, { text, quoted }) => {
		if (textValidator(text)) {
			logStatus(msgKey, 1);
			await sock.sendMessage(jid, { text }, { quoted });
		} else {
			logStatus(msgKey, 6);
		}
	},
};
