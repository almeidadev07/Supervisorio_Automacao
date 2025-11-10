/* eslint-disable */
const logEl = document.getElementById('log');
const btnSub = document.getElementById('btnSub');
const btnSnap = document.getElementById('btnSnap');
const patternsEl = document.getElementById('patterns');

const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + (location.hostname || 'localhost') + ':' + (location.port || '8081');
let ws;

function log(line) {
	const ts = new Date().toISOString();
	logEl.textContent += `[${ts}] ${line}\n`;
	logEl.scrollTop = logEl.scrollHeight;
}

function connect() {
	ws = new WebSocket(WS_URL);
	ws.onopen = () => log('WS aberto: ' + WS_URL);
	ws.onclose = () => log('WS fechado');
	ws.onerror = (e) => log('WS erro: ' + (e?.message || e));
	ws.onmessage = (ev) => {
		try {
			const msg = JSON.parse(ev.data);
			if (msg.type === 'hello') {
				log('Conectado. stats=' + JSON.stringify(msg.stats));
			} else if (msg.type === 'subscribed') {
				log('Assinado: ' + JSON.stringify(msg.patterns));
			} else if (msg.type === 'snapshot') {
				log('Snapshot recebido: ' + Object.keys(msg.data || {}).length + ' tags');
			} else if (msg.type === 'tagUpdate') {
				log(`${msg.name} = ${msg.value}`);
			} else if (msg.type === 'error') {
				log('Erro: ' + msg.error);
			}
		} catch (e) {
			log('Mensagem inválida');
		}
	};
}

btnSub.onclick = () => {
	const raw = (patternsEl.value || '').trim();
	const patterns = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
	ws?.send(JSON.stringify({ type: 'subscribe', patterns }));
};

btnSnap.onclick = () => ws?.send(JSON.stringify({ type: 'snapshot' }));

connect();
