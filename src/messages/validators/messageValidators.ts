import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import { logStatus } from "../../wsp";

export const textValidator = (text: string) => {
	if (text.length > 4096) {
		console.error("se excedio la cantidad de Caracteres Maximos por envio");
		return false;
	}
	return true;
};

export const audioDurationValidator = async (url: string) => {
	ffmpeg.ffprobe(url, (err: any, metadata: any) => {
		if (err) {
			console.error("Error obteniendo metadata:", err);
			return false;
		}

		const audioDuration = metadata.format.duration;
		if (audioDuration > 600) {
			console.error("El audio es demasiado largo.");
			return false;
		}
	});
	return true;
};

export const size16MbValidator = (url: string) => {
	const { size } = fs.statSync(url);
	console.log("Peso en bytes:", size);
	if (size > 16000000) {
		console.error("La media pesa más de 16 Mb");
		return false;
	}
	return true;
};

export const size2GbValidator = (url: string) => {
	const { size } = fs.statSync(url);
	console.log("Peso en bytes:", size);
	if (size > 2000000000) {
		console.error("El documento pesa más de 2 Gb");
		return false;
	}
	return true;
};
