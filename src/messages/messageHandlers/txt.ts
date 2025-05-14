import { type WASocket } from "baileys";
import { type TextPayload } from "../messageTypes";

export const txtHandlers: Record<
	string,
	(sock: WASocket, jid: string, payload: TextPayload) => Promise<void>
> = {
	text: async (sock, jid, { text, quoted }) => {
		if (text.length > 4096) {
			return;
		}
		await sock.sendMessage(jid, { text }, { quoted });
	},
};
