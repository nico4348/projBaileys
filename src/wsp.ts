import { Boom } from "@hapi/boom";
import NodeCache from "@cacheable/node-cache";
import makeWASocket, {
	fetchLatestBaileysVersion,
	Browsers,
	DisconnectReason,
	proto,
	useMultiFileAuthState,
	makeCacheableSignalKeyStore,
	isJidNewsletter,
	type WAMessageKey,
} from "baileys";
import P from "pino";
import { sendMessage } from "./messages/sendMessage";
import { downloadMedia } from "./messages/downloadMessage";
import fs from "fs/promises";
import path from "path";
/**
 * Función global exportada para loguear estados de mensajes.
 */
export function logStatus(key: WAMessageKey, status: number, prev: number = 0) {
	const names: Record<number, string> = {
		0: "Mensaje Usuario Recibido",
		1: "Respuesta Validada",
		[proto.WebMessageInfo.Status.SERVER_ACK]: "Enviado al Servidor",
		[proto.WebMessageInfo.Status.DELIVERY_ACK]: "Entregado al Destinatario",
		[proto.WebMessageInfo.Status.READ]: "Leído",
		[proto.WebMessageInfo.Status.PLAYED]: "Reproducido",
		6: "Entrega Fallida",
	};
	if (status > prev) {
		console.log(`➡️ Mensaje ${key.id}: ${names[status] || status}`);
	}
}

interface NumberConfig {
	number: string;
	authFolder: string;
}

export class WhatsAppBot {
	private sock: ReturnType<typeof makeWASocket> | null = null;
	private logger = P(
		{ timestamp: () => `,'time':'${new Date().toISOString()}'` },
		P.destination("./wa-logs.txt")
	);
	private retryCache = new NodeCache();
	private lastStatus = new Map<string, number>();

	constructor(private config: NumberConfig) {
		this.logger.level = "silent";
	}

	public async start() {
		const { number, authFolder } = this.config;
		const { state, saveCreds } = await useMultiFileAuthState(authFolder);
		const { version } = await fetchLatestBaileysVersion();

		this.sock = makeWASocket({
			version,
			logger: this.logger,
			printQRInTerminal: true,
			auth: {
				creds: state.creds,
				keys: makeCacheableSignalKeyStore(state.keys, this.logger),
			},
			browser: Browsers.ubuntu(`MultiBot_${number}`),
		});

		this.sock.ev.on("connection.update", (update) => {
			if (update.qr) {
				console.log(`Se ha generado un nuevo QR para ${number}`);
			}
		});

		this.sock.ev.on("creds.update", saveCreds);
		this.registerEventHandlers();

		console.log(`✅ Bot inicializado para ${number}`);
	}

	private registerEventHandlers() {
		if (!this.sock) return;

		this.sock.ev.on("connection.update", ({ connection, lastDisconnect }) =>
			this.onConnectionUpdate(connection ?? "", lastDisconnect)
		);

		this.sock.ev.on("messages.update", (updates) => this.onMessageAckUpdates(updates));

		this.sock.ev.on("messages.upsert", async (upsert) => this.onIncomingMessages(upsert));
	}

	private isReconnecting = false;

	private async onConnectionUpdate(connection: string, lastDisconnect: any) {
		const { number } = this.config;
		if (connection === "close") {
			if (this.isReconnecting) return;
			this.isReconnecting = true;

			if (
				(lastDisconnect?.error as Boom)?.output?.statusCode === DisconnectReason.loggedOut
			) {
				console.log(`Sesión cerrada para ${number}, borrando credenciales...`);

				// Borrar la carpeta de autenticación de Baileys
				try {
					await fs.rm(this.config.authFolder, { recursive: true, force: true });
					console.log("Carpeta de autenticación eliminada.");
				} catch (err) {
					console.error("Error al borrar la carpeta de autenticación:", err);
				}

				console.log(`Sesión cerrada para ${number}, pero se intentará reconectar...`);
			} else {
				console.log(`Reconectando ${number}...`);
			}
			await this.restartBot();

			this.isReconnecting = false;
		} else if (connection === "open") {
			console.log(`Conexión abierta para ${number}`);
		}
	}

	private onMessageAckUpdates(updates: any[]) {
		for (const u of updates) {
			if (!u.key.fromMe) continue;
			const prev = this.lastStatus.get(u.key.id) || 0;
			const status = u.update?.status;
			if (status !== undefined) {
				logStatus(u.key, status, prev);
				this.lastStatus.set(u.key.id, status);
			}
		}
	}

	private async onIncomingMessages(upsert: any) {
		if (upsert.type !== "notify" || !this.sock) return;

		for (const msg of upsert.messages) {
			if (msg.key.fromMe) continue;
			if (isJidNewsletter(msg.key.remoteJid!)) continue;

			logStatus(msg.key, 0, 0);
			downloadMedia(msg);

			console.log("🔔 Nuevo mensaje de", msg.key.remoteJid);

			await this.sock.readMessages([msg.key]);
			await sendMessage(this.sock, msg.key, msg.key.remoteJid!, "media", "video", {
				url: "./public/DSC0603-1.webp",
				caption: "holisss",
				quoted: { key: msg.key, message: msg.message },
			});
		}
	}

	private async restartBot() {
		if (this.sock) {
			try {
				console.log(`Cerrando sesión previa para ${this.config.number}`);
				this.sock.end(undefined);
			} catch (e) {
				console.error(`Error cerrando sesión previa para ${this.config.number}:`, e);
			}
			this.sock = null;
		}
		await this.start();
	}
}

// Inicializar bots
const configs: NumberConfig[] = [
	{ number: "573144864063", authFolder: "baileys_auth_info_2" },
	{ number: "573022949109", authFolder: "baileys_auth_info_1" },
];

configs.forEach((cfg) => {
	const bot = new WhatsAppBot(cfg);
	bot.start().catch(console.error);
});
