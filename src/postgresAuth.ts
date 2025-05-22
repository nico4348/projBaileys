import { Pool } from "pg";
import { proto, generateRegistrationId, Curve, signedKeyPair } from "baileys";
import { randomBytes } from "crypto";
import { v4 as uuidv4 } from "uuid";

// Utility functions for converting between buffer and JSON
function bufferToJSON(obj: any): any {
	if (Buffer.isBuffer(obj)) {
		return { type: "Buffer", data: Array.from(obj) };
	} else if (Array.isArray(obj)) {
		return obj.map(bufferToJSON);
	} else if (typeof obj === "object" && obj !== null) {
		if (typeof obj.toJSON === "function") {
			return obj.toJSON();
		}
		const result: { [key: string]: any } = {};
		for (const key in obj) {
			if (Object.prototype.hasOwnProperty.call(obj, key)) {
				result[key] = bufferToJSON(obj[key]);
			}
		}
		return result;
	}
	return obj;
}

function jsonToBuffer(obj: any): any {
	if (obj && obj.type === "Buffer" && Array.isArray(obj.data)) {
		return Buffer.from(obj.data);
	} else if (Array.isArray(obj)) {
		return obj.map(jsonToBuffer);
	} else if (typeof obj === "object" && obj !== null) {
		const result: { [key: string]: any } = {};
		for (const key in obj) {
			if (Object.prototype.hasOwnProperty.call(obj, key)) {
				result[key] = jsonToBuffer(obj[key]);
			}
		}
		return result;
	}
	return obj;
}

// Function to initialize authentication credentials
export const initAuthCreds = () => {
	const identityKey = Curve.generateKeyPair();
	return {
		noiseKey: Curve.generateKeyPair(),
		signedIdentityKey: identityKey,
		signedPreKey: signedKeyPair(identityKey, 1),
		registrationId: generateRegistrationId(),
		advSecretKey: randomBytes(32).toString("base64"),
		processedHistoryMessages: [],
		nextPreKeyId: 1,
		firstUnuploadedPreKeyId: 1,
		accountSyncCounter: 0,
		accountSettings: {
			unarchiveChats: false,
		},
		deviceId: randomBytes(16).toString("base64"),
		phoneId: uuidv4(),
		identityId: randomBytes(20),
		registered: false,
		backupToken: randomBytes(20),
		registration: {},
		pairingEphemeralKeyPair: Curve.generateKeyPair(),
		pairingCode: undefined,
		lastPropHash: undefined,
		routingInfo: undefined,
	};
};

// Class to handle PostgreSQL operations
class PostgreSQLAuthState {
	private pool: Pool;
	private sessionId: string;

	constructor(poolOrConfig: Pool | any, sessionId: string) {
		this.pool = poolOrConfig instanceof Pool ? poolOrConfig : new Pool(poolOrConfig);
		this.sessionId = sessionId;
		this.ensureTableExists();
	}

	private async ensureTableExists() {
		const query = `
            CREATE TABLE IF NOT EXISTS auth_data (
                session_key VARCHAR(255) PRIMARY KEY,
                data TEXT NOT NULL
            )
        `;
		await this.executeQuery(query);
	}

	private getKey(key: string): string {
		return `${this.sessionId}:${key}`;
	}

	private async executeQuery(query: string, params: any[] = []): Promise<any[]> {
		const client = await this.pool.connect();
		try {
			const result = await client.query(query, params);
			return result.rows;
		} finally {
			client.release();
		}
	}

	async writeData(key: string, data: any): Promise<void> {
		const serialized = JSON.stringify(bufferToJSON(data));
		await this.executeQuery(
			"INSERT INTO auth_data (session_key, data) VALUES ($1, $2) ON CONFLICT (session_key) DO UPDATE SET data = EXCLUDED.data",
			[this.getKey(key), serialized]
		);
	}

	async readData(key: string): Promise<any | null> {
		const rows = await this.executeQuery("SELECT data FROM auth_data WHERE session_key = $1", [
			this.getKey(key),
		]);
		return rows.length ? jsonToBuffer(JSON.parse(rows[0].data)) : null;
	}

	async removeData(key: string): Promise<void> {
		await this.executeQuery("DELETE FROM auth_data WHERE session_key = $1", [this.getKey(key)]);
	}

	async getAuthState() {
		const creds = (await this.readData("auth_creds")) || initAuthCreds();
		return {
			creds,
			keys: {
				get: async (type: string, ids: string[]) => {
					const data: { [key: string]: any } = {};
					await Promise.all(
						ids.map(async (id) => {
							const value = await this.readData(`${type}-${id}`);
							if (type === "app-state-sync-key" && value) {
								data[id] = proto.Message.AppStateSyncKeyData.fromObject(value);
							} else {
								data[id] = value;
							}
						})
					);
					return data;
				},
				set: async (data: { [key: string]: { [key: string]: any } }) => {
					const tasks = Object.entries(data).flatMap(([category, categoryData]) =>
						Object.entries(categoryData || {}).map(([id, value]) => {
							const key = `${category}-${id}`;
							return value ? this.writeData(key, value) : this.removeData(key);
						})
					);
					await Promise.all(tasks);
				},
			},
		};
	}

	async saveCreds(creds: any): Promise<void> {
		await this.writeData("auth_creds", creds);
	}

	async deleteSession(): Promise<void> {
		await this.executeQuery("DELETE FROM auth_data WHERE session_key LIKE $1", [
			`${this.sessionId}:%`,
		]);
	}
}

// Function to use PostgreSQL Authentication State
export async function usePostgreSQLAuthState(poolOrConfig: Pool | any, sessionId: string) {
	const authState = new PostgreSQLAuthState(poolOrConfig, sessionId);
	const state = await authState.getAuthState();

	return {
		state,
		saveCreds: async () => {
			await authState.saveCreds(state.creds);
		},
		deleteSession: async () => {
			await authState.deleteSession();
		},
	};
}
