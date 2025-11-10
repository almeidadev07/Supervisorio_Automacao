/* eslint-disable */
import os from 'os';
import fs from 'fs';

// Conversões de tipos para consistência. O nodes7 já retorna valores tipados,
// mas mantemos esta utilidade para casos de buffers crus no futuro.
export function parsePLCValue(bufferOrValue, type) {
	if (bufferOrValue === undefined || bufferOrValue === null) return bufferOrValue;
	const upper = String(type || '').toUpperCase();

	// Se já veio pronto (nodes7), simplesmente retorna
	if (typeof bufferOrValue !== 'object' || !Buffer.isBuffer?.(bufferOrValue)) {
		return bufferOrValue;
	}

	const buf = bufferOrValue;
	switch (upper) {
		case 'BOOL':
			return (buf[0] & 0x01) !== 0;
		case 'BYTE':
			return buf.readUInt8(0);
		case 'WORD':
			return buf.readUInt16BE(0);
		case 'DWORD':
			return buf.readUInt32BE(0);
		case 'INT':
			return buf.readInt16BE(0);
		case 'DINT':
			return buf.readInt32BE(0);
		case 'REAL':
			return buf.readFloatBE(0);
		default:
			return buf;
	}
}

export function nowMs() {
	return Date.now();
}

export function hostname() {
	return os.hostname();
}

export function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mapa simples de tipos do comm_map -> tipos nodes7
export const typeToNodeS7 = {
	BOOL: 'X',
	BYTE: 'BYTE',
	WORD: 'WORD',
	DWORD: 'DWORD',
	INT: 'INT',
	DINT: 'DINT',
	REAL: 'REAL',
	STRING: 'STRING',
};

// Calcula o endereço nodes7: ex: DB1,REAL48
export function toNodeS7Address(db, type, offset, byte, bit) {
    // Validação
    if (!Number.isFinite(db) || db < 0) return null;
    if (!type || typeof type !== 'string') return null;
    if (!Number.isFinite(offset) || offset < 0) return null;
    
    const t = String(type || '').toUpperCase();
    if (t === 'BOOL' || t === 'X') {
        let b = Number.isFinite(byte) ? Number(byte) : undefined;
        let bt = Number.isFinite(bit) ? Number(bit) : undefined;
        if (b === undefined || bt === undefined) {
            const off = Number(offset) || 0;
            b = Math.floor(off / 8);
            bt = off % 8;
        }
        return `DB${db},X${b}.${bt}`;
    }
    const nType = typeToNodeS7[t] || t;
    if (!nType) return null;
    return `DB${db},${nType}${offset}`;
}

// Seleciona caminho do comm_map existente
export function resolveCommMapPath() {
	// Prioriza variável de ambiente, se definida
	if (process?.env?.COMM_MAP_PATH) {
		try {
			fs.accessSync(process.env.COMM_MAP_PATH, fs.constants.R_OK);
			return process.env.COMM_MAP_PATH;
		} catch (_) {}
	}
	// Prioriza mapas específicos por máquina quando existentes
	const candidates = [
		'config/comm_map/700CX.json',
		'config/comm_map/400CX.json',
		'config/comm_map/200CX.json',
		'config/comm_map.json',
	];
	for (const p of candidates) {
		try {
			fs.accessSync(p, fs.constants.R_OK);
			return p;
		} catch (_) {}
	}
	return 'config/comm_map.json';
}

// Calcula o tamanho necessário para uma DB baseado nos offsets e tipos das tags
export function calculateDbSize(items) {
	if (!Array.isArray(items) || items.length === 0) return 0;
	let maxOffset = 0;
	for (const item of items) {
		const offset = Number(item.offset) || 0;
		const type = String(item.type || '').toUpperCase();
		// Calcula tamanho do tipo
		let typeSize = 2; // Default: WORD (2 bytes)
		switch (type) {
			case 'BOOL':
			case 'X':
				typeSize = 1; // 1 byte (mas pode ser bit)
				break;
			case 'BYTE':
				typeSize = 1;
				break;
			case 'WORD':
			case 'INT':
				typeSize = 2;
				break;
			case 'DWORD':
			case 'DINT':
			case 'REAL':
				typeSize = 4;
				break;
			case 'STRING':
				// Strings podem ter tamanho variável, mas geralmente são 256 bytes
				typeSize = 256;
				break;
		}
		const requiredSize = offset + typeSize;
		maxOffset = Math.max(maxOffset, requiredSize);
	}
	// Arredonda para múltiplo de 2 para alinhamento
	return Math.max(10, Math.ceil(maxOffset / 2) * 2);
}

// Extrai valor de um buffer da DB baseado no offset e tipo
export function extractValueFromBuffer(buffer, offset, type) {
	if (!Buffer.isBuffer(buffer)) return null;
	const typeUpper = String(type || '').toUpperCase();
	const off = Number(offset) || 0;
	
	try {
		switch (typeUpper) {
			case 'BOOL':
			case 'X':
				// Para BOOL, offset pode ser em bytes ou bits
				const byte = Math.floor(off / 8);
				const bit = off % 8;
				if (byte >= buffer.length) return null;
				return (buffer[byte] & (1 << bit)) !== 0;
			case 'BYTE':
				if (off >= buffer.length) return null;
				return buffer.readUInt8(off);
			case 'WORD':
				if (off + 1 >= buffer.length) return null;
				return buffer.readUInt16BE(off);
			case 'INT':
				if (off + 1 >= buffer.length) return null;
				return buffer.readInt16BE(off);
			case 'DWORD':
				if (off + 3 >= buffer.length) return null;
				return buffer.readUInt32BE(off);
			case 'DINT':
				if (off + 3 >= buffer.length) return null;
				return buffer.readInt32BE(off);
			case 'REAL':
				if (off + 3 >= buffer.length) return null;
				return buffer.readFloatBE(off);
			case 'STRING':
				// Strings em S7 geralmente têm comprimento no primeiro byte
				if (off >= buffer.length) return null;
				const strLen = Math.min(buffer.readUInt8(off), buffer.length - off - 1);
				return buffer.toString('utf8', off + 1, off + 1 + strLen);
			default:
				return null;
		}
	} catch (e) {
		console.warn(`[Utils] Erro ao extrair valor (offset=${off}, type=${typeUpper}):`, e?.message || e);
		return null;
	}
}