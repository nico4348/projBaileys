// sendMessage.ts

import { txtHandlers } from "./messageHandlers/txt";
import { mediaHandlers } from "./messageHandlers/media";
import { reactHandlers } from "./messageHandlers/react";
import { delay, type WASocket } from "baileys";
import {
	type MediaType,
	type HandlerMap,
	type ReactPayload,
	type MediaPayload,
	type TextPayload,
} from "./messageTypes";

export const getHandlers = (mediaType: MediaType): HandlerMap => {
	const maps: Record<MediaType, HandlerMap> = {
		txt: txtHandlers,
		media: mediaHandlers,
		react: reactHandlers,
	};
	return maps[mediaType] || {};
};

export const sendMessage = async (
	sock: WASocket,
	jid: string,
	mediaType: MediaType, // "txt" | "media" | "react"
	type: string, // "text", "react", "voiceNote", ...
	payload: ReactPayload | MediaPayload | TextPayload
) => {
	await sock.presenceSubscribe(jid);
	await delay(500);

	await sock.sendPresenceUpdate("composing", jid);
	await delay(2000);

	await sock.sendPresenceUpdate("paused", jid);

	const handlers = getHandlers(mediaType);
	const fn = handlers[type];
	if (fn) {
		await fn(sock, jid, payload);
	} else {
		console.log("nadaaaaaa");
	}
};

/**
 * {
	url: "./public/photoshop_reference.pdf",
	caption: "holisss",
	quoted: { key: msg.key, message: msg.message },
	}
 */
