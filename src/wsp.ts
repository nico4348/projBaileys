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
} from "baileys";
import P from "pino";
import { sendMessage } from "./messages/sendMessage";
import { downloadMedia } from "./messages/downloadMessage";
import fs from "fs/promises";
import { addSocket } from "./socketManager";

import { usePostgreSQLAuthState, initAuthCreds } from "./postgresAuth";

// Configuración de conexión a PostgreSQL para postgres-baileys
const postgreSQLConfig = {
	host: "localhost",
	port: 5432,
	user: "postgres",
	password: "root",
	database: "pruebaNest",
};
/**
 * Función global exportada para loguear estados de mensajes.
 */
export function logStatus(msgId: string, status: number, prev: number = 0) {
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
		console.log(`➡️ Mensaje ${msgId}: ${names[status] || status}`);
	}
}

interface NumberConfig {
	number: string;
	authFolder: string;
}

export class WhatsAppBot {
	public from: string;
	public id: string;
	private sock: ReturnType<typeof makeWASocket> | null = null;
	private logger = P(
		{ timestamp: () => `,'time':'${new Date().toISOString()}'` },
		P.destination("./wa-logs.txt")
	);
	private retryCache = new NodeCache();
	private lastStatus = new Map<string, number>();

	constructor(private config: NumberConfig) {
		this.from = config.number;
		this.id = `sock_${config.number}`; // puedes personalizar esto
		this.logger.level = "silent";
	}

	public async start() {
		const { number, authFolder } = this.config;
		const { state, saveCreds } = await usePostgreSQLAuthState(
			postgreSQLConfig,
			"your-unique-session-id"
		);
		const { version } = await fetchLatestBaileysVersion();
		this.sock = makeWASocket({
			version,
			logger: this.logger,
			printQRInTerminal: true,
			msgRetryCounterCache: this.retryCache,
			auth: state,
			browser: Browsers.ubuntu(`MultiBot_${number}`),
			generateHighQualityLinkPreview: true,
		});

		addSocket(this.id, this.sock);
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

		this.sock.ev.on("messages.update", (updates) => {
			this.onMessageAckUpdates(updates);
		});

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
				logStatus(u.key.id, status, prev);
				this.lastStatus.set(u.key.id, status);
			}
		}
	}

	private async onIncomingMessages(upsert: any) {
		if (upsert.type !== "notify" || !this.sock) return;

		for (const msg of upsert.messages) {
			const to = msg.key.remoteJid.split("@")[0];
			if (msg.key.fromMe) continue;
			if (isJidNewsletter(msg.key.remoteJid!)) continue;

			console.log("🔔 Nuevo mensaje de", msg.key.remoteJid);
			logStatus(msg.key.id, 0);
			downloadMedia(msg);

			console.log(JSON.stringify(msg, null, 2));
			await this.sock.readMessages([msg.key]);
			const newId = await sendMessage(
				this.from,
				to,
				"media",
				"video",
				{
					url: "./public/VID-20250513-WA0026.mp4",
					caption: "holisss",
					quoted: { key: msg.key, message: msg.message },
				},
				msg.key.id
			);
			console.log(newId);
			//*actualizar todos los id con el newId
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
	{ number: "573229781433", authFolder: "baileys_auth_info_2" },
	// { number: "573022949109", authFolder: "baileys_auth_info_1" },
];

configs.forEach((cfg) => {
	const bot = new WhatsAppBot(cfg);
	bot.start().catch(console.error);
});
