function inicializarClassification() {
    console.log('Inicializando Classification...');
    const state = {
        embaladoras: (() => {
            const cols = [{ id: 'IND', nome: 'IND', ativo: false, classes: [] }];
            for (let i = 1; i <= 24; i++) {
                const num = String(i).padStart(2, '0');
                cols.push({ id: `E${num}`, nome: `E${num}`, ativo: false, classes: [] });
            }
            cols.push({ id: 'SPJ', nome: 'SPJ', ativo: false, classes: [] });
            return cols;
        })(),
        classesOvos: [
            { id: 'C1', nome: 'C1', cor: '#FF3399' },
            { id: 'C2', nome: 'C2', cor: '#FFFF00' },
            { id: 'C3', nome: 'C3', cor: '#0000FF' },
            { id: 'C4', nome: 'C4', cor: '#33CC33' },
            { id: 'C5', nome: 'C5', cor: '#FF6600' },
            { id: 'C6', nome: 'C6', cor: '#33CCFF' },
            { id: 'C7', nome: 'C7', cor: '#00FF99' },
            { id: 'CRACK', nome: 'CRACK', cor: '#999999' },
            { id: 'VISIO', nome: 'VISIO', cor: '#663399' }
        ],
        selectedEmbaladora: null,
        presets: [],
        tiposOvo: ['branco', 'vermelho', 'misto'],
        dynamicLabels: Array.from({ length: 7 }, () => null),
        isLoadingRecipe: false, // Flag para evitar que PLC sobrescreva durante carregamento
        lastRecipeLoad: null // Timestamp da última receita carregada
    };

    // API helpers (reutiliza a lógica da tela de faixa de peso para nomes dinâmicos)
    const api = {
        async getLabels() {
            const names = Array.from({ length: 7 }, (_, i) => `XLCLASS_DB202_NOME_DINAMICO[${i}]`).join(',');
            const url = `/api/read_tags?names=${encodeURIComponent(names)}`;
            try {
                const res = await fetch(url, { cache: 'no-store' });
                if (!res.ok) throw new Error(`GET ${url} => ${res.status}`);
                const data = await res.json();
                const values = (data && data.values) || {};
                return Array.from({ length: 7 }, (_, i) => {
                    const key = `XLCLASS_DB202_NOME_DINAMICO[${i}]`;
                    const v = values[key];
                    if (v === null || typeof v === 'undefined') return null;
                    return String(v || '').trim();
                });
            } catch (e) {
                console.error('Falha ao ler labels do PLC (classification):', e);
                return Array.from({ length: 7 }, () => null);
            }
        },
        async setLabel(index, text) {
            const i = Number(index) >>> 0;
            if (i > 6) return false;
            const tag = `XLCLASS_DB202_NOME_DINAMICO[${i}]`;
            try {
                const res = await fetch('/api/write_tags', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ [tag]: String(text || '') })
                });
                const data = await res.json();
                return !!(data && data.ok);
            } catch (_) {
                return false;
            }
        }
    };
    // Teclado virtual para textos das faixas
    const tecladoTexto = document.getElementById('teclado-virtual-texto');
    const tecladoTextoInput = document.getElementById('kbd-texto-input');
    let labelAtiva = null;
    let tecladoTextoMaiusculo = true;

    function abrirTecladoTexto(inputEl) {
        labelAtiva = inputEl;
        if (tecladoTexto && tecladoTextoInput) {
            tecladoTextoInput.value = inputEl.value || '';
            tecladoTexto.style.display = 'block';
            setTimeout(() => tecladoTextoInput.focus(), 0);
        }
    }

    // Subscrição por tela (habilita somente as tags necessárias quando a tela está aberta)
    const clientId = `classification-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    let heartbeatTimer = null;
    function buildSubscribedTags() {
        const tags = [];
        // Palavras de classificação por P e índices 0 e 1 (DB200/DB201)
        const pList = ['P1','P2','P3','P4','P5','P6','P7','P9','P10'];
        for (const p of pList) {
            tags.push(`XLCLASS_DB200_CLASSIFICACAO_${p}[0]`);
            tags.push(`XLCLASS_DB200_CLASSIFICACAO_${p}[1]`);
            tags.push(`XLCLASS_DB201_CLASSIFICACAO_${p}[0]`);
            tags.push(`XLCLASS_DB201_CLASSIFICACAO_${p}[1]`);
        }
        // SPJ palavras de ignorar
        tags.push('XLCLASS_DB200_CLASSIFICACAO_CLASSES_A_IGNORAR');
        tags.push('XLCLASS_DB201_CLASSIFICACAO_CLASSES_A_IGNORAR');
        // Status principal lido para ícones e power
        tags.push('XLCLASS_DB1_PRINCIPAL_COMANDO_STATUS_01');
        // Comandos de classificação (bit 8 do lixo)
        tags.push('XLCLASS_DB200_CLASSIFICACAO_COMANDO_STATUS');
        tags.push('XLCLASS_DB201_CLASSIFICACAO_COMANDO_STATUS');
        // Labels dinâmicos C1..C7
        for (let i = 0; i < 7; i++) tags.push(`XLCLASS_DB202_NOME_DINAMICO[${i}]`);
        return tags;
    }
    async function subscribeScreen() {
        try {
            await fetch('/api/subscribe_tags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_id: clientId, tags: buildSubscribedTags() })
            }).catch(() => {});
        } catch (_) {}
    }
    async function unsubscribeScreen() {
        try {
            await fetch('/api/unsubscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_id: clientId })
            }).catch(() => {});
        } catch (_) {}
    }
    async function heartbeatScreen() {
        try {
            await fetch('/api/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_id: clientId })
            }).catch(() => {});
        } catch (_) {}
    }
    function startHeartbeat() {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(heartbeatScreen, 15000);
    }
    function stopHeartbeat() {
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
    }

    async function fecharTecladoTexto(confirmar) {
        if (confirmar && labelAtiva && tecladoTextoInput) {
            const novo = tecladoTextoInput.value.trim();
            labelAtiva.value = novo;
        }
        if (tecladoTexto) tecladoTexto.style.display = 'none';
        labelAtiva = null;
    }

    // Alert/claw tags reader (lê ambas as tags necessárias de uma vez)
    async function getAlertAndStatus() {
        const TAG_ALERT = 'XLCLASS_DB1_PRINCIPAL_ALARME_CLASSIFICADORA';
        const TAG_STATUS = 'XLCLASS_DB1_PRINCIPAL_COMANDO_STATUS_01';
        const names = `${TAG_ALERT},${TAG_STATUS}`;
        try {
            const res = await fetch(`/api/read_tags?names=${encodeURIComponent(names)}`, { cache: 'no-store' });
            if (!res.ok) throw new Error('bad');
            const data = await res.json();
            const rawAlert = Number(data?.values?.[TAG_ALERT] ?? 0) || 0;
            const rawStatus = Number(data?.values?.[TAG_STATUS] ?? 0) || 0;
            return { rawAlert, rawStatus };
        } catch (_) {
            return { rawAlert: 0, rawStatus: 0 };
        }
    }
    function computeAlertText(rawValue) {
        const v = Number(rawValue) >>> 0;
        if (!v) return '';
        const embaladora = Math.trunc((v - 1) / 10) + 1; // 1..N
        const tipoAlerta = v % 10; // 0..9
        // Exibir como 1-based para o usuário
        switch (tipoAlerta) {
            case 1: return `MÁQUINA PARADA - EMERGÊNCIA - EMBALADORA ${embaladora}`;
            case 2: return `MÁQUINA PARADA - DESLIGA CLASSIFICADORA FRENTE - EMBALADORA ${embaladora}`;
            case 3: return `MÁQUINA PARADA - DESLIGA CLASSIFICADORA TRAZ - EMBALADORA ${embaladora}`;
            case 4: return `MÁQUINA PARADA - FALTA DE BANDEJA - EMBALADORA ${embaladora}`;
            case 5: return `MÁQUINA PARADA - ACÚMULO DE BANDEJA - EMBALADORA ${embaladora}`;
            case 6: return `MÁQUINA PARADA - ACÚMULO DE OVOS - EMBALADORA ${embaladora}`;
            case 7: return `MÁQUINA PARADA - TAMPA DO DESCEDOR ABERTA - EMBALADORA ${embaladora}`;
            case 8: return `MÁQUINA PARADA - TAMPA DA CLASSIFICADORA ABERTA - EMBALADORA ${embaladora}`;
            default: return '';
        }
    }
    function renderAlert(text, visible) {
        const el = document.getElementById('classification-alert');
        if (!el) return;
        el.textContent = text || '';
        if (visible && text && text.trim() !== '') {
            el.style.visibility = 'visible';
        } else {
            el.style.visibility = 'hidden';
        }
    }
    function renderClaw(visible) {
        const el = document.getElementById('claw-banner');
        if (!el) return;
        el.style.visibility = visible ? 'visible' : 'hidden';
    }
    function renderClawGreen(visible) {
        const el = document.getElementById('claw-banner-green');
        if (!el) return;
        el.style.visibility = visible ? 'visible' : 'hidden';
    }

    // Power (Liga/Desliga) helpers
    const POWER_STATUS_TAG = 'XLCLASS_DB1_PRINCIPAL_COMANDO_STATUS_01';
    const POWER_STATUS_BIT = 12; // bit 12
    function updatePowerButtonsFromStatus(rawStatus) {
        const onBtn = document.getElementById('power-btn-on');
        const offBtn = document.getElementById('power-btn-off');
        if (!onBtn || !offBtn) return;
        const isOn = (((Number(rawStatus) >>> 0) >>> POWER_STATUS_BIT) & 1) === 1;
        onBtn.style.display = isOn ? 'inline-block' : 'none';
        offBtn.style.display = isOn ? 'none' : 'inline-block';
    }
    async function togglePowerBit() {
        try {
            const current = await readWords([POWER_STATUS_TAG]);
            const v = Number(current[POWER_STATUS_TAG] ?? 0) >>> 0;
            const isOn = (((v >>> POWER_STATUS_BIT) & 1) === 1);
            const next = setBit(v, POWER_STATUS_BIT, !isOn) >>> 0;
            const ok = await writeWords({ [POWER_STATUS_TAG]: next });
            if (!ok) console.warn('Falha ao escrever bit de liga/desliga');
            // Atualiza UI imediatamente
            updatePowerButtonsFromStatus(next);
        } catch (e) {
            console.error('Erro ao alternar liga/desliga:', e);
        }
    }

    // Utils
    function arraysEqual(a, b) {
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if ((a[i] || null) !== (b[i] || null)) return false;
        }
        return true;
    }
    function setBit(word, bitIndex, on) {
        const b = Number(bitIndex) >>> 0;
        const w = Number(word) >>> 0;
        return on ? (w | (1 << b)) : (w & ~(1 << b));
    }
    function getEmbBitAndIndex(embId) {
        // Usa a ordem atual das embaladoras renderizadas
        const order = state.embaladoras.map(e => e.id);
        const pos = order.indexOf(embId);
        if (pos === -1) return null;
        if (pos <= 15) return { index: 1, bit: pos }; // IND..E15 => [1], bits 0..15
        return { index: 0, bit: pos - 16 };          // E16..SPJ => [0], bits reiniciam em 0
    }
    function classIdToP(classId) {
        switch (classId) {
            case 'C1': return 'P1';
            case 'C2': return 'P2';
            case 'C3': return 'P3';
            case 'C4': return 'P4';
            case 'C5': return 'P5';
            case 'C6': return 'P6';
            case 'C7': return 'P7';
            case 'CRACK': return 'P9';
            case 'VISIO': return 'P10';
            default: return null;
        }
    }
    function spjClassToIgnoreBit(classId) {
        // C1..C7 => bits 8..14, CRACK => 15, VISIO => 0
        if (classId === 'VISIO') return 0;
        if (classId === 'CRACK') return 15;
        if (/^C[1-7]$/.test(classId)) {
            const n = Number(classId.slice(1));
            return 7 + n; // C1->8 ... C7->14
        }
        return null;
    }
    async function readWords(tags) {
        const names = tags.join(',');
        try {
            const res = await fetch(`/api/read_tags?names=${encodeURIComponent(names)}`, { cache: 'no-store' });
            if (!res.ok) throw new Error('bad');
            const data = await res.json();
            return data?.values || {};
        } catch (_) {
            return {};
        }
    }
    async function writeWords(payload) {
        console.log('=== writeWords ===');
        console.log('Payload:', payload);
		try {
			// Primeira tentativa: API padrão
			const res = await fetch('/api/write_tags', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			console.log('Response status:', res.status);
			let data;
			try { data = await res.json(); } catch (_) { data = null; }
			console.log('Response data:', data);
			if (res.ok && data && data.ok) {
				console.log('write_tags padrão OK');
				return true;
			}
			// Fallback: API aprimorada
			console.warn('write_tags padrão falhou, tentando /api/enhanced/write_tags');
			const resEnhanced = await fetch('/api/enhanced/write_tags', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tag_values: payload })
			});
			console.log('Enhanced status:', resEnhanced.status);
			let enhancedData;
			try { enhancedData = await resEnhanced.json(); } catch (_) { enhancedData = null; }
			console.log('Enhanced data:', enhancedData);
			if (enhancedData && enhancedData.ok) {
				return true;
			}
			// Fallback final: escrever em pequenos lotes (ou 1 a 1)
			console.warn('Enhanced também falhou; tentando escrita fracionada por partes...');
			const entries = Object.entries(payload);
			const chunkSize = 6;
			let allOk = true;
			for (let i = 0; i < entries.length; i += chunkSize) {
				const slice = entries.slice(i, i + chunkSize);
				const sliceObj = Object.fromEntries(slice);
				try {
					const r = await fetch('/api/write_tags', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(sliceObj)
					});
					let d; try { d = await r.json(); } catch (_) { d = null; }
					const ok = r.ok && d && d.ok;
					if (!ok) {
						allOk = false;
						console.warn('Falha em lote parcial, tentando item a item...');
						for (const [k, v] of slice) {
							try {
								const r1 = await fetch('/api/write_tags', {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({ [k]: v })
								});
								let d1; try { d1 = await r1.json(); } catch (_) { d1 = null; }
								if (!(r1.ok && d1 && d1.ok)) {
									allOk = false;
									console.error('Falha ao escrever tag individual:', k, d1);
								}
							} catch (e1) {
								allOk = false;
								console.error('Erro tag individual:', k, e1);
							}
							await new Promise(rp => setTimeout(rp, 20));
						}
					}
				} catch (e2) {
					allOk = false;
					console.error('Erro na escrita por lotes:', e2);
				}
				await new Promise(rp => setTimeout(rp, 30));
			}
			return allOk;
		} catch (error) {
			console.error('Erro em writeWords:', error);
			return false;
		}
    }
    async function refreshSelectionsFromPLC(force = false) {
        // Não atualiza se estiver carregando uma receita (a menos que force=true)
        if (!force && state.isLoadingRecipe) {
            console.log('Pulando refreshSelectionsFromPLC - carregando receita');
            return;
        }
        
        // Verifica se há configurações recentes (últimos 15 segundos) (a menos que force=true)
        const now = Date.now();
        if (!force && state.lastRecipeLoad && (now - state.lastRecipeLoad) < 15000) {
            console.log('Pulando refreshSelectionsFromPLC - receita carregada recentemente');
            return;
        }
        
        // Removida proteção que impedia sincronização quando há presets salvos
        // Esta proteção estava impedindo a sincronização durante carregamento de receitas
        
        // Reutiliza a leitura das palavras e aplica se mudou
        const pList = ['P1','P2','P3','P4','P5','P6','P7','P9','P10'];
        const tags = [];
        for (const p of pList) {
            tags.push(`XLCLASS_DB200_CLASSIFICACAO_${p}[0]`);
            tags.push(`XLCLASS_DB200_CLASSIFICACAO_${p}[1]`);
            tags.push(`XLCLASS_DB201_CLASSIFICACAO_${p}[0]`);
            tags.push(`XLCLASS_DB201_CLASSIFICACAO_${p}[1]`);
        }
        // SPJ: incluir palavras de ignorar branco/vermelho
        tags.push('XLCLASS_DB200_CLASSIFICACAO_CLASSES_A_IGNORAR');
        tags.push('XLCLASS_DB201_CLASSIFICACAO_CLASSES_A_IGNORAR');
        tags.push('XLCLASS_DB200_CLASSIFICACAO_CLASSES_A_IGNORAR');
        const values = await readWords(tags);
        const order = state.embaladoras.map(e => e.id);
        const next = state.embaladoras.map(emb => ({ ...emb, classes: [] }));
        for (let pos = 0; pos < order.length; pos++) {
            const embId = order[pos];
            const embIdx = next.findIndex(e => e.id === embId);
            if (embIdx === -1) continue;
            if (embId === 'SPJ') {
                const ignoreWhite = Number(values['XLCLASS_DB200_CLASSIFICACAO_CLASSES_A_IGNORAR'] ?? 0) >>> 0;
                const ignoreRed = Number(values['XLCLASS_DB201_CLASSIFICACAO_CLASSES_A_IGNORAR'] ?? 0) >>> 0;
                for (const classObj of state.classesOvos) {
                    const b = spjClassToIgnoreBit(classObj.id);
                    if (b === null) continue;
                    const wOn = ((ignoreWhite >>> b) & 1) === 1;
                    const rOn = ((ignoreRed >>> b) & 1) === 1;
                    let tipo = null;
                    if (wOn && rOn) tipo = 'misto';
                    else if (wOn) tipo = 'branco';
                    else if (rOn) tipo = 'vermelho';
                    if (tipo) next[embIdx].classes.push({ id: classObj.id, nome: classObj.nome, cor: classObj.cor, tipo });
                }
            } else {
                const mapping = getEmbBitAndIndex(embId);
                if (!mapping) continue;
                const { index, bit } = mapping;
                for (const classObj of state.classesOvos) {
                    const p = classIdToP(classObj.id);
                    if (!p) continue;
                    const wWhite = Number(values[`XLCLASS_DB200_CLASSIFICACAO_${p}[${index}]`] ?? 0) >>> 0;
                    const wRed = Number(values[`XLCLASS_DB201_CLASSIFICACAO_${p}[${index}]`] ?? 0) >>> 0;
                    const whiteOn = ((wWhite >>> bit) & 1) === 1;
                    const redOn = ((wRed >>> bit) & 1) === 1;
                    let tipo = null;
                    if (whiteOn && redOn) tipo = 'misto';
                    else if (whiteOn) tipo = 'branco';
                    else if (redOn) tipo = 'vermelho';
                    if (tipo) next[embIdx].classes.push({ id: classObj.id, nome: classObj.nome, cor: classObj.cor, tipo });
                }
            }
        }
        const a = JSON.stringify(state.embaladoras.map(e => ({ id: e.id, classes: e.classes })));
        const b = JSON.stringify(next.map(e => ({ id: e.id, classes: e.classes })));
        if (a !== b) {
            state.embaladoras = next;
            renderGrid();
        }
    }
    async function loadSelectionsFromPLC() {
        // Monta lista de tags para leitura: P1..P7, P9, P10 em índices [0] e [1] para DB200 (branco) e DB201 (vermelho)
        const pList = ['P1','P2','P3','P4','P5','P6','P7','P9','P10'];
        const tags = [];
        for (const p of pList) {
            tags.push(`XLCLASS_DB200_CLASSIFICACAO_${p}[0]`);
            tags.push(`XLCLASS_DB200_CLASSIFICACAO_${p}[1]`);
            tags.push(`XLCLASS_DB201_CLASSIFICACAO_${p}[0]`);
            tags.push(`XLCLASS_DB201_CLASSIFICACAO_${p}[1]`);
        }
        // SPJ palavras especiais
        tags.push('XLCLASS_DB200_CLASSIFICACAO_CLASSES_A_IGNORAR');
        tags.push('XLCLASS_DB201_CLASSIFICACAO_CLASSES_A_IGNORAR');
        const values = await readWords(tags);

        // Decodifica por embaladora e classe
        const updated = state.embaladoras.map(emb => ({ ...emb, classes: [] }));
        const order = state.embaladoras.map(e => e.id);
        for (let pos = 0; pos < order.length; pos++) {
            const embId = order[pos];
            const embIdx = updated.findIndex(e => e.id === embId);
            if (embIdx === -1) continue;

            if (embId === 'SPJ') {
                const ignoreWhite = Number(values['XLCLASS_DB200_CLASSIFICACAO_CLASSES_A_IGNORAR'] ?? 0) >>> 0;
                const ignoreRed = Number(values['XLCLASS_DB201_CLASSIFICACAO_CLASSES_A_IGNORAR'] ?? 0) >>> 0;
                for (const classObj of state.classesOvos) {
                    const b = spjClassToIgnoreBit(classObj.id);
                    if (b === null) continue;
                    const isCrackVisio = (classObj.id === 'CRACK' || classObj.id === 'VISIO');
                    const wOn = ((ignoreWhite >>> b) & 1) === 1;
                    const rOn = isCrackVisio ? false : ((ignoreRed >>> b) & 1) === 1; // CRACK/VISIO não usam vermelho no SPJ
                    let tipo = null;
                    if (wOn && rOn) tipo = 'misto';
                    else if (wOn) tipo = 'branco';
                    else if (rOn) tipo = 'vermelho';
                    if (tipo) {
                        updated[embIdx].classes.push({ id: classObj.id, nome: classObj.nome, cor: classObj.cor, tipo });
                    }
                }
            } else {
                const mapping = getEmbBitAndIndex(embId);
                if (!mapping) continue;
                const { index, bit } = mapping;
                for (const classObj of state.classesOvos) {
                    const p = classIdToP(classObj.id);
                    if (!p) continue;
                    const wWhite = Number(values[`XLCLASS_DB200_CLASSIFICACAO_${p}[${index}]`] ?? 0) >>> 0;
                    const wRed = Number(values[`XLCLASS_DB201_CLASSIFICACAO_${p}[${index}]`] ?? 0) >>> 0;
                    const whiteOn = ((wWhite >>> bit) & 1) === 1;
                    const redOn = ((wRed >>> bit) & 1) === 1;
                    let tipo = null;
                    if (whiteOn && redOn) tipo = 'misto';
                    else if (whiteOn) tipo = 'branco';
                    else if (redOn) tipo = 'vermelho';
                    if (tipo) {
                        updated[embIdx].classes.push({ id: classObj.id, nome: classObj.nome, cor: classObj.cor, tipo });
                    }
                }
            }
        }
        state.embaladoras = updated;
        renderGrid();
    }
    async function syncSelectionToPLC(embId, classId, tipo) {
        console.log(`=== syncSelectionToPLC INICIADA ===`);
        console.log(`Parâmetros recebidos:`);
        console.log(`- embId: ${embId} (tipo: ${typeof embId})`);
        console.log(`- classId: ${classId} (tipo: ${typeof classId})`);
        console.log(`- tipo: ${tipo} (tipo: ${typeof tipo})`);
        
        const mapping = getEmbBitAndIndex(embId);
        const p = classIdToP(classId);
        console.log(`Mapping:`, mapping, `P:`, p);
        
        // SPJ usa palavras de classes a ignorar (branco/vermelho)
        if (embId === 'SPJ') {
            console.log('Processando SPJ...');
            const tagW = 'XLCLASS_DB200_CLASSIFICACAO_CLASSES_A_IGNORAR';
            const tagR = 'XLCLASS_DB201_CLASSIFICACAO_CLASSES_A_IGNORAR';
            const current = await readWords([tagW, tagR]);
            const wW = Number(current[tagW] ?? 0) >>> 0;
            const wR = Number(current[tagR] ?? 0) >>> 0;
            const b = spjClassToIgnoreBit(classId);
            if (b === null) return false;
            let nextW = wW;
            let nextR = wR;
            const isCrackVisio = (classId === 'CRACK' || classId === 'VISIO');
            if (isCrackVisio) {
                // Para CRACK/VISIO no SPJ, somente DB200 (misto) é usada; DB201 não é usada
                if (tipo === 'misto') { nextW = setBit(wW, b, true); nextR = setBit(wR, b, false); }
                else { nextW = setBit(wW, b, false); nextR = setBit(wR, b, false); }
            } else {
                if (tipo === 'branco') { nextW = setBit(wW, b, true); nextR = setBit(wR, b, false); }
                else if (tipo === 'vermelho') { nextW = setBit(wW, b, false); nextR = setBit(wR, b, true); }
                else if (tipo === 'misto') { nextW = setBit(wW, b, true); nextR = setBit(wR, b, true); }
                else { nextW = setBit(wW, b, false); nextR = setBit(wR, b, false); }
            }
            const payload = { [tagW]: nextW, [tagR]: nextR };
            console.log('Payload SPJ:', payload);
            const result = await writeWords(payload);
            console.log('Resultado SPJ:', result);
            return result;
        }

        // Para embaladoras normais (IND, E01-E24)
        if (!mapping || !p) {
            console.log('Mapping ou P inválido, retornando false');
            return false;
        }
        const { index, bit } = mapping;
        const tagWhite = `XLCLASS_DB200_CLASSIFICACAO_${p}[${index}]`;
        const tagRed = `XLCLASS_DB201_CLASSIFICACAO_${p}[${index}]`;
        // Lê valores atuais
        const current = await readWords([tagWhite, tagRed]);
        const wWhite = Number(current[tagWhite] ?? 0) >>> 0;
        const wRed = Number(current[tagRed] ?? 0) >>> 0;
        // Calcula próximos valores conforme o tipo
        let nextWhite = wWhite;
        let nextRed = wRed;
        if (tipo === 'branco') {
            nextWhite = setBit(wWhite, bit, true);
            nextRed = setBit(wRed, bit, false);
        } else if (tipo === 'vermelho') {
            nextWhite = setBit(wWhite, bit, false);
            nextRed = setBit(wRed, bit, true);
        } else if (tipo === 'misto') {
            nextWhite = setBit(wWhite, bit, true);
            nextRed = setBit(wRed, bit, true);
        } else {
            // Sem tipo (removido) => limpa ambos
            nextWhite = setBit(wWhite, bit, false);
            nextRed = setBit(wRed, bit, false);
        }
        const payload = {};
        payload[tagWhite] = nextWhite;
        payload[tagRed] = nextRed;
        console.log('Payload embaladora:', payload);
        const result = await writeWords(payload);
        console.log('Resultado embaladora:', result);
        return result;
    }

	// Escreve TODAS as seleções atuais (de todos os cards) em uma única chamada ao PLC
	async function syncAllSelectionsToPLC() {
		console.log('=== syncAllSelectionsToPLC INICIADA ===');
		// Mapeamento de índices disponíveis pelas embaladoras
		const indexSet = new Set();
		const embMappings = [];
		for (const emb of state.embaladoras) {
			if (emb.id === 'SPJ') continue;
			const mapping = getEmbBitAndIndex(emb.id);
			if (!mapping) continue;
			indexSet.add(mapping.index);
			embMappings.push({ id: emb.id, bit: mapping.bit, index: mapping.index, classes: emb.classes || [] });
		}
		const allIndices = Array.from(indexSet);
		// Lista de P's usados na lógica atual
		const pList = ['P1','P2','P3','P4','P5','P6','P7','P9','P10'];
		// Acumuladores: por P e index, os WORDs branco/vermelho que iremos escrever
		const acc = {};
		for (const p of pList) {
			acc[p] = {};
			for (const idx of allIndices) {
				acc[p][idx] = { white: 0 >>> 0, red: 0 >>> 0 };
			}
		}
		// Agrega as seleções de todas embaladoras
		for (const { id: embId, bit, index, classes } of embMappings) {
			for (const cls of classes) {
				const p = classIdToP(cls.id);
				if (!p) continue;
				const target = acc[p]?.[index];
				if (!target) continue;
				if (cls.tipo === 'branco') {
					target.white = setBit(target.white >>> 0, bit, true) >>> 0;
					target.red = setBit(target.red >>> 0, bit, false) >>> 0;
				} else if (cls.tipo === 'vermelho') {
					target.white = setBit(target.white >>> 0, bit, false) >>> 0;
					target.red = setBit(target.red >>> 0, bit, true) >>> 0;
				} else if (cls.tipo === 'misto') {
					target.white = setBit(target.white >>> 0, bit, true) >>> 0;
					target.red = setBit(target.red >>> 0, bit, true) >>> 0;
				}
			}
		}
		// Monta payload
		const payload = {};
		for (const p of pList) {
			for (const idx of allIndices) {
				const words = acc[p][idx];
				payload[`XLCLASS_DB200_CLASSIFICACAO_${p}[${idx}]`] = Number(words.white) >>> 0;
				payload[`XLCLASS_DB201_CLASSIFICACAO_${p}[${idx}]`] = Number(words.red) >>> 0;
			}
		}
		// SPJ (classes a ignorar)
		const spj = state.embaladoras.find(e => e.id === 'SPJ');
		if (spj) {
			let wW = 0 >>> 0;
			let wR = 0 >>> 0;
			for (const cls of (spj.classes || [])) {
				const b = spjClassToIgnoreBit(cls.id);
				if (b === null) continue;
				const isCrackVisio = (cls.id === 'CRACK' || cls.id === 'VISIO');
				if (isCrackVisio) {
					if (cls.tipo === 'misto') {
						wW = setBit(wW >>> 0, b, true) >>> 0;
						wR = setBit(wR >>> 0, b, false) >>> 0;
					} else {
						wW = setBit(wW >>> 0, b, false) >>> 0;
						wR = setBit(wR >>> 0, b, false) >>> 0;
					}
				} else {
					if (cls.tipo === 'branco') {
						wW = setBit(wW >>> 0, b, true) >>> 0;
						wR = setBit(wR >>> 0, b, false) >>> 0;
					} else if (cls.tipo === 'vermelho') {
						wW = setBit(wW >>> 0, b, false) >>> 0;
						wR = setBit(wR >>> 0, b, true) >>> 0;
					} else if (cls.tipo === 'misto') {
						wW = setBit(wW >>> 0, b, true) >>> 0;
						wR = setBit(wR >>> 0, b, true) >>> 0;
					}
				}
			}
			payload['XLCLASS_DB200_CLASSIFICACAO_CLASSES_A_IGNORAR'] = Number(wW) >>> 0;
			payload['XLCLASS_DB201_CLASSIFICACAO_CLASSES_A_IGNORAR'] = Number(wR) >>> 0;
		}
		console.log('Payload completo (bulk):', payload);
		const ok = await writeWords(payload);
		console.log('Resultado bulk:', ok);
		return ok;
	}
	// Expose helper globally to avoid scope issues
	window.syncAllSelectionsToPLC = syncAllSelectionsToPLC;

	// Programa uma embaladora específica com base no estado atual (limpa e seta apenas seu bit)
	async function programEmbaladoraFromState(emb) {
		try {
			if (!emb || !emb.id) return true;
			if (emb.id === 'SPJ') {
				let wW = 0 >>> 0;
				let wR = 0 >>> 0;
				for (const cls of (emb.classes || [])) {
					const b = spjClassToIgnoreBit(cls.id);
					if (b === null) continue;
					const isCrackVisio = (cls.id === 'CRACK' || cls.id === 'VISIO');
					if (isCrackVisio) {
						if (cls.tipo === 'misto') { wW = setBit(wW, b, true); wR = setBit(wR, b, false); }
					} else {
						if (cls.tipo === 'branco') { wW = setBit(wW, b, true); wR = setBit(wR, b, false); }
						else if (cls.tipo === 'vermelho') { wW = setBit(wW, b, false); wR = setBit(wR, b, true); }
						else if (cls.tipo === 'misto') { wW = setBit(wW, b, true); wR = setBit(wR, b, true); }
					}
				}
				const payload = {
					'XLCLASS_DB200_CLASSIFICACAO_CLASSES_A_IGNORAR': Number(wW) >>> 0,
					'XLCLASS_DB201_CLASSIFICACAO_CLASSES_A_IGNORAR': Number(wR) >>> 0
				};
				return await writeWords(payload);
			}
			const mapping = getEmbBitAndIndex(emb.id);
			if (!mapping) return false;
			const { index, bit } = mapping;
			const pList = ['P1','P2','P3','P4','P5','P6','P7','P9','P10'];
			// Lê as palavras atuais do índice dessa embaladora
			const readTags = [];
			for (const p of pList) {
				readTags.push(`XLCLASS_DB200_CLASSIFICACAO_${p}[${index}]`);
				readTags.push(`XLCLASS_DB201_CLASSIFICACAO_${p}[${index}]`);
			}
			const current = await readWords(readTags);
			const payload = {};
			for (const p of pList) {
				let wWhite = Number(current[`XLCLASS_DB200_CLASSIFICACAO_${p}[${index}]`] ?? 0) >>> 0;
				let wRed = Number(current[`XLCLASS_DB201_CLASSIFICACAO_${p}[${index}]`] ?? 0) >>> 0;
				// Define o bit conforme o estado desejado dos cards
				const desired = (emb.classes || []).find(c => classIdToP(c.id) === p);
				let desiredTipo = desired ? desired.tipo : null;
				if (desiredTipo === 'branco') { wWhite = setBit(wWhite, bit, true); wRed = setBit(wRed, bit, false); }
				else if (desiredTipo === 'vermelho') { wWhite = setBit(wWhite, bit, false); wRed = setBit(wRed, bit, true); }
				else if (desiredTipo === 'misto') { wWhite = setBit(wWhite, bit, true); wRed = setBit(wRed, bit, true); }
				else { wWhite = setBit(wWhite, bit, false); wRed = setBit(wRed, bit, false); }
				payload[`XLCLASS_DB200_CLASSIFICACAO_${p}[${index}]`] = Number(wWhite) >>> 0;
				payload[`XLCLASS_DB201_CLASSIFICACAO_${p}[${index}]`] = Number(wRed) >>> 0;
			}
			return await writeWords(payload);
		} catch (e) {
			console.error('Erro em programEmbaladoraFromState', emb?.id, e);
			return false;
		}
	}

	// Força escrita individual de TODAS as classes para TODAS as embaladoras (set/clear)
	async function syncFullStateToPLC() {
		console.log('=== syncFullStateToPLC (per-class) INICIADA ===');
		let allOk = true;
		// Fase 1: limpa tudo (garante que o que não está no card seja removido)
		for (const emb of state.embaladoras) {
			for (const classObj of state.classesOvos) {
				try {
					const ok = await syncSelectionToPLC(emb.id, classObj.id, null);
					if (!ok) allOk = false;
					await new Promise(r => setTimeout(r, 30));
				} catch (_) {
					allOk = false;
				}
			}
		}
		// Fase 2: aplica apenas o que está nos cards
		for (const emb of state.embaladoras) {
			for (const classe of (emb.classes || [])) {
				try {
					const ok = await syncSelectionToPLC(emb.id, classe.id, classe.tipo);
					if (!ok) allOk = false;
					await new Promise(r => setTimeout(r, 50));
				} catch (_) {
					allOk = false;
				}
			}
		}
		console.log('syncFullStateToPLC concluída. Sucesso:', allOk);
		return allOk;
	}
	// Expose helper globally to avoid scope issues
	window.syncFullStateToPLC = syncFullStateToPLC;
    function renderStatus() {
        const statusRow = document.getElementById('status-row');
        if (!statusRow) return;
        
        statusRow.innerHTML = state.embaladoras.map(emb => `
            <div class="status-cell">
                <div class="status-indicator ${emb.ativo ? 'status-active' : 'status-inactive'}"></div>
            </div>
        `).join('');
    }
    function renderHeaders() {
        const headerRow = document.getElementById('header-row');
        if (!headerRow) return;
        
        headerRow.innerHTML = state.embaladoras.map(emb => `
            <div class="header-cell">${emb.nome}</div>
        `).join('');
    }
    function renderGrid() {
        const grid = document.getElementById('embaladora-grid');
        if (!grid) return;
        console.log('Renderizando grid com estado:', state.embaladoras);
        grid.innerHTML = state.embaladoras.map(emb => `
            <div class="embaladora-column" data-id="${emb.id}">
                ${renderClasses(emb.classes)}
            </div>
        `).join('');
        
        document.querySelectorAll('.embaladora-column').forEach(column => {
            column.addEventListener('click', () => {
                const embId = column.getAttribute('data-id');
                handleEmbaladoraClick(embId);
            });
        });
    }

	// Verifica no PLC se o estado corresponde aos cards e tenta corrigir discrepâncias
	async function verifySelectionsWithPLC() {
		console.log('=== verifySelectionsWithPLC INICIADA ===');
		// Monta lista de tags a ler
		const tags = [];
		const pList = ['P1','P2','P3','P4','P5','P6','P7','P9','P10'];
		const indexSet = new Set();
		for (const emb of state.embaladoras) {
			if (emb.id === 'SPJ') continue;
			const mapping = getEmbBitAndIndex(emb.id);
			if (mapping) indexSet.add(mapping.index);
		}
		for (const p of pList) {
			for (const idx of indexSet) {
				tags.push(`XLCLASS_DB200_CLASSIFICACAO_${p}[${idx}]`);
				tags.push(`XLCLASS_DB201_CLASSIFICACAO_${p}[${idx}]`);
			}
		}
		tags.push('XLCLASS_DB200_CLASSIFICACAO_CLASSES_A_IGNORAR');
		tags.push('XLCLASS_DB201_CLASSIFICACAO_CLASSES_A_IGNORAR');

		const values = await readWords(tags);
		let ok = true;
		// Confere por embaladora
		for (const emb of state.embaladoras) {
			if (emb.id === 'SPJ') {
				let expectedW = 0 >>> 0;
				let expectedR = 0 >>> 0;
				for (const cls of (emb.classes || [])) {
					const b = spjClassToIgnoreBit(cls.id);
					if (b === null) continue;
					const isCrackVisio = (cls.id === 'CRACK' || cls.id === 'VISIO');
					if (isCrackVisio) {
						if (cls.tipo === 'misto') { expectedW = setBit(expectedW, b, true); expectedR = setBit(expectedR, b, false); }
					} else {
						if (cls.tipo === 'branco') { expectedW = setBit(expectedW, b, true); expectedR = setBit(expectedR, b, false); }
						else if (cls.tipo === 'vermelho') { expectedW = setBit(expectedW, b, false); expectedR = setBit(expectedR, b, true); }
						else if (cls.tipo === 'misto') { expectedW = setBit(expectedW, b, true); expectedR = setBit(expectedR, b, true); }
					}
				}
				const readW = Number(values['XLCLASS_DB200_CLASSIFICACAO_CLASSES_A_IGNORAR'] ?? 0) >>> 0;
				const readR = Number(values['XLCLASS_DB201_CLASSIFICACAO_CLASSES_A_IGNORAR'] ?? 0) >>> 0;
				if (readW !== expectedW || readR !== expectedR) {
					console.warn('Discrepância SPJ detectada, corrigindo...');
					await syncSelectionToPLC('SPJ', 'C1', null); // no-op para despertar conexão
					await syncFullStateToPLC();
					ok = false;
				}
				continue;
			}
			const mapping = getEmbBitAndIndex(emb.id);
			if (!mapping) continue;
			const { index, bit } = mapping;
			for (const classObj of state.classesOvos) {
				const p = classIdToP(classObj.id);
				if (!p) continue;
				const desired = (emb.classes || []).find(c => c.id === classObj.id);
				const desiredTipo = desired ? desired.tipo : null;
				const wW = Number(values[`XLCLASS_DB200_CLASSIFICACAO_${p}[${index}]`] ?? 0) >>> 0;
				const wR = Number(values[`XLCLASS_DB201_CLASSIFICACAO_${p}[${index}]`] ?? 0) >>> 0;
				const haveWhite = ((wW >>> bit) & 1) === 1;
				const haveRed = ((wR >>> bit) & 1) === 1;
				let expectedWhite = false, expectedRed = false;
				if (desiredTipo === 'branco') { expectedWhite = true; expectedRed = false; }
				else if (desiredTipo === 'vermelho') { expectedWhite = false; expectedRed = true; }
				else if (desiredTipo === 'misto') { expectedWhite = true; expectedRed = true; }
				else { expectedWhite = false; expectedRed = false; }
				if (haveWhite !== expectedWhite || haveRed !== expectedRed) {
					console.warn('Discrepância detectada, corrigindo...', emb.id, classObj.id, desiredTipo);
					await syncSelectionToPLC(emb.id, classObj.id, desiredTipo);
					await new Promise(r => setTimeout(r, 20));
					ok = false;
				}
			}
		}
		console.log('verifySelectionsWithPLC concluída. OK:', ok);
		return ok;
	}
	// Expose helper globally to avoid scope issues
	window.verifySelectionsWithPLC = verifySelectionsWithPLC;
	
    function handleEmbaladoraClick(embId) {
        console.log('Clicked embaladora:', embId);
        const embaladora = state.embaladoras.find(e => e.id === embId);
        if (embaladora) {
            state.selectedEmbaladora = embaladora;
            showClassModal(embaladora);
        }
    }
    function renderClasses(classes) {
        console.log('Renderizando classes:', classes);
        
        // Calcula posições garantindo que todos os círculos caibam dentro do card
        const cardHeight = 400; // altura do card definida no CSS
        const marginSafe = 10; // margem desejada no topo e na base
        const maxHeight = cardHeight - marginSafe * 2; // área útil vertical exata (simétrica)
        const circleSize = 30; // tamanho do círculo (mantém consistente com CSS)
        const verticalGap = 8; // espaçamento entre círculos
        const totalItems = state.classesOvos.length;
        const totalNeeded = totalItems * circleSize + (totalItems - 1) * verticalGap;
        const startTop = marginSafe + Math.max(0, Math.floor((maxHeight - totalNeeded) / 2)); // garante margem igual em cima e embaixo

        const fixedPositions = state.classesOvos.map((classe, index) => ({
            id: classe.id,
            top: Math.max(10, Math.floor(startTop + index * (circleSize + verticalGap))),
            cor: classe.cor
        }));
        return fixedPositions.map(position => {
            const selectedClass = classes.find(c => c.id === position.id);
            if (selectedClass) {
                let extraStyle = '';
                if (selectedClass.tipo === 'branco') {
                    extraStyle = 'border: 4px solid white; box-shadow: 0 0 0 1px #ccc;';
                } else if (selectedClass.tipo === 'vermelho') {
                    extraStyle = 'border: 4px solid #ef4444;';
                } // 'misto' usa CSS com pseudo-elemento
                return `
                    <div class="egg-class-item tipo-${selectedClass.tipo}" style="
                        background-color: ${position.cor};
                        top: ${position.top}px;
                        height: ${circleSize}px; width: ${circleSize}px; ${extraStyle}
                    "></div>
                `;
            }
            return '';
        }).join('');
    }
    function renderClassesList() {
        const classList = document.getElementById('classes-list');
        if (!classList) return;
        
        const html = state.classesOvos.map(classe => {
            const id = classe.id;
            const ids = ['C1','C2','C3','C4','C5','C6','C7'];
            const isRange = ids.includes(id);
            const idx = isRange ? ids.indexOf(id) : -1;
            const plcName = isRange ? (state.dynamicLabels[idx] || '#######') : classe.nome;
            return `
                <div class="egg-class">
                    <span>${id}</span>
                    <div class="egg-color" style="background-color: ${classe.cor}"></div>
                    ${isRange ? `<span>${plcName}</span>` : ''}
                </div>
            `;
        }).join('');
        classList.innerHTML = html + `
            <button id="edit-labels-btn" class="control-btn edit-labels-btn" title="Editar nomes das faixas" style="width:36px;height:36px;">
                <img src="/static/images/pages/icons/comandos/icone_editar.png" alt="Editar" />
            </button>
        `;
        
        // Adiciona event listener ao botão de editar após criá-lo
        const editLabelsBtn = document.getElementById('edit-labels-btn');
        if (editLabelsBtn) {
            editLabelsBtn.addEventListener('click', () => {
                // Pré-carrega inputs com os rótulos atuais
                const ids = ['C1','C2','C3','C4','C5','C6','C7'];
                ids.forEach((_, idx) => {
                    const inp = document.getElementById(`lbl-C${idx+1}`);
                    if (inp) inp.value = state.dynamicLabels[idx] || '';
                });
                showModal('labels-editor-modal');
            });
        }
    }
    function showClassModal(embaladora) {
        if (!embaladora) return;
        console.log('Showing modal for:', embaladora.nome);
        const modal = document.getElementById('class-modal');
        const selectedEmbSpan = document.getElementById('selected-embaladora');
        const options = document.getElementById('class-options');
        
        if (!modal || !selectedEmbSpan || !options) return;
        let displayName = embaladora.nome;
        // Formata para exibir apenas o número sem o prefixo 'E' (ex.: 'E05' -> '05')
        if (typeof displayName === 'string' && /^E\d{2}$/.test(displayName)) {
            displayName = displayName.replace(/^E/, '');
        }
        selectedEmbSpan.textContent = displayName;
        
        options.innerHTML = state.classesOvos.map(classe => {
            const existingClass = embaladora.classes.find(c => c.id === classe.id);
            let selectedType = existingClass?.tipo || '';
            // Para SPJ, o estado pode ter vindo do PLC como branco/vermelho/misto; honrar exatamente o tipo
            const id = classe.id;
            const ids = ['C1','C2','C3','C4','C5','C6','C7'];
            const isRange = ids.includes(id);
            const idx = isRange ? ids.indexOf(id) : -1;
            const plcName = isRange ? (state.dynamicLabels[idx] || '#######') : classe.nome;
            const isCrackVisio = (id === 'CRACK' || id === 'VISIO');
            const buttonsHtml = isCrackVisio
                ? `
                    <button class="type-btn type-misto ${selectedType === 'misto' ? 'selected' : ''}"
                            data-emb="${embaladora.id}"
                            data-class="${classe.id}"
                            data-type="misto">
                        Misto
                    </button>
                  `
                : `
                    <button class="type-btn type-branco ${selectedType === 'branco' ? 'selected' : ''}" 
                            data-emb="${embaladora.id}" 
                            data-class="${classe.id}" 
                            data-type="branco">
                        Branco
                    </button>
                    <button class="type-btn type-vermelho ${selectedType === 'vermelho' ? 'selected' : ''}" 
                            data-emb="${embaladora.id}" 
                            data-class="${classe.id}" 
                            data-type="vermelho">
                        Vermelho
                    </button>
                    <button class="type-btn type-misto ${selectedType === 'misto' ? 'selected' : ''}" 
                            data-emb="${embaladora.id}" 
                            data-class="${classe.id}" 
                            data-type="misto">
                        Misto
                    </button>
                  `;

            return `
                <div class="class-option">
                    <span>${id}</span>
                    <div class="color-box" style="background-color: ${classe.cor};"></div>
                    ${isRange ? `<span>${plcName}</span>` : ''}
                    <div class="type-buttons">
                        ${buttonsHtml}
                    </div>
                </div>
            `;
        }).join('');
        
        options.querySelectorAll('.type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const embId = e.target.getAttribute('data-emb');
                const classId = e.target.getAttribute('data-class');
                const type = e.target.getAttribute('data-type');
                handleClassSelection(embId, classId, type);
            });
        });
        modal.classList.add('show');
    }
    function handleClassSelection(embId, classId, tipo) {
        console.log('Selection:', embId, classId, tipo);
        const embaladora = state.embaladoras.find(e => e.id === embId);
        const classe = state.classesOvos.find(c => c.id === classId);
        
        if (!embaladora || !classe) return;
        const embIndex = state.embaladoras.findIndex(e => e.id === embId);
        if (embIndex === -1) return;
        const novasClasses = [...state.embaladoras[embIndex].classes];
        const existingClassIndex = novasClasses.findIndex(c => c.id === classId);
        
        if (existingClassIndex !== -1 && novasClasses[existingClassIndex].tipo === tipo) {
            // Remove a classe se clicar no mesmo tipo
            novasClasses.splice(existingClassIndex, 1);
            
            const button = document.querySelector(`.type-btn[data-emb="${embId}"][data-class="${classId}"][data-type="${tipo}"]`);
            if (button) {
                button.classList.remove('selected');
            }
            // Sincroniza com PLC limpando bits
            syncSelectionToPLC(embId, classId, null).then((ok) => {
                if (!ok) console.warn('Falha ao limpar seleção no PLC');
            });
        } else {
            // Remove a classe existente se houver
            if (existingClassIndex !== -1) {
                novasClasses.splice(existingClassIndex, 1);
            }
            
            // Adiciona a nova classe com o tipo selecionado
            novasClasses.push({ 
                id: classe.id,
                nome: classe.nome,
                cor: classe.cor,
                tipo: tipo
            });
            
        // Atualiza os botões visuais (se modal ainda aberto)
        const buttons = document.querySelectorAll(`.type-btn[data-emb="${embId}"][data-class="${classId}"]`);
        if (buttons && buttons.length) {
            buttons.forEach(btn => {
                btn.classList.remove('selected');
            });
            const selectedButton = document.querySelector(`.type-btn[data-emb="${embId}"][data-class="${classId}"][data-type="${tipo}"]`);
            if (selectedButton) selectedButton.classList.add('selected');
        }
            // Sincroniza com PLC conforme tipo escolhido
            syncSelectionToPLC(embId, classId, tipo).then((ok) => {
                if (!ok) console.warn('Falha ao escrever seleção no PLC');
            });
        }
        state.embaladoras[embIndex].classes = novasClasses;
        console.log('Estado atualizado:', state.embaladoras[embIndex]);
        renderGrid();
    }
    function handleSalvarPreset() {
        console.log('=== INÍCIO handleSalvarPreset ===');
        const nomeInput = document.getElementById('recipe-name');
        if (!nomeInput) {
            console.error('Campo recipe-name não encontrado');
            return;
        }
        
        // Força o foco e aguarda um pouco para garantir que o valor está atualizado
        nomeInput.focus();
        
        // Aguarda um pouco para garantir que o valor esteja atualizado
        setTimeout(() => {
            const nomePreset = nomeInput.value.trim();
            console.log('Nome do preset:', nomePreset);
            console.log('Valor bruto do input:', nomeInput.value);
            console.log('Valor após trim:', nomePreset);
            console.log('Tamanho do nome:', nomePreset.length);
            
            // Validação mais robusta - verifica se é uma string válida e não vazia
            if (!nomePreset || 
                nomePreset === '' || 
                nomePreset.length === 0 || 
                nomePreset === 'undefined' || 
                nomePreset === 'null' ||
                typeof nomePreset !== 'string' ||
                nomePreset.replace(/\s/g, '').length === 0) {
                console.log('Nome inválido, pulando salvamento');
                return;
            }
            
            console.log('Nome válido, continuando com salvamento...');
            continueSalvarPreset(nomePreset);
        }, 200); // Aumentei o delay para 200ms
    }
    
    function continueSalvarPreset(nomePreset) {
        console.log('=== CONTINUANDO SALVAMENTO ===');
        const nomeInput = document.getElementById('recipe-name');
        const editingId = nomeInput.dataset.editing;
        // Cria uma cópia profunda da configuração atual
        const configuracaoAtual = state.embaladoras.map(emb => ({
            id: emb.id,
            nome: emb.nome,
            classes: emb.classes.map(classe => ({
                id: classe.id,
                nome: classe.nome,
                cor: classe.cor,
                tipo: classe.tipo
            }))
        }));
        console.log('Salvando preset com configuração:', configuracaoAtual);
        const novoPreset = {
            id: editingId ? Number(editingId) : Date.now(),
            nome: nomePreset,
            configuracao: configuracaoAtual,
            dataCriacao: new Date().toISOString()
        };
        if (editingId) {
            const index = state.presets.findIndex(p => p.id === Number(editingId));
            if (index !== -1) {
                state.presets[index] = novoPreset;
            }
        } else {
            state.presets.push(novoPreset);
        }
        // Salva no localStorage
        try {
            localStorage.setItem('classification_presets', JSON.stringify(state.presets));
            console.log('Presets salvos no localStorage');
        } catch (error) {
            console.error('Erro ao salvar no localStorage:', error);
        }
        renderPresets();
        
        // Limpa o campo e remove dados de edição
        nomeInput.value = '';
        delete nomeInput.dataset.editing;
        
        // Feedback visual
        const saveBtn = document.getElementById('save-recipe-btn');
        const originalText = saveBtn.textContent;
        saveBtn.textContent = 'Salvo!';
        saveBtn.style.backgroundColor = '#22c55e';
        setTimeout(() => {
            saveBtn.textContent = originalText;
            saveBtn.style.backgroundColor = '';
        }, 1500);
        
        console.log('=== FIM SALVAMENTO ===');
    }
    function renderPresets() {
        console.log('renderPresets chamado');
        const presetList = document.getElementById('recipe-list');
        if (!presetList) {
            console.log('Elemento recipe-list não encontrado');
            return;
        }
        
        // Carrega do localStorage se ainda não carregado nesta sessão
        try {
            const raw = localStorage.getItem('classification_presets');
            console.log('Dados do localStorage:', raw);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    state.presets = parsed;
                    console.log('Presets carregados do localStorage:', state.presets);
                }
            }
        } catch (e) { 
            console.error('Erro ao carregar presets do localStorage:', e);
        }

        presetList.innerHTML = state.presets.map(preset => {
            const embaladorasConfiguradas = preset.configuracao.filter(emb => emb.classes.length > 0).length;
            const totalClasses = preset.configuracao.reduce((acc, emb) => acc + emb.classes.length, 0);
            
            return `
                <div class="recipe-item">
                    <div>
                        <strong>${preset.nome}</strong>
                        <br>
                        <small>${embaladorasConfiguradas} embaladoras • ${totalClasses} classes configuradas</small>
                    </div>
                    <div class="recipe-actions">
                        <button class="btn-action btn-edit" data-id="${preset.id}">Editar</button>
                        <button class="btn-action btn-load" data-id="${preset.id}">Carregar</button>
                        <button class="btn-action btn-delete" data-id="${preset.id}">Excluir</button>
                    </div>
                </div>
            `;
        }).join('');
        
        // Event listeners para os botões
        presetList.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', () => {
                handleEditPreset(btn.getAttribute('data-id'));
            });
        });
        
        presetList.querySelectorAll('.btn-load').forEach(btn => {
            btn.addEventListener('click', () => {
                handleLoadPreset(btn.getAttribute('data-id'));
            });
        });
        
        presetList.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                handleDeletePreset(btn.getAttribute('data-id'));
            });
        });
    }
    // Mantém as helpers necessárias acima desta função para evitar 'is not defined'
    async function handleLoadPreset(presetId) {
        console.log('=== INÍCIO handleLoadPreset ===');
        console.log('ID do preset:', presetId, 'tipo:', typeof presetId);
        console.log('Presets disponíveis:', state.presets);
        console.log('Presets IDs:', state.presets.map(p => p.id));
        
        const preset = state.presets.find(p => p.id === Number(presetId));
        if (!preset) {
            console.error('Preset não encontrado:', presetId);
            console.error('IDs disponíveis:', state.presets.map(p => p.id));
            return;
        }
        console.log('Preset encontrado:', preset);
        console.log('Configuração do preset:', preset.configuracao);
        console.log('Quantidade de embaladoras na configuração:', preset.configuracao.length);

        // Ativa flag para evitar que PLC sobrescreva durante carregamento
        state.isLoadingRecipe = true;
        state.lastRecipeLoad = Date.now();
        console.log('Flag isLoadingRecipe ativada e timestamp definido');

        // Limpa todas as classes primeiro
        console.log('Limpando classes existentes...');
        state.embaladoras.forEach(emb => {
            emb.classes = [];
        });

        // Aplica as configurações do preset
        console.log('Aplicando configurações do preset...');
        console.log('Estado das embaladoras ANTES da aplicação:', state.embaladoras.map(emb => ({id: emb.id, classes: emb.classes.length})));
        
        preset.configuracao.forEach((configEmb, index) => {
            console.log(`Processando configuração ${index}:`, configEmb);
            const emb = state.embaladoras.find(e => e.id === configEmb.id);
            console.log(`Embaladora encontrada para ${configEmb.id}:`, emb ? 'SIM' : 'NÃO');
            
            if (emb && Array.isArray(configEmb.classes)) {
                console.log(`Aplicando configuração para ${configEmb.id}:`, configEmb.classes);
                console.log(`Classes antes:`, emb.classes);
                
                // Copia todas as propriedades, inclusive tipo
                emb.classes = configEmb.classes.map(classe => ({
                    id: classe.id,
                    nome: classe.nome,
                    cor: classe.cor,
                    tipo: classe.tipo
                }));
                
                console.log(`Classes aplicadas para ${configEmb.id}:`, emb.classes);
            } else {
                console.log(`Pulando ${configEmb.id} - embaladora não encontrada ou classes inválidas`);
            }
        });
        
        console.log('Estado das embaladoras APÓS a aplicação:', state.embaladoras.map(emb => ({id: emb.id, classes: emb.classes.length})));
        
        console.log('Estado final após aplicar preset:', state.embaladoras);

        // Primeiro atualiza a interface visual
        console.log('Atualizando interface visual...');
        renderGrid();
        renderStatus();
        renderHeaders();
        renderClassesList();
        
        // Força uma segunda atualização após um pequeno delay para garantir que a interface seja atualizada
        setTimeout(() => {
            console.log('Forçando segunda atualização da interface...');
            renderGrid();
        }, 100);

        // NOVA IMPLEMENTAÇÃO: Usa o carregador de receitas para gravar no PLC
        let syncSuccess = false;
        try {
            console.log('=== VERIFICANDO DISPONIBILIDADE DO RECIPE LOADER ===');
            console.log('typeof RecipeLoader:', typeof RecipeLoader);
            console.log('window.RecipeLoader:', window.RecipeLoader);
            
            // NOVA IMPLEMENTAÇÃO: Sincronização otimizada em lote
            console.log('🔧 SINCRONIZAÇÃO OTIMIZADA: Escrevendo receita no PLC em lote...');
            console.log('Verificando disponibilidade das funções:');
            console.log('syncAllSelectionsToPLC:', typeof syncAllSelectionsToPLC);
            
            if (typeof syncAllSelectionsToPLC === 'function') {
                // Usa a função otimizada que escreve tudo de uma vez
                console.log('Usando syncAllSelectionsToPLC para escrita em lote...');
                syncSuccess = await syncAllSelectionsToPLC();
                console.log('Resultado da sincronização em lote:', syncSuccess);
            } else {
                console.error('❌ Função de sincronização em lote não está disponível!');
                console.error('syncAllSelectionsToPLC:', typeof syncAllSelectionsToPLC);
                syncSuccess = false;
            }
            
            // Verifica se o RecipeLoader está disponível (comentado temporariamente)
            /*
            if (typeof RecipeLoader !== 'undefined') {
                console.log('✅ RecipeLoader disponível, usando carregador de receitas...');
                const recipeLoader = new RecipeLoader();
                console.log('RecipeLoader instanciado:', recipeLoader);
                
                // Valida a receita antes de carregar
                console.log('Validando receita...');
                const erros = recipeLoader.validateRecipe(preset);
                console.log('Erros de validação:', erros);
                
                if (erros.length > 0) {
                    console.error('❌ Erros na receita:', erros);
                    showNotification('Receita inválida: ' + erros.join(', '));
                    return;
                }
                
                console.log('✅ Receita válida, carregando no PLC...');
                // Carrega a receita no PLC usando o carregador
                syncSuccess = await recipeLoader.loadRecipeToPLC(preset, writeWords);
                console.log('Resultado do carregamento:', syncSuccess);
                
                if (syncSuccess) {
                    console.log('✅ Receita carregada com sucesso usando RecipeLoader');
                } else {
                    console.warn('⚠️ Falha ao carregar receita com RecipeLoader, tentando método antigo...');
                    // Fallback para o método antigo
                    syncSuccess = await syncFullStateToPLC();
                    const verified = await verifySelectionsWithPLC();
                    syncSuccess = syncSuccess && verified;
                }
            } else {
                console.log('❌ RecipeLoader não disponível, usando método antigo...');
                // Método antigo como fallback
                syncSuccess = await syncFullStateToPLC();
                const verified = await verifySelectionsWithPLC();
                syncSuccess = syncSuccess && verified;
            }
            */
        } catch (error) {
            console.error('❌ Erro ao carregar receita:', error);
            console.error('Stack trace:', error.stack);
            // Fallback para o método antigo em caso de erro
            try {
                console.log('Tentando fallback...');
                syncSuccess = await syncFullStateToPLC();
                const verified = await verifySelectionsWithPLC();
                syncSuccess = syncSuccess && verified;
                console.log('Resultado do fallback:', syncSuccess);
            } catch (fallbackError) {
                console.error('❌ Erro no fallback:', fallbackError);
                syncSuccess = false;
            }
        }

        hideModal('recipe-modal');
        
        if (syncSuccess) {
            showNotification('Receita carregada com sucesso!');
        } else {
            showNotification('Receita carregada, mas alguns dados podem não ter sido sincronizados com o PLC');
        }
        
        // Mantém a flag ativa por muito mais tempo para evitar sobrescrita do PLC
        setTimeout(() => {
            state.isLoadingRecipe = false;
            console.log('Flag isLoadingRecipe desativada após delay');
        }, 10000); // 10 segundos de proteção
        
        console.log('=== FIM handleLoadPreset ===');
    }
    function handleEditPreset(presetId) {
        const preset = state.presets.find(p => p.id === Number(presetId));
        if (!preset) return;
        const nameInput = document.getElementById('recipe-name');
        nameInput.value = preset.nome;
        nameInput.dataset.editing = presetId;
        const saveBtn = document.getElementById('save-recipe-btn');
        saveBtn.textContent = 'Atualizar';
    }
    function handleDeletePreset(presetId) {
        if (confirm('Tem certeza que deseja excluir esta receita?')) {
            state.presets = state.presets.filter(p => p.id !== Number(presetId));
            localStorage.setItem('classification_presets', JSON.stringify(state.presets));
            renderPresets();
            showNotification('Receita excluída com sucesso!');}
    }
    function showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('show');
    }
    function hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('show');
    }
    function showNotification(message) {
        // Cria uma notificação simples
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #22c55e;
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            z-index: 10000;
            font-size: 14px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // Remove após 3 segundos
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }
    
    // Função de teste para debug
    function testRecipeSystem() {
        console.log('=== TESTE DO SISTEMA DE RECEITAS ===');
        console.log('Estado atual das embaladoras:', state.embaladoras);
        console.log('Presets carregados:', state.presets);
        console.log('Elementos DOM:');
        console.log('- recipe-modal:', document.getElementById('recipe-modal'));
        console.log('- recipe-name:', document.getElementById('recipe-name'));
        console.log('- save-recipe-btn:', document.getElementById('save-recipe-btn'));
        console.log('- recipe-list:', document.getElementById('recipe-list'));
        
        // Testa se consegue criar um preset de teste
        const testPreset = {
            id: Date.now(),
            nome: 'Teste Debug',
            configuracao: [{
                id: 'E01',
                nome: 'E01',
                classes: [{
                    id: 'C1',
                    nome: 'C1',
                    cor: '#FF3399',
                    tipo: 'branco'
                }]
            }],
            dataCriacao: new Date().toISOString()
        };
        
        console.log('Preset de teste criado:', testPreset);
        state.presets.push(testPreset);
        renderPresets();
        console.log('Preset de teste adicionado à lista');
        console.log('=====================================');
    }
    
    // Função para testar carregamento
    function testLoadRecipe() {
        if (state.presets.length > 0) {
            console.log('Testando carregamento da primeira receita...');
            handleLoadPreset(state.presets[0].id);
        } else {
            console.log('Nenhuma receita disponível para teste');
        }
    }
    
    // Função para testar sincronização manual
    async function testManualSync() {
        console.log('=== TESTE DE SINCRONIZAÇÃO MANUAL ===');
        console.log('Estado atual das embaladoras:', state.embaladoras);
        
        // Testa com uma embaladora específica
        const testEmb = state.embaladoras.find(emb => emb.id === 'E01');
        if (testEmb) {
            console.log('Testando com E01:', testEmb);
            if (testEmb.classes.length > 0) {
                const testClass = testEmb.classes[0];
                console.log('Testando sincronização:', testEmb.id, testClass.id, testClass.tipo);
                const result = await syncSelectionToPLC(testEmb.id, testClass.id, testClass.tipo);
                console.log('Resultado da sincronização manual:', result);
            } else {
                console.log('E01 não tem classes para testar');
            }
        } else {
            console.log('E01 não encontrada');
        }
    }
    
    // Função para testar API diretamente
    async function testAPI() {
        console.log('=== TESTE DA API ===');
        const testPayload = {
            'XLCLASS_DB200_CLASSIFICACAO_P1[0]': 1
        };
        console.log('Enviando payload de teste:', testPayload);
        const result = await writeWords(testPayload);
        console.log('Resultado da API:', result);
    }
    
    // Função para testar carregamento específico
    async function testLoadSpecificRecipe(recipeIndex = 0) {
        console.log('=== TESTE DE CARREGAMENTO ESPECÍFICO ===');
        console.log('Presets disponíveis:', state.presets);
        
        if (state.presets.length === 0) {
            console.log('Nenhuma receita disponível');
            return;
        }
        
        const recipe = state.presets[recipeIndex];
        console.log(`Carregando receita ${recipeIndex}:`, recipe.nome);
        console.log('Configuração:', recipe.configuracao);
        
        // Chama a função de carregamento
        await handleLoadPreset(recipe.id);
        
        console.log('=== FIM TESTE DE CARREGAMENTO ===');
    }
    
    // Função para testar sincronização simples
    async function testSimpleSync() {
        console.log('=== TESTE DE SINCRONIZAÇÃO SIMPLES ===');
        
        // Testa com uma configuração simples
        const testConfig = {
            embId: 'E01',
            classId: 'C1',
            tipo: 'branco'
        };
        
        console.log('Testando com:', testConfig);
        const result = await syncSelectionToPLC(testConfig.embId, testConfig.classId, testConfig.tipo);
        console.log('Resultado:', result);
        
        console.log('=== FIM TESTE SIMPLES ===');
    }
    
    // Função para verificar estado atual
    function checkCurrentState() {
        console.log('=== ESTADO ATUAL ===');
        console.log('Embaladoras:', state.embaladoras.map(emb => ({
            id: emb.id,
            classesCount: emb.classes.length,
            classes: emb.classes.map(c => ({id: c.id, tipo: c.tipo}))
        })));
        console.log('Presets:', state.presets.length);
        console.log('isLoadingRecipe:', state.isLoadingRecipe);
        console.log('lastRecipeLoad:', state.lastRecipeLoad);
        console.log('=== FIM ESTADO ===');
    }
    
    // Torna as funções de teste disponíveis globalmente
    window.testRecipeSystem = testRecipeSystem;
    window.testLoadRecipe = testLoadRecipe;
    window.testManualSync = testManualSync;
    window.testAPI = testAPI;
    window.testLoadSpecificRecipe = testLoadSpecificRecipe;
    window.testSimpleSync = testSimpleSync;
    window.checkCurrentState = checkCurrentState;
    function setupEventListeners() {
        document.querySelectorAll('.close-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) {
                    // Se for o modal de receitas, limpa o campo
                    if (modal.id === 'recipe-modal') {
                        const nomeInput = document.getElementById('recipe-name');
                        if (nomeInput) {
                            nomeInput.value = '';
                            delete nomeInput.dataset.editing;
                        }
                        const saveBtn = document.getElementById('save-recipe-btn');
                        if (saveBtn) {
                            saveBtn.textContent = 'Salvar';
                            saveBtn.style.backgroundColor = '';
                        }
                    }
                    hideModal(modal.id);
                }
            });
        });
        const recipeBtn = document.getElementById('recipe-btn');
        if (recipeBtn) {
            recipeBtn.addEventListener('click', () => {
                // Limpa o campo de nome quando abrir o modal para nova receita
                const nomeInput = document.getElementById('recipe-name');
                if (nomeInput) {
                    nomeInput.value = '';
                    delete nomeInput.dataset.editing;
                }
                // Reseta o botão para "Salvar"
                const saveBtn = document.getElementById('save-recipe-btn');
                if (saveBtn) {
                    saveBtn.textContent = 'Salvar';
                    saveBtn.style.backgroundColor = '';
                }
                showModal('recipe-modal');
            });
        }
        const saveRecipeBtn = document.getElementById('save-recipe-btn');
        if (saveRecipeBtn) {
            console.log('Botão save-recipe-btn encontrado, adicionando listener');
            saveRecipeBtn.addEventListener('click', (e) => {
                console.log('Botão salvar clicado');
                e.preventDefault();
                e.stopPropagation();
                
                // Remove o foco do input para evitar abrir teclado
                const nomeInput = document.getElementById('recipe-name');
                if (nomeInput) {
                    nomeInput.blur();
                }
                
                // Pequeno delay para garantir que o valor do input esteja atualizado
                setTimeout(() => {
                    handleSalvarPreset();
                }, 50);
            });
        } else {
            console.log('Botão save-recipe-btn NÃO encontrado');
        }
        
        // Removido listener do formulário para evitar conflitos - apenas o botão será usado
        
        // Adiciona listener para o input também (Enter) e teclado virtual
        const recipeNameInput = document.getElementById('recipe-name');
        if (recipeNameInput) {
            console.log('Input recipe-name encontrado, adicionando listeners');
            
            // Listener para Enter
            recipeNameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    console.log('Enter pressionado no input');
                    e.preventDefault();
                    e.stopPropagation();
                    handleSalvarPreset();
                }
            });
            
            // Listener para abrir teclado virtual apenas no click
            recipeNameInput.addEventListener('click', () => {
                console.log('Abrindo teclado virtual para nome da receita');
                abrirTecladoSimples(recipeNameInput);
            });
            
            // Removido listener de focus para evitar abrir teclado automaticamente
            // recipeNameInput.addEventListener('focus', () => {
            //     console.log('Foco no input, abrindo teclado virtual');
            //     abrirTecladoSimples(recipeNameInput);
            // });
            
            recipeNameInput.addEventListener('touchstart', () => {
                console.log('Touch no input, abrindo teclado virtual');
                abrirTecladoSimples(recipeNameInput);
            }, { passive: true });
        } else {
            console.log('Input recipe-name NÃO encontrado');
        }
        const clearBtn = document.getElementById('clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', async () => {
                // NÃO limpa localmente; o PLC executa a limpeza.
                // Envia comando: setar bit 8 nas duas tags de comando (pulso)
                const BIT = 8;
                const CMD_R = 'XLCLASS_DB201_CLASSIFICACAO_COMANDO_STATUS';
                const CMD_W = 'XLCLASS_DB200_CLASSIFICACAO_COMANDO_STATUS';
                try {
                    const current = await readWords([CMD_R, CMD_W]);
                    const vR = Number(current[CMD_R] ?? 0) >>> 0;
                    const vW = Number(current[CMD_W] ?? 0) >>> 0;
                    const nextR = setBit(vR, BIT, true) >>> 0;
                    const nextW = setBit(vW, BIT, true) >>> 0;
                    const ok1 = await writeWords({ [CMD_R]: nextR, [CMD_W]: nextW });
                    if (!ok1) console.warn('Falha ao setar comando bit 8');
                    // Reset curto do pulso
                    setTimeout(async () => {
                        try {
                            const resetR = setBit(nextR, BIT, false) >>> 0;
                            const resetW = setBit(nextW, BIT, false) >>> 0;
                            await writeWords({ [CMD_R]: resetR, [CMD_W]: resetW });
                        } catch (_) {}
                    }, 150);

                    // Após o pulso, solicita atualização das seleções a partir do PLC
                    // Faz algumas tentativas para aguardar a lógica do PLC concluir a limpeza
                    const retries = [200, 500, 900];
                    for (const delay of retries) {
                        setTimeout(() => {
                            refreshSelectionsFromPLC(true);
                        }, delay);
                    }
                } catch (e) {
                    console.error('Erro no comando de limpar (bit 8):', e);
                }
            });
        }

        // Power buttons listeners
        const powerOnBtn = document.getElementById('power-btn-on');
        const powerOffBtn = document.getElementById('power-btn-off');
        if (powerOnBtn) powerOnBtn.addEventListener('click', togglePowerBit);
        if (powerOffBtn) powerOffBtn.addEventListener('click', togglePowerBit);
        const labelsModal = document.getElementById('labels-editor-modal');
        if (labelsModal) {
            const cancelBtn = document.getElementById('labels-cancel');
            if (cancelBtn) cancelBtn.addEventListener('click', () => hideModal('labels-editor-modal'));
            const form = document.getElementById('labels-editor-form');
            if (form) {
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const inputs = [
                        document.getElementById('lbl-C1'),
                        document.getElementById('lbl-C2'),
                        document.getElementById('lbl-C3'),
                        document.getElementById('lbl-C4'),
                        document.getElementById('lbl-C5'),
                        document.getElementById('lbl-C6'),
                        document.getElementById('lbl-C7')
                    ];
                    // Escreve em série para simplificar (pode ser paralelizado se necessário)
                    let ok = true;
                    for (let i = 0; i < inputs.length; i++) {
                        const success = await api.setLabel(i, inputs[i]?.value ?? '');
                        if (!success) ok = false;
                    }
                    if (!ok) {
                        alert('Falha ao salvar algumas faixas no PLC.');
                    }
                    // Atualiza estado e UI
                    const labels = await api.getLabels();
                    if (Array.isArray(labels) && labels.length === 7) {
                        state.dynamicLabels = labels.map(v => (v && v.trim() !== '' ? v.trim() : null));
                        renderGrid();
                        renderClassesList();
                    }
                    hideModal('labels-editor-modal');
                });
                
                // Adiciona event listeners para abrir teclado virtual nos inputs
                setTimeout(() => {
                    const inputs = ['lbl-C1', 'lbl-C2', 'lbl-C3', 'lbl-C4', 'lbl-C5', 'lbl-C6', 'lbl-C7'];
                    inputs.forEach(id => {
                        const input = document.getElementById(id);
                        if (input) {
                            // Remove listeners existentes para evitar duplicação
                            input.removeEventListener('click', abrirTecladoSimples);
                            input.removeEventListener('focus', abrirTecladoSimples);
                            input.removeEventListener('touchstart', abrirTecladoSimples);

                            // Adiciona novos listeners sem bloquear o foco padrão
                            input.addEventListener('click', () => {
                                abrirTecladoSimples(input);
                            });
                            input.addEventListener('focus', () => {
                                abrirTecladoSimples(input);
                            });
                            input.addEventListener('touchstart', () => {
                                abrirTecladoSimples(input);
                            }, { passive: true });
                        }
                    });
                }, 100);
            }
        }
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) hideModal(modal.id);
            });
        });
    }

    // Initialization
    function initialize() {
        console.log('Inicializando sistema de classificação...');
        renderStatus();
        renderHeaders();
        renderGrid();
        renderClassesList();
        console.log('Chamando setupEventListeners...');
        setupEventListeners();
        console.log('Chamando renderPresets...');
        renderPresets();

        // Subscrição quando a tela abre
        subscribeScreen();
        startHeartbeat();

        // Carrega nomes dinâmicos das classes (C1..C7) como na tela de faixa de peso
        api.getLabels().then((labels) => {
            if (Array.isArray(labels) && labels.length === 7) {
                state.dynamicLabels = labels.map(v => (v && v.trim() !== '' ? v.trim() : null));
                // Re-renderiza para refletir nomes adicionais
                renderGrid();
                renderClassesList();
            }
        });

        // Força leitura do PLC ao abrir a tela para preencher os cards
        setTimeout(() => { refreshSelectionsFromPLC(true); }, 150);

        // Polling periódico para atualizar nomes das faixas do PLC automaticamente
        const LABEL_REFRESH_MS = 2000; // 2s (ajuste se necessário)
        let labelTimer = setInterval(async () => {
            try {
                const labels = await api.getLabels();
                if (Array.isArray(labels) && labels.length === 7) {
                    const normalized = labels.map(v => (v && v.trim() !== '' ? v.trim() : null));
                    if (!arraysEqual(state.dynamicLabels, normalized)) {
                        state.dynamicLabels = normalized;
                        renderClassesList();
                    }
                }
            } catch (_) { /* ignora erros transitórios */ }
        }, LABEL_REFRESH_MS);

        // Polling apenas do alerta de parada (SEM sincronização automática)
        const ALERT_REFRESH_MS = 1000;
        let lastAlertText = '';
        let lastVisible = false;
        let lastGreenVisible = false;
        let alertTimer = setInterval(async () => {
            const { rawAlert, rawStatus } = await getAlertAndStatus();
            // Atualiza power pela leitura do status
            updatePowerButtonsFromStatus(rawStatus);
            const text = computeAlertText(rawAlert);
            const bit8Set = ((rawStatus >>> 8) & 1) === 1; // bit 8 == 1?
            const visible = (rawAlert !== 0) && !bit8Set;
            const showGreen = bit8Set; // quando bit8 = 1, mostra garra verde animada

            if (text !== lastAlertText || visible !== lastVisible || showGreen !== lastGreenVisible) {
                lastAlertText = text;
                lastVisible = visible;
                lastGreenVisible = showGreen;
                renderAlert(text, visible);
                renderClaw(visible);
                renderClawGreen(showGreen);
            }
            // REMOVIDO: refreshSelectionsFromPLC() - não sincroniza mais automaticamente
        }, ALERT_REFRESH_MS);

        // Pausa quando aba não está visível para economizar recursos
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (labelTimer) { clearInterval(labelTimer); labelTimer = null; }
                if (alertTimer) { clearInterval(alertTimer); alertTimer = null; }
                stopHeartbeat();
                unsubscribeScreen();
            } else {
                // Ao voltar para esta aba/tela, força leitura do PLC para repovoar os cards
                setTimeout(() => { refreshSelectionsFromPLC(true); }, 200);
                subscribeScreen();
                startHeartbeat();
                if (!labelTimer) {
                    labelTimer = setInterval(async () => {
                    try {
                        const labels = await api.getLabels();
                        if (Array.isArray(labels) && labels.length === 7) {
                            const normalized = labels.map(v => (v && v.trim() !== '' ? v.trim() : null));
                            if (!arraysEqual(state.dynamicLabels, normalized)) {
                                state.dynamicLabels = normalized;
                                renderClassesList();
                            }
                        }
                    } catch (_) {}
                    }, LABEL_REFRESH_MS);
                }
                if (!alertTimer) {
                    alertTimer = setInterval(async () => {
                    const { rawAlert, rawStatus } = await getAlertAndStatus();
                    updatePowerButtonsFromStatus(rawStatus);
                        const text = computeAlertText(rawAlert);
                        const bit8Set = ((rawStatus >>> 8) & 1) === 1;
                        const visible = (rawAlert !== 0) && !bit8Set;
                        const showGreen = bit8Set;
                        if (text !== lastAlertText || visible !== lastVisible || showGreen !== lastGreenVisible) {
                            lastAlertText = text;
                            lastVisible = visible;
                            lastGreenVisible = showGreen;
                            renderAlert(text, visible);
                            renderClaw(visible);
                            renderClawGreen(showGreen);
                        }
                        // REMOVIDO: refreshSelectionsFromPLC() - não sincroniza mais automaticamente
                    }, ALERT_REFRESH_MS);
                }
            }
        });

        // Simulate active status updates
        setInterval(() => {
            state.embaladoras = state.embaladoras.map(emb => ({
                ...emb,
                ativo: Math.random() > 0.3
            }));
            renderStatus();
        }, 5000);
    }

    // Start initialization
    initialize();
}

// Funções para o teclado virtual simples
let currentInput = null;
let suppressKeyboardOpenUntil = 0;

function abrirTecladoSimples(inputEl) {
    if (Date.now() < suppressKeyboardOpenUntil) {
        return;
    }
    console.log('Abrindo teclado para:', inputEl.id);
    currentInput = inputEl;
    const teclado = document.getElementById('simple-keyboard');
    const input = document.getElementById('keyboard-input');
    
    if (teclado && input) {
        // Garante que o teclado esteja fora de contextos de empilhamento (ex.: menu)
        try {
            if (teclado.parentNode !== document.body) {
                document.body.appendChild(teclado);
            }
        } catch (_) {}
        input.value = inputEl.value || '';
        teclado.style.display = 'block';
        input.focus();
        console.log('Teclado aberto');
    } else {
        console.log('Erro: teclado ou input não encontrado');
    }
}

function fecharTecladoSimples(confirmar) {
    const teclado = document.getElementById('simple-keyboard');
    const input = document.getElementById('keyboard-input');
    
    if (confirmar && currentInput && input) {
        const novoValor = input.value.trim();
        currentInput.value = novoValor;
        try {
            currentInput.dispatchEvent(new Event('input', { bubbles: true }));
            currentInput.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (_) {}
    }
    
    if (teclado) {
        teclado.style.display = 'none';
    }
    // Evita reabrir imediatamente ao perder/ganhar foco
    suppressKeyboardOpenUntil = Date.now() + 400;
    if (currentInput) {
        try { currentInput.blur(); } catch (_) {}
    }
    currentInput = null;
}

// Event listeners para o teclado virtual simples
function setupVirtualKeyboard() {
    const teclado = document.getElementById('simple-keyboard');
    if (!teclado) return;
    if (teclado.dataset.bound === 'true') return; // evita bind duplicado
    teclado.dataset.bound = 'true';
    
    // Impede propagação para elementos atrás
    const stop = (e) => { e.stopPropagation(); };
    // Use apenas mousedown/touchstart para bloquear "fechar ao clicar fora"
    teclado.addEventListener('mousedown', stop);
    teclado.addEventListener('touchstart', stop, { passive: true });

    // Manipulação das teclas
    teclado.addEventListener('click', function(e) {
        const btn = e.target.closest('.key-btn');
        if (!btn) return;

        e.preventDefault();
        e.stopPropagation();

        const input = document.getElementById('keyboard-input');
        if (!input) return;

        const key = btn.dataset.key;
        console.log('Virtual key click:', key);

        if (key === 'backspace') {
            input.value = input.value.slice(0, -1);
        } else if (key === 'ok') {
            fecharTecladoSimples(true);
        } else if (key === 'cancel') {
            fecharTecladoSimples(false);
        } else if (key === 'space') {
            input.value += ' ';
        } else if (key) {
            input.value += key;
        }

        input.focus();
    });

    // Suporte a teclado físico quando o campo do teclado virtual estiver focado
    const kbdInput = document.getElementById('keyboard-input');
    if (kbdInput && kbdInput.dataset.bound !== 'true') {
        kbdInput.dataset.bound = 'true';
        kbdInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                fecharTecladoSimples(true);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                fecharTecladoSimples(false);
            }
        });
    }

    // Fecha ao clicar fora do teclado
    const shouldIgnoreTarget = (el) => {
        if (!el) return false;
        if (el.closest && el.closest('#simple-keyboard')) return true; // clique dentro do teclado
        // campos que disparam a abertura do teclado
        if (el.id && /^lbl-C[1-7]$/.test(el.id)) return true;
        return false;
    };
    const outsideHandler = (e) => {
        const isVisible = teclado && teclado.style.display !== 'none';
        if (!isVisible) return;
        const target = e.target;
        if (shouldIgnoreTarget(target)) return;
        fecharTecladoSimples(false);
    };
    document.addEventListener('mousedown', outsideHandler, true);
    document.addEventListener('touchstart', outsideHandler, { passive: true, capture: true });
}

// Garante inicialização mesmo se o script carregar após DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupVirtualKeyboard);
} else {
    setupVirtualKeyboard();
}

// Call the initialization function when the page loads
document.addEventListener('DOMContentLoaded', function() {
    inicializarClassification();
});

