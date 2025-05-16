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
import { verifyOnWhatsApp } from "./downloadMessage";
import { getSocket } from "../socketManager";
import { randomUUID } from "crypto";

export const getHandlers = (mediaType: MediaType): HandlerMap => {
	const maps: Record<MediaType, HandlerMap> = {
		txt: txtHandlers,
		media: mediaHandlers,
		react: reactHandlers,
	};
	return maps[mediaType] || {};
};

export const sendMessage = async (
	from: string,
	to: string,
	mediaType: MediaType, // "txt" | "media" | "react"
	type: string, // "text", "react", "voiceNote", ...
	payload: ReactPayload | MediaPayload | TextPayload,
	msgId: string = randomUUID()
): Promise<string> => {
	const sock: WASocket = getSocket(`sock_${from}`);
	const jid = `${to}@s.whatsapp.net`;

	if (await verifyOnWhatsApp(to, sock)) {
		await sock.presenceSubscribe(jid);
		await delay(500);

		await sock.sendPresenceUpdate("composing", jid);
		await delay(2000);

		await sock.sendPresenceUpdate("paused", jid);

		const handlers = getHandlers(mediaType);
		const fn = handlers[type];
		if (fn) {
			const newId = await fn(sock, msgId, jid, payload);
			return newId;
		} else {
			console.log("nadaaaaaa");
		}
		return msgId;
	} else {
		console.log("Error, Usuario no registrado en Whatsapp");
		return "";
	}
};
// const sockP = getSocket("sock_573144864063");

/**
 * {
	url: "./public/photoshop_reference.pdf",
	caption: "holisss",
	quoted: { key: msg.key, message: msg.message },
	}
 */
