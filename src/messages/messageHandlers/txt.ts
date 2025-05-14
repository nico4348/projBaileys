import { type WASocket } from "baileys";
import { type TextPayload } from "../messageTypes";
import { textValidator } from "../validators/messageValidators";

export const txtHandlers: Record<
	string,
	(sock: WASocket, jid: string, payload: TextPayload) => Promise<void>
> = {
	text: async (sock, jid, { text, quoted }) => {
		if (textValidator(text)) await sock.sendMessage(jid, { text }, { quoted });
	},
};
