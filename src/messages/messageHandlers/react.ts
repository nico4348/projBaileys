import { type WASocket } from "baileys";
import { type ReactPayload } from "../messageTypes";

export const reactHandlers: Record<
	string,
	(sock: WASocket, jid: string, payload: ReactPayload) => Promise<void>
> = {
	react: async (sock, jid, { key, emoji }) => {
		await sock.sendMessage(jid, { react: { key: key, text: emoji } });
		return;
	},
};
