import { proto, type WASocket } from "baileys";
import { type ReactPayload } from "../messageTypes";

export const reactHandlers: Record<
	string,
	(sock: WASocket, msgId: string, jid: string, payload: ReactPayload) => Promise<string>
> = {
	react: async (sock, msgId, jid, { key, emoji }) => {
		const msg = await sock.sendMessage(jid, { react: { key: key, text: emoji } });
		// console.log(JSON.stringify(msg));
		return msg?.key.id ?? "";
	},
};
