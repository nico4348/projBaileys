import fs from "fs";
import path from "path";
import { downloadContentFromMessage, type WASocket } from "baileys";

const MEDIA_DIR = path.join(__dirname, "../../media");

// Asegura que exista la carpeta media
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const MEDIA_INFO: Record<
	string,
	{ ext: string; type: "image" | "video" | "audio" | "sticker" | "document" }
> = {
	imageMessage: { ext: ".jpg", type: "image" },
	videoMessage: { ext: ".mp4", type: "video" },
	audioMessage: { ext: ".mp3", type: "audio" },
	stickerMessage: { ext: ".webp", type: "sticker" },
	documentMessage: { ext: "", type: "document" }, // Extensión y nombre dinámicos
};

const getMediaInfo = (msg: any) => {
	const mediaType = Object.keys(msg.message || {})[0];
	const info = MEDIA_INFO[mediaType!];
	if (!info) return null;

	let ext = info.ext;
	let filename = `${msg.key.id}${ext}`;

	if (mediaType === "documentMessage") {
		const doc = msg.message.documentMessage;
		ext = "." + (doc?.mimetype?.split("/")[1] || "bin");
		filename = doc?.fileName || `${msg.key.id}${ext}`;
	}

	return { mediaType, ext, type: info.type, filename };
};

const saveBufferToFile = async (buffer: Buffer, filename: string) => {
	const filePath = path.join(MEDIA_DIR, filename);
	await fs.promises.writeFile(filePath, buffer);
	console.log("✅ Guardado:", filePath);
};

export const downloadMedia = async (msg: any): Promise<void> => {
	if (!msg.message || msg.key.fromMe) return;

	const info = getMediaInfo(msg);
	if (!info) return;

	const stream = await downloadContentFromMessage(
		(msg.message as any)[info.mediaType!],
		info.type
	);
	const chunks = [];
	for await (const chunk of stream) chunks.push(chunk);

	const buffer = Buffer.concat(chunks);
	await saveBufferToFile(buffer, info.filename);
};

export const verifyOnWhatsApp = async (to: string, sock: WASocket): Promise<boolean> => {
	if (!sock) return false;

	try {
		const result = await sock.onWhatsApp(`${to}@s.whatsapp.net`);
		if (result && result[0]?.exists) return true;
		return false;
	} catch (error) {
		console.error("Error al verificar número en WhatsApp:", error);
		return false;
	}
};
