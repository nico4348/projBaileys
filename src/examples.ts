/**
 * Aqui van a ir los ejemplos para enviar mensajes
 *
 */

await sendMediaImage(
	{
		image: {
			url: "./public/WhatsApp Image 2025-05-12 at 3.55.02 PM.jpeg",
		},
		caption: "",
	},
	msg.key.remoteJid!
);

await sendMediaVideo(
	{
		video: { url: "" },
		caption: "Mira este video",
	},
	msg.key.remoteJid!
);

await sendMediaAudio(
	{
		audio: { url: "./public/WhatsApp Audio 2025-05-12 at 3.56.37 PM.ogg" },
		mimetype: "audio/ogg", // Puedes usar 'audio/ogg; codecs=opus' si quieres que sea como nota de voz
	},
	msg.key.remoteJid!
);

await sendMediaDocument(
	{
		document: { url: "./public/ghq-12.pdf" },
		fileName: "documento.pdf",
		mimetype: "application/pdf",
	},
	msg.key.remoteJid!
);

await sendMediaSticker(
	{
		sticker: { url: "./public/a5536ea5-e14c-43aa-baf2-9c73332c6996.webp" },
	},
	msg.key.remoteJid!
);
