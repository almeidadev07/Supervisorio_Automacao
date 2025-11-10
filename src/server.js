/* eslint-disable */
import { WebSocketServer } from 'ws';
import http from 'http';
import { PlcManager } from './plc/plcManager.js';
import { PlcPolling } from './plc/plcPolling.js';
import fs from 'fs';
import path from 'path';
import net from 'net';

// Configurações básicas (ajuste IP/rack/slot conforme seu CLP)
let PLC_IP = process.env.PLC_IP || '192.168.0.1';
let PLC_RACK = Number(process.env.PLC_RACK || 0);
let PLC_SLOT = Number(process.env.PLC_SLOT || 1);
const SCAN_MS = Number(process.env.SCAN_MS || 200);
const WS_PORT = Number(process.env.WS_PORT || 8081);

// Suporte a MACHINE (200CX/400CX/700CX) para preencher IP/rack/slot e COMM_MAP_PATH automaticamente
try {
    const machineName = process.env.MACHINE && String(process.env.MACHINE).trim();
    if (machineName) {
        const cfgPath = path.join(process.cwd(), 'config', 'machines_config_block.json');
        if (fs.existsSync(cfgPath)) {
            const raw = fs.readFileSync(cfgPath, 'utf-8');
            const machines = JSON.parse(raw);
            const found = Array.isArray(machines) ? machines.find(m => (m?.name || '').toUpperCase() === machineName.toUpperCase()) : null;
            if (found) {
                if (!process.env.PLC_IP && found.default_plc_ip) PLC_IP = String(found.default_plc_ip);
                if (!process.env.PLC_RACK && typeof found.rack === 'number') PLC_RACK = Number(found.rack);
                if (!process.env.PLC_SLOT && typeof found.slot === 'number') PLC_SLOT = Number(found.slot);
                if (!process.env.COMM_MAP_PATH && found.comm_map_file) {
                    const candidate = path.join(process.cwd(), 'config', 'comm_map', String(found.comm_map_file));
                    if (fs.existsSync(candidate)) {
                        process.env.COMM_MAP_PATH = candidate;
                    }
                }
                console.log(`[BOOT] MACHINE=${machineName} aplicado -> IP=${PLC_IP} rack=${PLC_RACK} slot=${PLC_SLOT} comm_map=${process.env.COMM_MAP_PATH || 'auto'}`);
            } else {
                console.warn(`[BOOT] MACHINE=${machineName} não encontrado em machines_config_block.json`);
            }
        }
    }
} catch (e) {
    console.warn('[BOOT] Falha ao aplicar MACHINE:', e?.message || e);
}

const manager = new PlcManager({ ip: PLC_IP, rack: PLC_RACK, slot: PLC_SLOT, name: 'PLC', reconnectMs: 2000 });
const polling = new PlcPolling({ ip: PLC_IP, rack: PLC_RACK, slot: PLC_SLOT, scanMs: SCAN_MS, name: 'PLC' });
polling.setManager(manager);

// Logs de diagnóstico
polling.on('cycle', ({ dt, avg, updates, blocks }) => {
	console.log(`[Polling] ciclo=${dt}ms avg=${avg.toFixed(1)}ms updates=${updates} blocks=${blocks}`);
});
manager.on('connected', () => console.log('[PLC] conectado'));
manager.on('disconnected', (err) => console.warn('[PLC] desconectado', err?.message || err));
manager.on('connect_error', (err) => console.warn('[PLC] erro de conexão', err?.message || err));
polling.on('error', (err) => console.warn('[Polling] erro', err?.message || err));

console.log(`[BOOT] NodeS7 iniciando com IP=${PLC_IP} rack=${PLC_RACK} slot=${PLC_SLOT} scanMs=${SCAN_MS} WS_PORT=${WS_PORT}`);

// Autodetecção simples: se o IP atual não responder, testa candidatos conhecidos
async function detectReachablePLC(currentIp) {
    function testHost(host, timeoutMs = 800) {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            let done = false;
            const onDone = (ok) => { if (!done) { done = true; try { socket.destroy(); } catch(_) {} resolve(ok); } };
            socket.setTimeout(timeoutMs);
            socket.once('error', () => onDone(false));
            socket.once('timeout', () => onDone(false));
            socket.connect(102, host, () => onDone(true));
        });
    }
    const candidates = [];
    // Prioriza o IP atual
    if (currentIp) candidates.push(String(currentIp));
    // IP informado pelo usuário (muito comum)
    candidates.push('100.70.0.10');
    // Defaults conhecidos
    candidates.push('192.168.0.3', '192.168.0.2', '192.168.0.1');
    // De machines_config_block.json, se existir
    try {
        const cfgPath = path.join(process.cwd(), 'config', 'machines_config_block.json');
        if (fs.existsSync(cfgPath)) {
            const raw = fs.readFileSync(cfgPath, 'utf-8');
            const machines = JSON.parse(raw);
            for (const m of (Array.isArray(machines) ? machines : [])) {
                if (m?.default_plc_ip) candidates.push(String(m.default_plc_ip));
            }
        }
    } catch (_) {}
    // Remove duplicados preservando ordem
    const uniq = Array.from(new Set(candidates.filter(Boolean)));
    for (const host of uniq) {
        if (await testHost(host)) {
            return host;
        }
    }
    return currentIp;
}

(async () => {
    try {
        const reachable = await detectReachablePLC(PLC_IP);
        if (reachable && reachable !== PLC_IP) {
            console.log(`[BOOT] PLC auto-detectado em ${reachable} (porta 102 aberta) -> atualizando destino`);
            PLC_IP = reachable;
            // Atualiza instâncias com novo IP
            manager.settings.ip = PLC_IP;
            polling.settings.ip = PLC_IP;
        }
    } catch (e) {
        console.warn('[BOOT] Autodetecção falhou:', e?.message || e);
    }
})();

polling.start();

// HTTP server básico para snapshot/leitura via REST
const server = http.createServer(async (req, res) => {
	try {
		const url = new URL(req.url, `http://localhost:${WS_PORT}`);
		if (url.pathname === '/health') {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			return res.end(JSON.stringify({ ok: true }));
		}
			if (url.pathname === '/api/items') {
				// Lista de nomes de tags que o polling está monitorando
				res.writeHead(200, { 'Content-Type': 'application/json' });
				return res.end(JSON.stringify({ ok: true, count: polling.getItems().length, items: polling.getItems() }));
			}
			if (url.pathname === '/api/stats') {
				// Estatísticas do polling e variáveis de ambiente relevantes
				res.writeHead(200, { 'Content-Type': 'application/json' });
				return res.end(JSON.stringify({
					ok: true,
					stats: polling.getStats(),
					config: {
						PLC_IP,
						PLC_RACK,
						PLC_SLOT,
						SCAN_MS,
						WS_PORT,
						COMM_MAP_PATH: process.env.COMM_MAP_PATH || null
					}
				}));
			}
		if (url.pathname === '/api/snapshot') {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			return res.end(JSON.stringify({ ok: true, data: polling.getCacheSnapshot(), stats: polling.getStats() }));
		}
	if (url.pathname === '/api/read') {
		const tagsParam = url.searchParams.get('tags');
		const tags = (tagsParam && typeof tagsParam === 'string') 
			? tagsParam.split(',').map((s) => s.trim()).filter(Boolean)
			: [];
		const snapshot = polling.getCacheSnapshot();
		let direct = {};
		if (tags.length) {
			try {
				direct = await manager.readChunk(tags);
				if (direct && typeof direct === 'object') {
					for (const [name, value] of Object.entries(direct)) {
						polling.cache.set(name, value);
					}
				}
			} catch (err) {
				console.warn('[HTTP] read -> fallback snapshot', err?.message || err);
				direct = {};
			}
		}
		const out = {};
		for (const tag of tags) {
			if (Object.prototype.hasOwnProperty.call(direct, tag)) {
				out[tag] = direct[tag];
			} else if (snapshot && Object.prototype.hasOwnProperty.call(snapshot, tag)) {
				out[tag] = snapshot[tag];
			}
		}
		res.writeHead(200, { 'Content-Type': 'application/json' });
		return res.end(JSON.stringify({ ok: true, data: out, fresh: Object.keys(direct).length > 0 }));
	}
		if (url.pathname === '/api/write' && req.method === 'POST') {
			let body = '';
			req.on('data', (chunk) => (body += chunk));
			req.on('end', async () => {
				try {
					const payload = JSON.parse(body || '{}');
					const values = payload?.values || {};
					await manager.writeChunk(values);
					// invalida cache local desses tags; polling atualizará no próximo ciclo
					for (const k of Object.keys(values)) polling.cache.delete(k);
					res.writeHead(200, { 'Content-Type': 'application/json' });
					return res.end(JSON.stringify({ ok: true }));
				} catch (e) {
					res.writeHead(500, { 'Content-Type': 'application/json' });
					return res.end(JSON.stringify({ ok: false, error: e?.message || String(e) }));
				}
			});
			return;
		}
		res.writeHead(404, { 'Content-Type': 'application/json' });
		return res.end(JSON.stringify({ ok: false, error: 'not found' }));
	} catch (e) {
		res.writeHead(500, { 'Content-Type': 'application/json' });
		return res.end(JSON.stringify({ ok: false, error: e?.message || String(e) }));
	}
});

server.listen(WS_PORT, () => {
	console.log(`[HTTP+WS] Servidor ouvindo em :${WS_PORT}`);
});

const wss = new WebSocketServer({ server });

// Cada cliente mantém padrões de subscrição simples (substring match)
function matchesPatterns(tag, patterns) {
	if (!patterns || patterns.length === 0) return true;
	const name = String(tag).toUpperCase();
	return patterns.some((p) => name.includes(String(p || '').toUpperCase()));
}

wss.on('connection', (ws) => {
	ws.isAlive = true;
	ws.subPatterns = [];
	ws.on('pong', () => (ws.isAlive = true));

	ws.send(JSON.stringify({ type: 'hello', msg: 'conectado', stats: polling.getStats() }));

	ws.on('message', (data) => {
		try {
			const msg = JSON.parse(String(data));
			if (msg?.type === 'subscribe') {
				ws.subPatterns = Array.isArray(msg.patterns) ? msg.patterns : [];
				ws.send(JSON.stringify({ type: 'subscribed', patterns: ws.subPatterns }));
			} else if (msg?.type === 'snapshot') {
				const snap = polling.getCacheSnapshot();
				ws.send(JSON.stringify({ type: 'snapshot', data: snap }));
			}
		} catch (e) {
			ws.send(JSON.stringify({ type: 'error', error: e?.message || String(e) }));
		}
	});
});

// Broadcast apenas de deltas (valores alterados)
polling.on('tagUpdate', (update) => {
	const payload = JSON.stringify({ type: 'tagUpdate', ...update });
	for (const client of wss.clients) {
		if (client.readyState === 1 /* OPEN */ && matchesPatterns(update.name, client.subPatterns)) {
			client.send(payload);
		}
	}
});

// Liveness
const interval = setInterval(() => {
	for (const ws of wss.clients) {
		if (ws.isAlive === false) return ws.terminate();
		ws.isAlive = false;
		ws.ping();
	}
}, 30000);

wss.on('close', function close() {
	clearInterval(interval);
});
