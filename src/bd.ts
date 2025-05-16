import {
	proto,
	initAuthCreds,
	BufferJSON,
	type SignalDataTypeMap,
	type AuthenticationCreds,
	type SignalKeyStore,
	type AuthenticationState,
} from "baileys"; // Actualizado a la importación correcta
import { Pool } from "pg";

const pool = new Pool({
	user: "postgres",
	host: "localhost",
	database: "baileys_pruebas",
	password: "root",
	port: 5432,
});

// Definir el tipo para los resultados de la consulta
interface AuthRow {
	data: string;
}

// Cargar credenciales desde PostgreSQL
async function loadCredsFromDB(): Promise<AuthenticationCreds> {
	const res = await pool.query<AuthRow>("SELECT data FROM baileys_auth ORDER BY id DESC LIMIT 1");
	if (res.rowCount && res.rowCount > 0 && res.rows[0]) {
		console.log("✅ Credenciales cargadas de PostgreSQL");
		return BufferJSON.reviver("", JSON.parse(res.rows[0].data));
	} else {
		console.log("🆕 No hay credenciales, inicializando nuevas credenciales");
		return initAuthCreds();
	}
}

// Guardar credenciales en PostgreSQL
async function saveCredsToDB(creds: AuthenticationCreds): Promise<void> {
	try {
		await pool.query("DELETE FROM baileys_auth");
		await pool.query("INSERT INTO baileys_auth (data) VALUES ($1)", [
			JSON.stringify(BufferJSON.replacer("", creds)),
		]);
		console.log("💾 Credenciales guardadas en PostgreSQL");
	} catch (error) {
		console.error("❌ Error guardando credenciales en DB:", error);
	}
}

// Implementación personalizada de AuthState usando Postgres
export async function usePostgresAuthState(): Promise<{
	state: AuthenticationState;
	saveCreds: () => Promise<void>;
}> {
	const creds = await loadCredsFromDB();
	const keys: SignalDataTypeMap = {} as SignalDataTypeMap;

	const keyStore: SignalKeyStore = {
		get: async (type, ids) => {
			const keyType = keys[type];
			const result: { [id: string]: SignalDataTypeMap[typeof type] } = {};
			if (keyType && typeof keyType === "object" && !Array.isArray(keyType)) {
				for (const id of ids) {
					const value = (keyType as Record<string, any>)[id];
					if (value !== undefined) {
						result[id] = value;
					}
				}
			}
			return result;
		},
		set: async (data) => {
			for (const category in data) {
				const categoryTyped = category as keyof SignalDataTypeMap;
				if (!keys[categoryTyped]) {
					keys[categoryTyped] = {} as any;
				}
				Object.assign(keys[categoryTyped], data[categoryTyped]);
			}
		},
		clear: async () => {
			for (const key in keys) {
				const keyTyped = key as keyof SignalDataTypeMap;
				delete keys[keyTyped];
			}
		},
	};

	return {
		state: {
			creds,
			keys: keyStore,
		},
		saveCreds: async () => await saveCredsToDB(creds),
	};
}
