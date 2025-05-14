// messageTypes.ts
import type { WASocket, proto } from "baileys";

export type MediaType = "txt" | "media" | "react";

export interface TextPayload {
	text: string;
	quoted?: { key: any; message: any };
}
export interface MediaPayload {
	url: string;
	caption?: string;
	ptt?: boolean;
	quoted?: { key: any; message: any };
}
export interface ReactPayload {
	key: proto.IMessageKey;
	emoji: string;
}

export type HandlerMap = Record<
	string,
	(sock: WASocket, jid: string, payload: any) => Promise<void>
>;
