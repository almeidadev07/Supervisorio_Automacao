/* eslint-disable */
import EventEmitter from 'events';
import nodes7 from 'nodes7';
import { sleep } from './utils.js';

export class PlcManager extends EventEmitter {
	constructor({ ip, rack = 0, slot = 1, name = 'PLC', reconnectMs = 2000 } = {}) {
		super();
		this.settings = { ip, rack, slot, name, reconnectMs };
		this.connection = null;
		this.connected = false;
		this._translation = null;
		this._connecting = false;
        // Fila simples para serializar operações nodes7 (clearItems/addItems/readAllItems/writeItems)
        this._lockQueue = Promise.resolve();
	}

	setTranslation(fn) {
		this._translation = fn;
		if (this.connection && fn) {
			this.connection.setTranslationCB((tag) => {
				try {
					const addr = fn(tag);
					// Garante que sempre retorna uma string válida (nodes7 não aceita null/undefined)
					if (addr && typeof addr === 'string') {
						return addr;
					}
					// Fallback: retorna o próprio tag se não houver tradução
					return tag || 'DB1,WORD0';
				} catch (e) {
					console.error(`[PlcManager] Erro na tradução de tag ${tag}:`, e);
					return tag || 'DB1,WORD0';
				}
			});
		}
	}

    async _exclusive(fn) {
        // Serializa as operações para evitar conflitos internos do nodes7
        const prev = this._lockQueue;
        let release;
        this._lockQueue = new Promise((r) => (release = r));
        try {
            await prev;
            return await fn();
        } finally {
            release();
        }
    }

	async ensureConnected() {
		if (this.connected || this._connecting) return;
		this._connecting = true;
		while (!this.connected) {
			try {
				await this._connectOnce();
				this.connected = true;
				this.emit('connected');
				break;
			} catch (err) {
				this.emit('connect_error', err);
				await sleep(this.settings.reconnectMs);
			}
		}
		this._connecting = false;
	}

	_connectOnce() {
		// Tenta conexão com múltiplos slots de forma automática (prioriza 1 para S7-1500)
		const preferred = Number.isFinite(this.settings.slot) ? this.settings.slot : 1;
		const candidates = preferred === 1 ? [1, 2] : [preferred, 1, 2];
		const unique = Array.from(new Set(candidates));
		return new Promise((resolve, reject) => {
			let lastErr = null;
			const tryIndex = (idx) => {
				if (idx >= unique.length) {
					return reject(lastErr || new Error('Falha ao conectar em todos os slots testados'));
				}
				const slot = unique[idx];
				try {
					this.connection = new nodes7();
					if (this._translation) {
						this.connection.setTranslationCB((tag) => {
							try {
								const addr = this._translation(tag);
								if (addr && typeof addr === 'string') {
									return addr;
								}
								return tag || 'DB1,WORD0';
							} catch (e) {
								console.error(`[PlcManager] Erro na tradução de tag ${tag}:`, e);
								return tag || 'DB1,WORD0';
							}
						});
					}
					const params = {
						port: 102,
						host: this.settings.ip,
						rack: this.settings.rack,
						slot,
					};
					console.log(`[PlcManager] Tentando conectar host=${params.host} rack=${params.rack} slot=${params.slot}`);
					this.connection.initiateConnection(params, (err) => {
						if (err) {
							lastErr = err;
							console.warn(`[PlcManager] Falha na conexão (slot ${slot}): ${err?.message || err}`);
							try { this.connection.dropConnection(); } catch (_) {}
							// tenta próximo slot
							return tryIndex(idx + 1);
						}
						// sucesso: fixa slot funcional
						this.settings.slot = slot;
						return resolve();
					});
				} catch (e) {
					lastErr = e;
					return tryIndex(idx + 1);
				}
			};
			tryIndex(0);
		});
	}

	async readChunk(tagNames) {
		// tagNames: array de nomes (não endereços). A tradução converte para "DBx,TYPEy".
		if (!Array.isArray(tagNames) || tagNames.length === 0) return {};
        try {
            // Verifica conexão
            if (!this.connection || !this.connected) {
                await this.ensureConnected();
            }
            if (!this.connection) {
                console.error(`[PlcManager] Conexão ainda não disponível após ensureConnected`);
                return {};
            }

            return await this._exclusive(() => new Promise((resolve, reject) => {
                // Limpa itens e adiciona
                try { this.connection.clearItems(); } catch (_) {}

                const validTags = [];
                for (const tagName of tagNames) {
                    if (!tagName || typeof tagName !== 'string') continue;
                    // Testa tradução
                    if (this._translation) {
                        const addr = this._translation(tagName);
                        if (!addr) {
                            console.warn(`[PlcManager] Tag sem tradução: ${tagName}`);
                        }
                    }
                    validTags.push(tagName);
                }
                if (validTags.length === 0) return resolve({});

                try { this.connection.addItems(validTags); } catch (e) {
                    console.error(`[PlcManager] ❌ Erro ao adicionar items:`, e);
                    return reject(e);
                }

                const timeout = setTimeout(() => {
                    console.error(`[PlcManager] TIMEOUT ao ler ${validTags.length} tags`);
                    this.connected = false;
                    reject(new Error('Timeout ao ler tags'));
                }, 5000);

                this.connection.readAllItems((err, values) => {
                    clearTimeout(timeout);
                    if (err) {
                        console.error(`[PlcManager] ❌ Erro ao ler items:`, err);
                        this.connected = false;
                        this.emit('disconnected', err);
                        try { this.connection.dropConnection?.(); } catch (_) {}
                        return reject(err);
                    }
                    const result = {};
                    if (values && typeof values === 'object') {
                        for (const [key, val] of Object.entries(values)) {
                            result[key] = val;
                        }
                    }
                    resolve(result);
                });
            }));
        } catch (e) {
            console.warn(`[PlcManager] readChunk falhou: ${e?.message || e}`);
            return {};
        }
	}

	async readDB(dbNumber, startOffset, length) {
		// Lê uma DB inteira usando readDB do nodes7
		// dbNumber: número da DB (ex: 1, 3, 4)
		// startOffset: offset inicial (geralmente 0)
		// length: tamanho em bytes para ler
		if (!Number.isFinite(dbNumber) || dbNumber < 0) {
			throw new Error(`DB number inválido: ${dbNumber}`);
		}
		if (!Number.isFinite(startOffset) || startOffset < 0) {
			throw new Error(`Offset inválido: ${startOffset}`);
		}
		if (!Number.isFinite(length) || length <= 0) {
			throw new Error(`Length inválido: ${length}`);
		}

		try {
			// Verifica conexão
			if (!this.connection || !this.connected) {
				await this.ensureConnected();
			}
			if (!this.connection) {
				console.error(`[PlcManager] Conexão ainda não disponível após ensureConnected`);
				throw new Error('Conexão não disponível');
			}

			return await this._exclusive(() => new Promise((resolve, reject) => {
				const timeout = setTimeout(() => {
					console.error(`[PlcManager] TIMEOUT ao ler DB${dbNumber} (offset=${startOffset}, length=${length})`);
					this.connected = false;
					reject(new Error('Timeout ao ler DB'));
				}, 10000); // 10 segundos para DBs grandes

				// Usa readDB do nodes7 para ler a DB inteira
				this.connection.readDB(dbNumber, startOffset, length, (err, buffer) => {
					clearTimeout(timeout);
					if (err) {
						console.error(`[PlcManager] ❌ Erro ao ler DB${dbNumber}:`, err);
						this.connected = false;
						this.emit('disconnected', err);
						try { this.connection.dropConnection?.(); } catch (_) {}
						return reject(err);
					}
					
					// Garante que retorna um Buffer válido
					if (!Buffer.isBuffer(buffer)) {
						console.warn(`[PlcManager] ⚠️ DB${dbNumber} retornou buffer inválido`);
						return resolve(Buffer.alloc(0));
					}
					
					resolve(buffer);
				});
			}));
		} catch (e) {
			console.warn(`[PlcManager] readDB falhou: ${e?.message || e}`);
			throw e;
		}
	}

	async stop() {
		try {
			if (this.connection) {
				this.connection.dropConnection();
			}
		} finally {
			this.connected = false;
		}
	}

	async writeChunk(tagValues) {
		// tagValues: { tagName: value }
		const names = Object.keys(tagValues || {});
		if (names.length === 0) return true;
        
        console.log(`[PlcManager] 📝 Tentando escrever ${names.length} tags:`, names);
        console.log(`[PlcManager] 📝 Valores:`, tagValues);
        
        // Verifica se tem tradução configurada
        if (!this._translation) {
            console.error(`[PlcManager] ❌ Tradução de tags não configurada!`);
            throw new Error('Tradução de tags não configurada');
        }
        
        // Testa tradução de cada tag antes de tentar escrever
        for (const tagName of names) {
            const addr = this._translation(tagName);
            if (!addr) {
                console.error(`[PlcManager] ❌ Tag "${tagName}" não pode ser traduzida para endereço`);
                throw new Error(`Tag "${tagName}" não encontrada no comm_map`);
            }
            console.log(`[PlcManager] 📍 Tag "${tagName}" → "${addr}"`);
        }
        
        await this.ensureConnected();
        console.log(`[PlcManager] ✅ Conectado, iniciando escrita...`);
        
        return this._exclusive(() => new Promise((resolve, reject) => {
            try { this.connection.clearItems(); } catch (_) {}
            try { 
                console.log(`[PlcManager] Adicionando items para escrita:`, names);
                this.connection.addItems(names); 
            } catch (e) { 
                console.error(`[PlcManager] ❌ Erro ao adicionar items:`, e);
                return reject(e); 
            }
            console.log(`[PlcManager] Chamando writeItems...`);
            this.connection.writeItems(tagValues, (err) => {
                if (err) {
                    console.error(`[PlcManager] ❌ Erro ao escrever:`, err);
                    this.connected = false;
                    this.emit('disconnected', err);
                    try { this.connection.dropConnection?.(); } catch (_) {}
                    return reject(err);
                }
                console.log(`[PlcManager] ✅ Escrita bem-sucedida!`);
                resolve(true);
            });
        }));
	}
}
