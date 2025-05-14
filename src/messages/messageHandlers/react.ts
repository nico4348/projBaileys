import { proto, type WASocket } from "baileys";
import { type ReactPayload } from "../messageTypes";

export const reactHandlers: Record<
	string,
	(sock: WASocket, msgKey: proto.IMessageKey, jid: string, payload: ReactPayload) => Promise<void>
> = {
	react: async (sock, msgKey, jid, { key, emoji }) => {
		await sock.sendMessage(jid, { react: { key: key, text: emoji } });
		return;
	},
};
