/* eslint-disable */
import EventEmitter from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveCommMapPath, toNodeS7Address, nowMs, sleep, calculateDbSize, extractValueFromBuffer } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHUNK_SIZE = Number(process.env.NS7_CHUNK_SIZE || 16);
const INTER_CHUNK_DELAY_MS = Number(process.env.NS7_INTER_CHUNK_MS || 10);

// Constrói estrutura agrupada por DB a partir do comm_map atual (array)
export function buildGroupedByDb(commArray) {
	const grouped = new Map(); // db -> [{ name, start, type, offset }]
	let validCount = 0;
	let skipCount = 0;
	for (const entry of commArray) {
		if (!entry || typeof entry !== 'object') { skipCount++; continue; }
		if (entry.__section__) { skipCount++; continue; } // ignora seções
		const { name, area, db, offset, type } = entry;
		if (!name || area !== 'DB') { skipCount++; continue; }
		if (typeof db !== 'number' || typeof offset !== 'number') { skipCount++; continue; }
		if (!type) { skipCount++; continue; }
		if (!grouped.has(db)) grouped.set(db, []);
		grouped.get(db).push({ name, start: offset, offset, type: String(type).toUpperCase() });
		validCount++;
	}
	console.log(`[Polling] buildGroupedByDb: ${validCount} tags válidas, ${skipCount} ignoradas`);
	// Ordena por offset dentro de cada DB (para facilitar cálculo de blocos contíguos)
	for (const [db, arr] of grouped.entries()) {
		arr.sort((a, b) => a.start - b.start);
		grouped.set(db, arr);
	}
	console.log(`[Polling] buildGroupedByDb: ${grouped.size} DBs agrupadas`);
	return grouped;
}

function buildGroupedFromObject(obj) {
	const grouped = new Map();
	if (!obj || typeof obj !== 'object') return grouped;
	for (const key of Object.keys(obj)) {
		const dbNum = Number(key);
		if (!Number.isFinite(dbNum)) continue;
		const arr = Array.isArray(obj[key]) ? obj[key] : [];
		const norm = [];
		for (const it of arr) {
			if (!it || typeof it !== 'object') continue;
			const name = it.name;
			const start = typeof it.start === 'number' ? it.start : (typeof it.offset === 'number' ? it.offset : undefined);
			const type = it.type ? String(it.type).toUpperCase() : undefined;
			if (!name || !Number.isFinite(start) || !type) continue;
			norm.push({ name, start, offset: start, type });
		}
		norm.sort((a, b) => a.start - b.start);
		grouped.set(dbNum, norm);
	}
	return grouped;
}

export function loadGroupedCommMap() {
	const selected = resolveCommMapPath();
	console.log(`[Polling] Carregando comm_map de: ${selected}`);
	const raw = fs.readFileSync(selected, 'utf-8');
	const data = JSON.parse(raw);
	console.log(`[Polling] Arquivo JSON parseado, tipo: ${Array.isArray(data) ? 'Array' : (data?.items ? 'Object com items' : 'Object')}`);
	if (Array.isArray(data)) {
		console.log(`[Polling] Convertendo array com ${data.length} itens...`);
		return buildGroupedByDb(data);
	}
	if (data && typeof data === 'object') {
		if (Array.isArray(data.items)) {
			console.log(`[Polling] Convertendo array data.items com ${data.items.length} itens...`);
			return buildGroupedByDb(data.items);
		}
		console.log(`[Polling] Convertendo object map com ${Object.keys(data).length} keys...`);
		return buildGroupedFromObject(data);
	}
	console.warn(`[Polling] AVISO: comm_map inválido!`);
	return new Map();
}

export class PlcPolling extends EventEmitter {
	constructor({ ip, rack = 0, slot = 1, scanMs = 200, name = 'PLC' } = {}) {
		super();
		this.settings = { ip, rack, slot, scanMs, name };
		this.grouped = new Map();
		this.tagToAddress = new Map();
		this.cache = new Map();
		this.stats = { lastCycleMs: 0, avgCycleMs: 0, cycles: 0, lastUpdateCount: 0, blocks: 0 };
		this._timer = null;
		this._manager = null; // injetado externamente
	}

	setManager(manager) {
		this._manager = manager;
	}

	initializeFromCommMap() {
		this.grouped = loadGroupedCommMap();
		this.tagToAddress.clear();
		for (const [db, items] of this.grouped.entries()) {
			for (const it of items) {
				if (!it.name || !Number.isFinite(it.offset) || !it.type) {
					console.warn(`[PlcPolling] Ignorando tag inválida: DB${db} - name=${it.name}, offset=${it.offset}, type=${it.type}`);
					continue;
				}
				// Validação extra antes de gerar endereço
				if (!it.type || typeof it.type !== 'string') {
					console.warn(`[PlcPolling] Tipo inválido para tag ${it.name}: ${it.type}`);
					continue;
				}
				const addr = toNodeS7Address(db, it.type, it.offset, it.byte, it.bit);
				if (!addr) {
					console.warn(`[PlcPolling] Endereço inválido gerado para tag ${it.name} (DB=${db}, type=${it.type}, offset=${it.offset})`);
					continue;
				}
				this.tagToAddress.set(it.name, addr);
			}
		}
		// blocks = número de DBs com itens (cada DB será lido em lote por itens)
		this.stats.blocks = this.grouped.size;
		return { grouped: this.grouped, tagToAddress: this.tagToAddress };
	}

	getItems() {
		return Array.from(this.tagToAddress.keys());
	}

	getCacheSnapshot() {
		return Object.fromEntries(this.cache.entries());
	}

	getStats() {
		return { ...this.stats };
	}

	start() {
		if (!this._manager) throw new Error('PlcPolling requer um manager configurado via setManager');
		if (this._timer) return;
		this.initializeFromCommMap();
		this._manager.setTranslation((tag) => {
			const addr = this.tagToAddress.get(tag);
			if (!addr) {
				console.warn(`[PlcPolling] ⚠️ Tag "${tag}" não encontrada no comm_map`);
			}
			return addr;
		});
		console.log(`[PlcPolling] ✅ Manager configurado com tradução de ${this.tagToAddress.size} tags`);
		this._loop();
	}

	stop() {
		if (this._timer) {
			clearTimeout(this._timer);
			this._timer = null;
		}
	}

	async _readDbInChunks(db, items) {
		let updates = 0;
		if (!this._manager) {
			console.warn(`[PlcPolling] Manager não configurado, pulando leitura`);
			return 0;
		}
		
		// Calcula o tamanho necessário para a DB
		const dbSize = calculateDbSize(items);
		if (dbSize === 0 || items.length === 0) {
			console.warn(`[PlcPolling] DB${db} sem itens válidos ou tamanho zero`);
			return 0;
		}
		
		try {
			// Lê a DB inteira de uma vez
			const buffer = await this._manager.readDB(db, 0, dbSize);
			
			if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
				console.warn(`[PlcPolling] DB${db} retornou buffer vazio ou inválido`);
				return 0;
			}
			
			// Processa cada tag extraindo valores do buffer
			for (const item of items) {
				const { name, offset, type } = item;
				if (!name || !Number.isFinite(offset) || !type) {
					continue;
				}
				
				try {
					const value = extractValueFromBuffer(buffer, offset, type);
					
					// Comparação melhorada: considera null/undefined e comparação de valor (não referência)
					const prev = this.cache.get(name);
					let changed = false;
					
					// Se não existe no cache, sempre atualiza
					if (prev === undefined) {
						changed = true;
					}
					// Comparação de valores (funciona para números, strings, booleans)
					else if (prev !== value) {
						// Comparação adicional para números (NaN, Infinity, etc)
						if (typeof prev === 'number' && typeof value === 'number') {
							changed = !(Number.isNaN(prev) && Number.isNaN(value)) && prev !== value;
						} else {
							changed = true;
						}
					}
					
					if (changed) {
						this.cache.set(name, value);
						updates++;
						this.emit('tagUpdate', { name, value });
					}
				} catch (e) {
					// Erro ao processar tag individual, mas continua com as outras
					console.warn(`[PlcPolling] Erro ao processar tag ${name} (DB${db}, offset=${offset}):`, e?.message || e);
				}
			}
			
			if (updates > 0) {
				console.log(`[PlcPolling] DB${db}: ${updates} tags atualizadas de ${items.length} tags (buffer: ${buffer.length} bytes)`);
			}
		} catch (e) {
			// Não propaga erro para não interromper o ciclo, apenas loga
			const errMsg = e?.message || String(e);
			if (!errMsg.includes('Conexão não disponível') && !errMsg.includes('timeout')) {
				console.warn(`[PlcPolling] Erro ao ler DB${db} (tamanho=${dbSize}): ${errMsg}`);
			}
			this.emit('error', e);
		}
		
		return updates;
	}

	async _loop() {
		const { scanMs } = this.settings;
		const t0 = nowMs();
		let updates = 0;
		try {
			// Verifica se manager está conectado antes de começar
			if (!this._manager || !this._manager.connected) {
				console.warn(`[PlcPolling] Manager não conectado, aguardando...`);
				// Tenta conectar
				try {
					await this._manager?.ensureConnected();
				} catch (e) {
					console.warn(`[PlcPolling] Falha ao conectar: ${e?.message || e}`);
				}
			}
			
			for (const [db, items] of this.grouped.entries()) {
				const dbUpdates = await this._readDbInChunks(db, items);
				updates += dbUpdates;
			}
			
			// Log periódico a cada 10 ciclos para debug
			if (this.stats.cycles % 10 === 0) {
				console.log(`[PlcPolling] Ciclo ${this.stats.cycles}: ${updates} updates, cache tem ${this.cache.size} tags, ${this.stats.blocks} DBs`);
			}
		} catch (err) {
			console.error(`[PlcPolling] Erro no loop:`, err);
			this.emit('error', err);
		}
		const dt = nowMs() - t0;
		this.stats.lastCycleMs = dt;
		this.stats.cycles++;
		this.stats.lastUpdateCount = updates;
		this.stats.avgCycleMs = this.stats.avgCycleMs === 0 ? dt : (this.stats.avgCycleMs * 0.9 + dt * 0.1);
		this.emit('cycle', { dt, avg: this.stats.avgCycleMs, updates: this.stats.lastUpdateCount, blocks: this.stats.blocks });
		this._timer = setTimeout(() => this._loop(), scanMs);
	}
}
