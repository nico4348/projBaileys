import { type WASocket } from "baileys";

const activeSockets = new Map<string, WASocket>();

export const addSocket = (sessionId: string, sock: WASocket) => {
	activeSockets.set(sessionId, sock);
};

export const removeSocket = (sessionId: string) => {
	activeSockets.delete(sessionId);
};

export const getSocket = (sessionId: string): WASocket => {
	const socket = activeSockets.get(sessionId);
	if (!socket) {
		throw new Error(`No existe el Socket para ID: ${sessionId}`);
	}
	return socket;
};
