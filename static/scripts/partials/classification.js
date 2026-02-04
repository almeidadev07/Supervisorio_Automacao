function inicializarClassification() {
    // ✅ Guard global: evita múltiplas instâncias em SPA
    if (window._classificationInitialized) {
        console.warn('[CLASSIFICATION] inicializarClassification chamado com tela já inicializada. Ignorando para evitar vazamento.');
        return;
    }
    // ✅ Sistema de log controlado (desativa logs frequentes para evitar vazamento de memória)
    const DEBUG_CLASSIFICATION = false; // Mude para true apenas para debug
    const logDebug = DEBUG_CLASSIFICATION ? console.log.bind(console) : () => {};
    
    console.log('Inicializando Classification...');
    
    // Função para obter quantidade de embaladoras do localStorage
    function getEmbaladoraQuantity() {
        const saved = localStorage.getItem('supervisor_embaladora_quantity');
        return saved ? parseInt(saved, 10) : 24; // padrão: 24
    }
    
    // Função para filtrar embaladoras baseado na quantidade
    // IMPORTANTE: IND e SPJ sempre aparecem, apenas E01..E24 são filtradas pela quantidade
    function filterEmbaladorasByQuantity(allEmbaladoras, quantity) {
        const cols = [];
        
        // IND sempre aparece (primeira posição)
        const ind = allEmbaladoras.find(e => e.id === 'IND');
        if (ind) cols.push(ind);
        
        // Apenas E01 até E[quantity] aparecem (filtradas pela quantidade)
        for (let i = 1; i <= quantity; i++) {
            const num = String(i).padStart(2, '0');
            const emb = allEmbaladoras.find(e => e.id === `E${num}`);
            if (emb) cols.push(emb);
        }
        
        // SPJ sempre aparece (última posição)
        const spj = allEmbaladoras.find(e => e.id === 'SPJ');
        if (spj) cols.push(spj);
        
        return cols;
    }
    
    // Todas as embaladoras possíveis (IND + E01..E24 + SPJ)
    const allEmbaladoras = (() => {
        const cols = [{ id: 'IND', nome: 'IND', ativo: false, classes: [] }];
        for (let i = 1; i <= 24; i++) {
            const num = String(i).padStart(2, '0');
            cols.push({ id: `E${num}`, nome: `E${num}`, ativo: false, classes: [] });
        }
        cols.push({ id: 'SPJ', nome: 'SPJ', ativo: false, classes: [] });
        return cols;
    })();
    
    const state = {
        allEmbaladoras: allEmbaladoras, // mantém todas para referência
        embaladoras: filterEmbaladorasByQuantity(allEmbaladoras, getEmbaladoraQuantity()),
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
    
    // ✅ SISTEMA DE FILA ROBUSTO - CONTROLE DE ESCRITAS
    // Evita acúmulo infinito de requisições e consumo de memória
    
    const SYNC_PAUSE_MS = 15000; // 15 segundos de pausa na sincronização após escrita (aumentado)
    let lastWriteTime = 0; // Timestamp da última escrita enviada
    let pendingWrites = 0; // Contador de escritas pendentes no backend
    
    // ✅ Timer único para sincronização
    let syncTimer = null;
    
    // ✅ Sistema de fila controlada - máximo de 3 escritas pendentes (reduzido para evitar sobrecarga)
    const MAX_PENDING_WRITES = 3;
    let writeQueue = [];
    let isProcessingQueue = false;
    
    // ✅ Sets para rastrear timers ativos
    const activeTimeouts = new Set();
    const activeIntervals = new Set();
    
    // ✅ Timers globais para controle adequado (evita duplicação)
    let labelTimer = null;
    let selectionTimer = null;
    let alertTimer = null;
    let localStoragePollTimer = null;
    
    // ✅ Handlers de eventos globais para remoção adequada
    let storageEventHandler = null;
    let visibilityChangeHandler = null;
    let resizeHandler = null;
    let resizeTimeout = null;
    
    // ✅ Map para armazenar TODOS os event listeners criados em setupEventListeners
    const setupEventListenersHandlers = new Map();
    
    // ✅ Função para limpar TODOS os listeners de setupEventListeners
    function cleanupSetupEventListeners() {
        setupEventListenersHandlers.forEach((item, key) => {
            try {
                if (item && item.element && item.event && item.handler) {
                    item.element.removeEventListener(item.event, item.handler);
                }
            } catch (e) {
                console.warn(`[CLASSIFICATION] Erro ao remover listener ${key}:`, e);
            }
        });
        setupEventListenersHandlers.clear();
        console.log('[CLASSIFICATION] 🧹 Todos os listeners de setupEventListeners removidos');
    }
    
    // ✅ Constantes de intervalo para reuso (valores maiores = menos uso de memória)
    const LABEL_REFRESH_MS = 3000; // 3s entre leituras de labels
    const SELECTION_REFRESH_MS = 60000; // 60s entre leituras de seleções (raramente muda)
    // Alertas e garras precisam responder rápido à mudança de bits no PLC
    // ✅ Aumentado para 750ms para reduzir carga na memória (evita vazamento)
    const ALERT_REFRESH_MS = 1000; // 1s entre leituras (evita overlap/abort e reduz consumo de memória)
    
    // ✅ Variáveis de estado para alertas (escopo global para evitar perda de referência)
    let lastAlertText = '';
    let lastVisible = false;       // visibilidade da garra vermelha / texto
    let lastGreenVisible = false;  // visibilidade da garra verde
    let lastRawAlert = 0;          // ✅ Valor bruto do alarme (para detectar mudanças rápidas)
    let plcConnected = true;
    let consecutiveFailures = 0;
    let lastQuantity = 0;
    
    // ✅ Flags para evitar execuções simultâneas dos timers (evita acúmulo)
    let labelTimerRunning = false;
    let selectionTimerRunning = false;
    let alertTimerRunning = false;
    
    // ✅ Throttling para renderizações (evita renderizações excessivas)
    let lastRenderTime = 0;
    const MIN_RENDER_INTERVAL = 100; // mínimo 100ms entre renderizações
    
    // ✅ Debounce para renderGrid quando chamado de handleClassSelection
    let renderGridDebounceTimer = null;
    const RENDER_GRID_DEBOUNCE_MS = 50; // 50ms de debounce
    
    // ✅ Monitor de memória
    let memoryMonitorTimer = null;
    const MEMORY_CHECK_INTERVAL = 30000; // Verifica memória a cada 30 segundos
    const MEMORY_WARNING_THRESHOLD_MB = 500; // Avisa se passar de 500MB
    const MEMORY_CLEANUP_THRESHOLD_MB = 800; // Limpa automaticamente se passar de 800MB
    
    // ✅ AbortControllers para cancelar fetch requests pendentes
    let activeAbortControllers = new Set();
    
    // ✅ Função para verificar se deve pausar sincronização
    // Agora também verifica se há itens na fila aguardando
    function shouldPauseSync() {
        return pendingWrites > 0 || writeQueue.length > 0 || (Date.now() - lastWriteTime) < SYNC_PAUSE_MS;
    }
    
    // ✅ Função para limpar completamente a fila de escritas (evita vazamento de memória)
    function clearWriteQueue() {
        console.log(`[CLASSIFICATION] 🧹 Limpando fila de escritas: ${writeQueue.length} itens`);
        
        // Cancela timer de processamento
        if (queueProcessorTimer) {
            clearTimeout(queueProcessorTimer);
            queueProcessorTimer = null;
        }
        
        // Resolve todas as callbacks pendentes com erro (libera memória)
        let cleared = 0;
        while (writeQueue.length > 0) {
            const item = writeQueue.shift();
            try {
                if (item && item.callback) {
                    item.callback(false, new Error('Queue cleared'));
                    cleared++;
                }
            } catch (_) {}
        }
        
        // ✅ CRÍTICO: Força limpeza total do array (libera memória)
        writeQueue.length = 0;
        writeQueue = [];
        isProcessingQueue = false;
        pendingWrites = 0;
        lastWriteTime = 0;
        
        console.log(`[CLASSIFICATION] ✅ ${cleared} callbacks resolvidos, fila limpa`);
    }
    
    // ✅ Função simplificada para limpar timers
    function clearAllTrackedTimers() {
        console.log('[CLASSIFICATION] 🧹 Limpando timers');
        activeTimeouts.forEach(id => clearTimeout(id));
        activeTimeouts.clear();
        activeIntervals.forEach(id => clearInterval(id));
        activeIntervals.clear();
    }
    
    // ✅ Função simplificada para verificar se deve pausar sincronização
    function isClassificationBusy() {
        return shouldPauseSync();
    }
    
    // ✅ SISTEMA DE FILA ULTRA-SIMPLES: Processa uma escrita por vez, sem acúmulo
    let queueProcessorTimer = null;
    
    async function processWriteQueue() {
        // Já está processando ou fila vazia - sai
        if (isProcessingQueue || writeQueue.length === 0) return;
        
        isProcessingQueue = true;
        
        // Processa apenas UM item por vez
        const item = writeQueue.shift();
        if (!item) {
            isProcessingQueue = false;
            return;
        }
        
        pendingWrites++;
        lastWriteTime = Date.now();
        
        try {
            const response = await fetch('/api/queue_classification_write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ writes: item.writes })
            });
            
            const data = await response.json();
            
            if (data.ok === true) {
                item.callback(true, null);
            } else {
                item.callback(false, new Error('Backend error'));
            }
        } catch (error) {
            item.callback(false, error);
        } finally {
            pendingWrites = Math.max(0, pendingWrites - 1);
            isProcessingQueue = false;
            
            // Agenda próximo item se houver (com delay fixo)
            if (writeQueue.length > 0) {
                if (queueProcessorTimer) clearTimeout(queueProcessorTimer);
                queueProcessorTimer = setTimeout(processWriteQueue, 100);
            }
        }
    }
    
    // ✅ FUNÇÃO SIMPLES: Envia escrita para fila (SEM PROMISES PENDENTES = SEM VAZAMENTO)
    function sendWriteToBackend(writes) {
        if (!writes || writes.length === 0) return Promise.resolve(true);
        
        // ✅ CRÍTICO: Limita tamanho máximo da fila para evitar acúmulo infinito
        const MAX_QUEUE_SIZE = 10; // Reduzido de 20 para 10
        if (writeQueue.length >= MAX_QUEUE_SIZE) {
            console.warn(`[CLASSIFICATION] ⚠️ Fila cheia (${writeQueue.length}/${MAX_QUEUE_SIZE}), descartando escritas antigas`);
            // Remove até ficar com metade do tamanho máximo
            while (writeQueue.length >= MAX_QUEUE_SIZE / 2) {
                const old = writeQueue.shift();
                if (old && old.callback) {
                    try {
                        old.callback(false, new Error('Queue overflow'));
                    } catch (_) {}
                }
            }
            console.log(`[CLASSIFICATION] 🧹 Fila reduzida para ${writeQueue.length} itens`);
        }
        
        return new Promise((resolve) => {
            // Callback simples que resolve a promise
            const callback = (success, error) => {
                resolve(success);
            };
            
            // Adiciona à fila
            writeQueue.push({
                writes,
                callback,
                timestamp: Date.now()
            });
            
            // Inicia processamento se não estiver rodando
            if (!isProcessingQueue) {
                processWriteQueue();
            }
        });
    }
    
    // ✅ Função para mostrar toast de feedback (simplificada)
    function showClassificationToast(message, duration = 1500) {
        const existingToast = document.getElementById('classification-toast');
        if (existingToast) existingToast.remove();
        
        const toast = document.createElement('div');
        toast.id = 'classification-toast';
        toast.style.cssText = `
            position: fixed;
            top: 20%;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 15px 25px;
            border-radius: 8px;
            font-size: 18px;
            font-weight: bold;
            z-index: 10000;
            text-align: center;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            const t = document.getElementById('classification-toast');
            if (t) t.remove();
        }, duration);
    }
    
    // ✅ Função para remover toast
    function hideClassificationToast() {
        const t = document.getElementById('classification-toast');
        if (t) t.remove();
    }

    // API helpers (reutiliza a lógica da tela de faixa de peso para nomes dinâmicos)
    const api = {
        async checkPLCConnection() {
            // ✅ AbortController para timeout
            const controller = new AbortController();
            activeAbortControllers.add(controller);
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            try {
                const res = await fetch('http://localhost:8000/api/status', { 
                    cache: 'no-store',
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                if (!res.ok) return false;
                const data = await res.json();
                return data.connected === true;
            } catch (e) {
                if (e.name !== 'AbortError') {
                    console.error('[CLASSIFICATION] Erro ao verificar conexão PLC:', e);
                }
                return false;
            } finally {
                clearTimeout(timeoutId);
                activeAbortControllers.delete(controller);
            }
        },
        async getLabels() {
            // ✅ AbortController para timeout
            const controller = new AbortController();
            activeAbortControllers.add(controller);
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const names = Array.from({ length: 7 }, (_, i) => `XLCLASS_DB202_NOME_DINAMICO[${i}]`).join(',');
            const url = `/api/read_tags?names=${encodeURIComponent(names)}`;
            try {
                const res = await fetch(url, { 
                    cache: 'no-store',
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
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
                if (e.name !== 'AbortError') {
                    console.error('Falha ao ler labels do PLC (classification):', e);
                }
                return Array.from({ length: 7 }, () => null);
            } finally {
                clearTimeout(timeoutId);
                activeAbortControllers.delete(controller);
            }
        },
        async setLabel(index, text) {
            // ✅ AbortController para timeout
            const controller = new AbortController();
            activeAbortControllers.add(controller);
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const i = Number(index) >>> 0;
            if (i > 6) return false;
            const tag = `XLCLASS_DB202_NOME_DINAMICO[${i}]`;
            try {
                const res = await fetch('/api/write_tags', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ [tag]: String(text || '') }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                const data = await res.json();
                return !!(data && data.ok);
            } catch (e) {
                if (e.name !== 'AbortError') {
                    console.error('[CLASSIFICATION] Erro ao escrever label:', e);
                }
                return false;
            } finally {
                clearTimeout(timeoutId);
                activeAbortControllers.delete(controller);
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
    let heartbeatInFlight = false;
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
        // ✅ Tag de alarme da classificadora (para garra vermelha e box de alerta)
        tags.push('XLCLASS_DB1_PRINCIPAL_ALARME_CLASSIFICADORA');
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
        if (heartbeatInFlight) return;
        heartbeatInFlight = true;
        try {
            await fetch('/api/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_id: clientId })
            }).catch(() => {});
        } catch (_) {}
        finally {
            heartbeatInFlight = false;
        }
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

    // ✅ Alert/claw tags reader (lê ambas as tags necessárias de uma vez)
    // ✅ CRÍTICO: Variável global para cancelar requisição anterior (evita acúmulo)
    let currentAlertRequestController = null;
    let currentAlertRequestPromise = null;
    let lastAlertResult = { rawAlert: 0, rawStatus: 0 }; // cache do último valor válido
    
    async function getAlertAndStatus() {
        const TAG_ALERT = 'XLCLASS_DB1_PRINCIPAL_ALARME_CLASSIFICADORA';
        const TAG_STATUS = 'XLCLASS_DB1_PRINCIPAL_COMANDO_STATUS_01';
        const names = `${TAG_ALERT},${TAG_STATUS}`;
        
        // ✅ CRÍTICO: Se já existe uma requisição em andamento, NÃO cria outra e NÃO aborta.
        // Abortar em loop (intervalo < timeout/rede) pode causar crescimento de memória e travamento.
        if (currentAlertRequestPromise) {
            return lastAlertResult;
        }
        
        // ✅ AbortController para timeout
        const controller = new AbortController();
        currentAlertRequestController = controller;
        const timeoutId = setTimeout(() => {
            try {
                controller.abort();
            } catch (_) {}
        }, 700); // timeout menor que o intervalo do timer (evita overlap)
        
        try {
            // ✅ Cria promise e armazena referência (para poder cancelar depois)
            const fetchPromise = fetch(`/api/read_tags?names=${encodeURIComponent(names)}`, { 
                cache: 'no-store',
                signal: controller.signal,
                // ✅ Adiciona headers para evitar cache do navegador
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
            
            currentAlertRequestPromise = fetchPromise;
            const res = await fetchPromise;
            
            clearTimeout(timeoutId);
            
            if (!res.ok) {
                throw new Error('bad');
            }
            
            const data = await res.json();
            
            // ✅ Limpa dados grandes imediatamente após processar (libera memória)
            const alertValue = data?.values?.[TAG_ALERT];
            const statusValue = data?.values?.[TAG_STATUS];
            
            // Converte null/undefined para 0, mas mantém outros valores (incluindo 0 válido)
            const rawAlert = (alertValue === null || alertValue === undefined) ? 0 : Number(alertValue) || 0;
            const rawStatus = (statusValue === null || statusValue === undefined) ? 0 : Number(statusValue) || 0;
            
            // ✅ Força limpeza de referências grandes
            data.values = null;
            
            lastAlertResult = { rawAlert, rawStatus };
            return lastAlertResult;
        } catch (e) {
            // ✅ Apenas loga erros não-abort (AbortError é esperado quando cancela requisição anterior)
            if (e.name !== 'AbortError' && e.name !== 'TypeError') {
                // Log apenas erros críticos, não todos os erros (com throttling)
                if (Date.now() - (window._lastAlertErrorLog || 0) > 10000) {
                    console.error('[CLASSIFICATION] Erro em getAlertAndStatus:', e);
                    window._lastAlertErrorLog = Date.now();
                }
            }
            // mantém o último valor válido para não “piscar” em 0 quando houver instabilidade de rede
            return lastAlertResult;
        } finally {
            clearTimeout(timeoutId);
            // ✅ Limpa referências se esta requisição foi concluída
            if (currentAlertRequestController === controller) {
                currentAlertRequestController = null;
            }
            currentAlertRequestPromise = null;
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
        const controller = new AbortController();
        activeAbortControllers.add(controller);
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 3s timeout
        
        try {
            const res = await fetch(`/api/read_tags?names=${encodeURIComponent(names)}`, { 
                cache: 'no-store',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            if (!res.ok) return {};
            const data = await res.json();
            return data?.values || {};
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('[CLASSIFICATION] Erro em readWords:', error);
            }
            return {};
        } finally {
            clearTimeout(timeoutId);
            activeAbortControllers.delete(controller);
        }
    }
    async function writeWords(payload) {
        const keys = Object.keys(payload);
        console.log(`[WRITE] ${keys.length} tags:`, keys.join(', '));
        
        const controller = new AbortController();
        activeAbortControllers.add(controller);
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
        
        try {
            const res = await fetch('/api/write_tags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!res.ok) {
                console.error('[WRITE] ❌ HTTP error:', res.status);
                return false;
            }
            
            const data = await res.json();
            const success = data && data.ok;
            console.log(`[WRITE] ${success ? '✅' : '❌'} Resultado:`, data);
            return success;
        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('[WRITE] ⏱️ Timeout 5s');
            } else {
                console.error('[WRITE] ❌ Erro:', error.message);
            }
            return false;
        } finally {
            clearTimeout(timeoutId);
            activeAbortControllers.delete(controller);
        }
    }
    async function refreshSelectionsFromPLC(force = false) {
        // ✅ Não atualiza se houver itens na fila de escrita (evita conflito visual)
        if (!force && writeQueue.length > 0) {
            logDebug(`[CLASSIFICATION] ⏸️ Pulando refresh - ${writeQueue.length} itens na fila de escrita`);
            return;
        }
        
        // ✅ Não atualiza se estiver escrevendo no PLC (evita conflito leitura/gravação)
        // Permite apenas se for durante carregamento de receita (que tem controle próprio)
        if (!state.isLoadingRecipe && isClassificationBusy()) {
            const sinceLast = Math.round((Date.now() - lastWriteTime) / 1000);
            logDebug(`[CLASSIFICATION] ⏸️ Pulando refresh - Pendentes: ${pendingWrites} | Fila: ${writeQueue.length} | Última escrita há ${sinceLast}s`);
            return;
        }
        
        // Não atualiza se estiver carregando uma receita (a menos que force=true)
        if (!force && state.isLoadingRecipe) {
            console.log('Pulando refreshSelectionsFromPLC - carregando receita');
            return;
        }
        
        // Verifica se há configurações recentes (últimos 20 segundos) (a menos que force=true)
        const now = Date.now();
        if (!force && state.lastRecipeLoad && (now - state.lastRecipeLoad) < 20000) {
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
        // ✅ Não atualiza se estiver escrevendo no PLC (evita conflito leitura/gravação)
        if (isClassificationBusy()) {
            console.log('[CLASSIFICATION] ⏸️ Pulando loadSelectionsFromPLC - escrita em andamento');
            return;
        }
        
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
        // ✅ ENVIA PARA FILA DO BACKEND (processamento robusto e sequencial)
        logDebug(`[SYNC] ${embId}/${classId}/${tipo} -> Backend`);
        
        const mapping = getEmbBitAndIndex(embId);
        const p = classIdToP(classId);
        const isCrackVisio = (classId === 'CRACK' || classId === 'VISIO');
        
        const writes = [];
        
        // SPJ usa palavras de classes a ignorar
        if (embId === 'SPJ') {
            const tagW = 'XLCLASS_DB200_CLASSIFICACAO_CLASSES_A_IGNORAR';
            const tagR = 'XLCLASS_DB201_CLASSIFICACAO_CLASSES_A_IGNORAR';
            const b = spjClassToIgnoreBit(classId);
            if (b === null) return false;
            
            if (isCrackVisio) {
                // CRACK/VISIO: só escreve DB200
                writes.push({ tag: tagW, bit: b, value: tipo === 'misto' });
            } else {
                if (tipo === 'branco') {
                    writes.push({ tag: tagW, bit: b, value: true });
                    writes.push({ tag: tagR, bit: b, value: false });
                } else if (tipo === 'vermelho') {
                    writes.push({ tag: tagW, bit: b, value: false });
                    writes.push({ tag: tagR, bit: b, value: true });
                } else if (tipo === 'misto') {
                    writes.push({ tag: tagW, bit: b, value: true });
                    writes.push({ tag: tagR, bit: b, value: true });
                } else {
                    writes.push({ tag: tagW, bit: b, value: false });
                    writes.push({ tag: tagR, bit: b, value: false });
                }
            }
        } else {
            // Para embaladoras normais (IND, E01-E24)
            if (!mapping || !p) return false;
            
            const { index, bit } = mapping;
            const tagWhite = `XLCLASS_DB200_CLASSIFICACAO_${p}[${index}]`;
            const tagRed = `XLCLASS_DB201_CLASSIFICACAO_${p}[${index}]`;
            
            if (tipo === 'branco') {
                writes.push({ tag: tagWhite, bit, value: true });
                writes.push({ tag: tagRed, bit, value: false });
            } else if (tipo === 'vermelho') {
                writes.push({ tag: tagWhite, bit, value: false });
                writes.push({ tag: tagRed, bit, value: true });
            } else if (tipo === 'misto') {
                writes.push({ tag: tagWhite, bit, value: true });
                // CRACK/VISIO: misto não escreve na DB201
                if (!isCrackVisio) {
                    writes.push({ tag: tagRed, bit, value: true });
                }
            } else {
                writes.push({ tag: tagWhite, bit, value: false });
                writes.push({ tag: tagRed, bit, value: false });
            }
        }
        
        // Envia para fila do backend
        lastWriteTime = Date.now();
        return await sendWriteToBackend(writes);
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
				const isCrackVisio = (cls.id === 'CRACK' || cls.id === 'VISIO');
				
				if (cls.tipo === 'branco') {
					target.white = setBit(target.white >>> 0, bit, true) >>> 0;
					target.red = setBit(target.red >>> 0, bit, false) >>> 0;
				} else if (cls.tipo === 'vermelho') {
					target.white = setBit(target.white >>> 0, bit, false) >>> 0;
					target.red = setBit(target.red >>> 0, bit, true) >>> 0;
				} else if (cls.tipo === 'misto') {
					// ✅ Para CRACK/VISIO, misto escreve apenas na DB200 (não na DB201)
					if (isCrackVisio) {
						target.white = setBit(target.white >>> 0, bit, true) >>> 0;
						target.red = setBit(target.red >>> 0, bit, false) >>> 0; // Não escreve na DB201 para CRACK/VISIO
					} else {
						// Para outras classes, misto = ambos
						target.white = setBit(target.white >>> 0, bit, true) >>> 0;
						target.red = setBit(target.red >>> 0, bit, true) >>> 0;
					}
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
				const desiredClassId = desired ? desired.id : null;
				const isCrackVisio = (desiredClassId === 'CRACK' || desiredClassId === 'VISIO');
				
				if (desiredTipo === 'branco') { 
					wWhite = setBit(wWhite, bit, true); 
					wRed = setBit(wRed, bit, false); 
				}
				else if (desiredTipo === 'vermelho') { 
					wWhite = setBit(wWhite, bit, false); 
					wRed = setBit(wRed, bit, true); 
				}
				else if (desiredTipo === 'misto') {
					// ✅ Para CRACK/VISIO, misto escreve apenas na DB200 (não na DB201)
					if (isCrackVisio) {
						wWhite = setBit(wWhite, bit, true);
						wRed = setBit(wRed, bit, false); // Não escreve na DB201 para CRACK/VISIO
					} else {
						// Para outras classes, misto = ambos
						wWhite = setBit(wWhite, bit, true);
						wRed = setBit(wRed, bit, true);
					}
				}
				else { 
					wWhite = setBit(wWhite, bit, false); 
					wRed = setBit(wRed, bit, false); 
				}
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
    // Função para atualizar quantidade de colunas no CSS
    function updateGridColumns(quantity) {
        // Total de colunas: 1 (IND - sempre) + quantity (E01..E[quantity] - filtradas) + 1 (SPJ - sempre) = quantity + 2
        const totalColumns = quantity + 2;
        const GAP = 'clamp(6px, 0.8vw, 12px)'; // Gap deve ser o mesmo para todos os grids
        
        const grid = document.getElementById('embaladora-grid');
        const statusRow = document.getElementById('status-row');
        const headerRow = document.getElementById('header-row');
        
        // Atualiza o grid de embaladoras - colunas flexíveis
        if (grid) {
            grid.style.gridTemplateColumns = `repeat(${totalColumns}, var(--emb-col-width))`;
            grid.style.gap = GAP;
            grid.style.width = 'fit-content';
            grid.style.maxWidth = '100%';
            grid.style.margin = '0 auto';
            grid.style.padding = '0';
            grid.style.boxSizing = 'border-box';
            grid.style.justifyContent = 'center';
        }
        
        // Atualiza a linha de status (deve ter o mesmo número de colunas e gap)
        if (statusRow) {
            statusRow.style.gridTemplateColumns = `repeat(${totalColumns}, var(--emb-col-width))`;
            statusRow.style.gap = GAP;
            statusRow.style.width = 'fit-content';
            statusRow.style.maxWidth = '100%';
            statusRow.style.margin = '0 auto';
            statusRow.style.padding = '0';
            statusRow.style.boxSizing = 'border-box';
            statusRow.style.justifyContent = 'center';
        }
        
        // Atualiza a linha de headers (deve ter o mesmo número de colunas e gap)
        if (headerRow) {
            headerRow.style.gridTemplateColumns = `repeat(${totalColumns}, var(--emb-col-width))`;
            headerRow.style.gap = GAP;
            headerRow.style.width = 'fit-content';
            headerRow.style.maxWidth = '100%';
            headerRow.style.margin = '0 auto';
            headerRow.style.padding = '0';
            headerRow.style.boxSizing = 'border-box';
            headerRow.style.justifyContent = 'center';
        }
        
        // Container principal - estica para ocupar toda a largura
        const embaladoraGrid = document.querySelector('.embaladora-grid');
        if (embaladoraGrid) {
            embaladoraGrid.style.justifyContent = 'center';
            embaladoraGrid.style.alignItems = 'stretch';
        }
    }
    
    // Função para atualizar embaladoras baseado na quantidade
    function updateEmbaladorasQuantity() {
        const quantity = getEmbaladoraQuantity();
        console.log('Atualizando quantidade de embaladoras para:', quantity);
        
        // Preserva classes existentes ao filtrar
        const filtered = filterEmbaladorasByQuantity(state.allEmbaladoras, quantity);
        
        // Mantém classes das embaladoras que ainda estão visíveis
        filtered.forEach(emb => {
            const existing = state.embaladoras.find(e => e.id === emb.id);
            if (existing) {
                emb.classes = existing.classes;
                emb.ativo = existing.ativo;
            }
        });
        
        state.embaladoras = filtered;
        updateGridColumns(quantity);
        renderStatus();
        renderHeaders();
        renderGrid();
    }
    
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
    // ✅ Armazena handlers para poder removê-los (evita vazamento de memória)
    const columnClickHandlers = new Map();
    
    // ✅ Função interna de renderização (sem throttling para chamadas diretas)
    function _renderGridInternal() {
        const grid = document.getElementById('embaladora-grid');
        if (!grid) return;
        
        // ✅ Throttling: evita renderizações excessivas (proteção contra vazamento)
        const now = Date.now();
        if (now - lastRenderTime < MIN_RENDER_INTERVAL) {
            return; // Ignora renderização se foi chamada muito recentemente
        }
        lastRenderTime = now;
        
        // ✅ Remove listeners antigos antes de recriar o HTML (evita vazamento de memória)
        const oldColumns = document.querySelectorAll('.embaladora-column');
        oldColumns.forEach(column => {
            const embId = column.getAttribute('data-id');
            const handler = columnClickHandlers.get(embId);
            if (handler) {
                column.removeEventListener('click', handler);
                columnClickHandlers.delete(embId);
            }
            // ✅ CRÍTICO: Remove do DOM para liberar memória
            column.remove();
        });
        
        // ✅ Limpa innerHTML antes de popular (força garbage collection)
        grid.innerHTML = '';
        
        // ✅ Cria os cards primeiro (sem conteúdo) para poder medir a altura real
        grid.innerHTML = state.embaladoras.map(emb => `
            <div class="embaladora-column" data-id="${emb.id}"></div>
        `).join('');
        
        // ✅ FORÇA REFLOW para garantir que o CSS seja aplicado antes de medir
        const firstCol = grid.querySelector('.embaladora-column');
        if (firstCol) {
            // Leitura de offsetHeight força o navegador a calcular o layout
            void firstCol.offsetHeight;
        }
        
        // ✅ Recalcula tamanhos dos ovos baseado na altura real dos cards
        recalculateEggSizes();
        
        // ✅ Agora renderiza as classes com os tamanhos corretos
        const columns = grid.querySelectorAll('.embaladora-column');
        columns.forEach((column, index) => {
            const emb = state.embaladoras[index];
            if (emb) {
                column.innerHTML = renderClasses(emb.classes);
            }
        });
        
        // ✅ Adiciona novos listeners e armazena referências
        const newColumns = document.querySelectorAll('.embaladora-column');
        newColumns.forEach(column => {
            const embId = column.getAttribute('data-id');
            // Cria handler nomeado para poder removê-lo depois
            const handler = () => {
                handleEmbaladoraClick(embId);
            };
            column.addEventListener('click', handler);
            columnClickHandlers.set(embId, handler);
        });
    }
    
    // ✅ Função pública com debounce para chamadas de seleção
    function renderGrid(immediate = false) {
        // Se for chamada imediata (ex: cleanup), renderiza direto
        if (immediate) {
            _renderGridInternal();
            return;
        }
        
        // ✅ Debounce: cancela renderização anterior e agenda nova
        if (renderGridDebounceTimer) {
            clearTimeout(renderGridDebounceTimer);
        }
        
        renderGridDebounceTimer = setTimeout(() => {
            _renderGridInternal();
            renderGridDebounceTimer = null;
        }, RENDER_GRID_DEBOUNCE_MS);
    }

	// Verifica no PLC se o estado corresponde aos cards e tenta corrigir discrepâncias
	async function verifySelectionsWithPLC() {
		console.log('=== verifySelectionsWithPLC INICIADA ===');
		
		// ✅ Não verifica se estiver escrevendo no PLC (evita conflito leitura/gravação)
		// Mas permite durante carregamento de receita (que tem controle próprio)
		if (!state.isLoadingRecipe && isClassificationBusy()) {
			console.log('[CLASSIFICATION] ⏸️ Pulando verifySelectionsWithPLC - escrita em andamento');
			return true; // Retorna true para não bloquear o fluxo
		}
		
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
        logDebug('Clicked embaladora:', embId);
        const embaladora = state.embaladoras.find(e => e.id === embId);
        if (embaladora) {
            state.selectedEmbaladora = embaladora;
            showClassModal(embaladora);
        }
    }
    // ✅ CRÍTICO: Cache de cálculos para evitar recalcular a cada renderização
    // ✅ Valores responsivos baseados na altura real do card
    let renderClassesCache = {
        marginSafe: 16, // folga no topo/baixo para não cortar C1/visio
        totalPossibleClasses: 0,
        circleSize: 0,
        verticalGap: 0,
        totalHeight: 0,
        availableHeight: 0,
        startTop: 0
    };
    
    // ✅ Função para recalcular tamanhos baseado na altura real do card
    function recalculateEggSizes() {
        // Pega a altura real do primeiro card disponível
        const firstColumn = document.querySelector('.embaladora-column');
        let cardHeight = 400; // fallback
        
        if (firstColumn) {
            cardHeight = firstColumn.offsetHeight || firstColumn.clientHeight || 400;
        } else {
            // Fallback: estima baseado na tela
            const screenHeight = window.innerHeight;
            cardHeight = Math.round(screenHeight * 0.52);
        }
        
        // Área disponível para os ovos (descontando margem de segurança)
        renderClassesCache.availableHeight = cardHeight - (renderClassesCache.marginSafe * 2);
        renderClassesCache.totalPossibleClasses = state.classesOvos.length;
        
        if (renderClassesCache.totalPossibleClasses === 0) {
            renderClassesCache.circleSize = 30;
            renderClassesCache.verticalGap = 8;
            return;
        }
        
        // Calcula tamanho que cabe considerando TODAS as classes
        // Formula: availableHeight = (numClasses * eggHeight) + ((numClasses - 1) * gap)
        // eggHeight = circleSize * 1.27, gap = circleSize * 0.25
        // availableHeight = numClasses * circleSize * 1.27 + (numClasses - 1) * circleSize * 0.25
        // availableHeight = circleSize * (numClasses * 1.27 + (numClasses - 1) * 0.25)
        const numClasses = renderClassesCache.totalPossibleClasses;
        const totalMultiplier = (numClasses * 1.27) + ((numClasses - 1) * 0.25);
        const calculatedSize = Math.floor(renderClassesCache.availableHeight / totalMultiplier);
        
        // Limites mínimo e máximo absolutos (sem depender da tela)
        const minSize = 18; // mínimo legível
        const maxSize = 45; // máximo estético
        
        // USA O TAMANHO CALCULADO, respeitando apenas os limites absolutos
        renderClassesCache.circleSize = Math.max(minSize, Math.min(maxSize, calculatedSize));
        renderClassesCache.verticalGap = Math.max(4, Math.round(renderClassesCache.circleSize * 0.25));
        
        // Recalcula altura total final com os valores ajustados
        const eggHeight = Math.round(renderClassesCache.circleSize * 1.27);
        renderClassesCache.totalHeight = (numClasses * eggHeight) + ((numClasses - 1) * renderClassesCache.verticalGap);
        
        // Centraliza verticalmente dentro do espaço disponível
        const extraSpace = Math.max(0, Math.floor((renderClassesCache.availableHeight - renderClassesCache.totalHeight) / 2));
        renderClassesCache.startTop = renderClassesCache.marginSafe + extraSpace;
    }
    
    // ✅ Inicializa cache
    recalculateEggSizes();
    
    function renderClasses(classes) {
        logDebug('Renderizando classes:', classes);
        
        // ✅ CORRIGIDO: Usa cache em vez de recalcular
        const { circleSize, verticalGap, startTop } = renderClassesCache;
        
        // ✅ CORRIGIDO: Usa find() direto em vez de criar Map (evita alocação de memória)
        // Renderiza todas as posições possíveis, mas mostra apenas as classes selecionadas
        let html = '';
        for (let index = 0; index < state.classesOvos.length; index++) {
            const classObj = state.classesOvos[index];
            
            // ✅ Busca direta sem criar Map
            const selectedClass = classes && classes.length > 0 ? 
                classes.find(cls => cls.id === classObj.id) : null;
            
            // Se a classe não está selecionada, não renderiza nada nesta posição
            if (!selectedClass) {
                continue;
            }
            
            // Calcula posição fixa baseada no índice na lista completa de classes
            // Formato de ovo: altura maior que largura (proporção ~1.27:1)
            const eggWidth = circleSize;
            const eggHeight = Math.round(circleSize * 1.27);
            const top = startTop + index * (eggHeight + verticalGap);
            
            let extraStyle = '';
            // ✅ Para CRACK e VISIO, quando tipo é "misto", mostrar visualmente como "branco"
            const isCrackVisio = (selectedClass.id === 'CRACK' || selectedClass.id === 'VISIO');
            const visualTipo = (isCrackVisio && selectedClass.tipo === 'misto') ? 'branco' : selectedClass.tipo;
            
            if (visualTipo === 'branco') {
                extraStyle = 'border: 4px solid white; box-shadow: 0 0 0 1px #ccc;';
            } else if (visualTipo === 'vermelho') {
                extraStyle = 'border: 4px solid #ef4444;';
            } // 'misto' usa CSS com pseudo-elemento (apenas para outras classes)
            
            html += `
                <div class="egg-class-item tipo-${visualTipo}" style="
                    background-color: ${selectedClass.cor};
                    top: ${top}px;
                    height: ${eggHeight}px; width: ${eggWidth}px; ${extraStyle}
                "></div>
            `;
        }
        return html;
    }
    // ✅ Handler armazenado para evitar duplicação de event listeners
    let editLabelsBtnHandler = null;
    let lastClassesListRender = 0;
    
    function renderClassesList() {
        const classList = document.getElementById('classes-list');
        if (!classList) return;
        
        // ✅ Throttling para evitar renderizações excessivas
        const now = Date.now();
        if (now - lastClassesListRender < MIN_RENDER_INTERVAL) {
            return;
        }
        lastClassesListRender = now;
        
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
        
        // Expor nomes/cores atuais das classes para outros módulos (gráficos)
        try {
            const ids = ['C1','C2','C3','C4','C5','C6','C7'];
            const labels = state.classesOvos.map((classe) => {
                const isRange = ids.includes(classe.id);
                const idx = isRange ? ids.indexOf(classe.id) : -1;
                const plcName = isRange ? (state.dynamicLabels[idx] || classe.nome) : classe.nome;
                return { id: classe.id, name: plcName, color: classe.cor };
            });
            window.classificationLabels = labels;
            // Também emite um evento para que o grid mini chart atualize imediatamente
            try { window.dispatchEvent(new CustomEvent('classification-labels-updated', { detail: labels })); } catch(_) {}
        } catch(_) { /* noop */ }
        
        // ✅ CORRIGIDO: Remove listener antigo ANTES de adicionar novo (evita acúmulo de memória)
        const editLabelsBtn = document.getElementById('edit-labels-btn');
        if (editLabelsBtn) {
            // Remove listener antigo se existir
            if (editLabelsBtnHandler) {
                editLabelsBtn.removeEventListener('click', editLabelsBtnHandler);
            }
            
            // Cria e armazena novo handler
            editLabelsBtnHandler = () => {
                // Pré-carrega inputs com os rótulos atuais
                const ids = ['C1','C2','C3','C4','C5','C6','C7'];
                ids.forEach((_, idx) => {
                    const inp = document.getElementById(`lbl-C${idx+1}`);
                    if (inp) inp.value = state.dynamicLabels[idx] || '';
                });
                showModal('labels-editor-modal');
            };
            
            editLabelsBtn.addEventListener('click', editLabelsBtnHandler);
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
        
        modal.classList.add('show');
    }
    
    // ✅ Event delegation para botões de tipo (evita acúmulo de listeners)
    // Este listener é adicionado UMA VEZ no container, não em cada botão
    (function setupTypeButtonDelegation() {
        const options = document.getElementById('class-options');
        if (!options || options.dataset.delegated === 'true') return;
        options.dataset.delegated = 'true';
        
        options.addEventListener('click', (e) => {
            const btn = e.target.closest('.type-btn');
            if (!btn) return;
            
            const embId = btn.getAttribute('data-emb');
            const classId = btn.getAttribute('data-class');
            const type = btn.getAttribute('data-type');
            
            if (embId && classId && type) {
                handleClassSelection(embId, classId, type);
            }
        });
    })();
    function handleClassSelection(embId, classId, tipo) {
        logDebug('Selection:', embId, classId, tipo);
        
        // ✅ MARCA IMEDIATAMENTE a interação (bloqueia sincronização)
        lastWriteTime = Date.now();
        logDebug('[CLASSIFICATION] 🔒 Bloqueio de sincronização ativado');
        
        // ✅ FECHA O MODAL IMEDIATAMENTE ao selecionar uma classe
        hideModal('class-modal');
        
        const embaladora = state.embaladoras.find(e => e.id === embId);
        const classe = state.classesOvos.find(c => c.id === classId);
        
        if (!embaladora || !classe) return;
        const embIndex = state.embaladoras.findIndex(e => e.id === embId);
        if (embIndex === -1) return;
        
        // ✅ CORRIGIDO: Cria arrays de forma mais eficiente e limpa referências
        const estadoAnterior = state.embaladoras[embIndex].classes;
        const existingClassIndex = estadoAnterior.findIndex(c => c.id === classId);
        
        let novasClasses;
        if (existingClassIndex !== -1 && estadoAnterior[existingClassIndex].tipo === tipo) {
            // Remove a classe se clicar no mesmo tipo
            novasClasses = estadoAnterior.filter(c => c.id !== classId);
            
            // ✅ APLICA VISUALMENTE (com debounce)
            state.embaladoras[embIndex].classes = novasClasses;
            renderGrid(); // Usa debounce automático
            
            // ✅ ENVIA DIRETAMENTE PARA BACKEND (remove seleção)
            syncSelectionToPLC(embId, classId, null);
        } else {
            // Remove a classe existente se houver e adiciona nova
            novasClasses = estadoAnterior.filter(c => c.id !== classId);
            novasClasses.push({ 
                id: classe.id,
                nome: classe.nome,
                cor: classe.cor,
                tipo: tipo
            });
            
            // ✅ APLICA VISUALMENTE (com debounce)
            state.embaladoras[embIndex].classes = novasClasses;
            renderGrid(); // Usa debounce automático
            
            // ✅ ENVIA DIRETAMENTE PARA BACKEND
            syncSelectionToPLC(embId, classId, tipo);
        }
        
        // ✅ CRÍTICO: Limpa referências temporárias para liberar memória
        novasClasses = null;
        estadoAnterior = null;
        
        logDebug('[CLASSIFICATION] Estado atualizado visualmente:', state.embaladoras[embIndex]);
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
    // ✅ Handler do presetList armazenado para limpeza
    let presetListClickHandler = null;
    
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
                    // ✅ Limita tamanho para evitar crescimento infinito
                    if (parsed.length > 100) {
                        console.warn('[CLASSIFICATION] ⚠️ Muitos presets, mantendo apenas os 100 mais recentes');
                        state.presets = parsed.slice(-100);
                        try {
                            localStorage.setItem('classification_presets', JSON.stringify(state.presets));
                        } catch (_) {}
                    } else {
                        state.presets = parsed;
                    }
                    console.log('Presets carregados do localStorage:', state.presets.length, 'itens');
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
        
        // ✅ CORRIGIDO: Event delegation com remoção adequada
        if (!presetListClickHandler) {
            presetListClickHandler = (e) => {
                const btn = e.target.closest('.btn-action');
                if (!btn) return;
                
                const id = btn.getAttribute('data-id');
                if (!id) return;
                
                if (btn.classList.contains('btn-edit')) {
                    handleEditPreset(id);
                } else if (btn.classList.contains('btn-load')) {
                    handleLoadPreset(id);
                } else if (btn.classList.contains('btn-delete')) {
                    handleDeletePreset(id);
                }
            };
            presetList.addEventListener('click', presetListClickHandler);
            presetList.dataset.delegated = 'true';
        }
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
        // ✅ CRÍTICO: Remove TODOS os listeners anteriores antes de adicionar novos
        cleanupSetupEventListeners();
        
        // ✅ Handler para botões de fechar modal
        const closeBtnHandler = (e) => {
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
        };
        
        document.querySelectorAll('.close-btn').forEach((btn, index) => {
            btn.addEventListener('click', closeBtnHandler);
            setupEventListenersHandlers.set(`close-btn-${index}`, { element: btn, event: 'click', handler: closeBtnHandler });
        });
        // ✅ Handler para botão de receitas
        const recipeBtn = document.getElementById('recipe-btn');
        if (recipeBtn) {
            const recipeBtnHandler = () => {
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
            };
            recipeBtn.addEventListener('click', recipeBtnHandler);
            setupEventListenersHandlers.set('recipe-btn', { element: recipeBtn, event: 'click', handler: recipeBtnHandler });
        }
        // ✅ Handler para botão de salvar receita
        const saveRecipeBtn = document.getElementById('save-recipe-btn');
        if (saveRecipeBtn) {
            console.log('Botão save-recipe-btn encontrado, adicionando listener');
            const saveRecipeBtnHandler = (e) => {
                console.log('Botão salvar clicado');
                e.preventDefault();
                e.stopPropagation();
                
                // Remove o foco do input para evitar abrir teclado
                const nomeInput = document.getElementById('recipe-name');
                if (nomeInput) {
                    nomeInput.blur();
                }
                
                // ✅ CORRIGIDO: Evita setTimeout acumulando - chama direto
                handleSalvarPreset();
            };
            saveRecipeBtn.addEventListener('click', saveRecipeBtnHandler);
            setupEventListenersHandlers.set('save-recipe-btn', { element: saveRecipeBtn, event: 'click', handler: saveRecipeBtnHandler });
        } else {
            console.log('Botão save-recipe-btn NÃO encontrado');
        }
        
        // ✅ Handlers para input de nome da receita
        const recipeNameInput = document.getElementById('recipe-name');
        if (recipeNameInput) {
            console.log('Input recipe-name encontrado, adicionando listeners');
            
            // Handler para Enter
            const keydownHandler = (e) => {
                if (e.key === 'Enter') {
                    console.log('Enter pressionado no input');
                    e.preventDefault();
                    e.stopPropagation();
                    handleSalvarPreset();
                }
            };
            recipeNameInput.addEventListener('keydown', keydownHandler);
            setupEventListenersHandlers.set('recipe-name-keydown', { element: recipeNameInput, event: 'keydown', handler: keydownHandler });
            
            // Handler para click
            const clickHandler = () => {
                console.log('Abrindo teclado virtual para nome da receita');
                abrirTecladoSimples(recipeNameInput);
            };
            recipeNameInput.addEventListener('click', clickHandler);
            setupEventListenersHandlers.set('recipe-name-click', { element: recipeNameInput, event: 'click', handler: clickHandler });
            
            // Handler para touchstart
            const touchHandler = () => {
                console.log('Touch no input, abrindo teclado virtual');
                abrirTecladoSimples(recipeNameInput);
            };
            recipeNameInput.addEventListener('touchstart', touchHandler, { passive: true });
            setupEventListenersHandlers.set('recipe-name-touch', { element: recipeNameInput, event: 'touchstart', handler: touchHandler });
        } else {
            console.log('Input recipe-name NÃO encontrado');
        }
        // ✅ Handler para botão de limpar
        const clearBtn = document.getElementById('clear-btn');
        if (clearBtn) {
            const clearBtnHandler = async () => {
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
                    
                    // ✅ CORRIGIDO: Usa Promise.all para evitar múltiplos setTimeout
                    // Reset após 150ms
                    await new Promise(resolve => setTimeout(resolve, 150));
                    try {
                        const resetR = setBit(nextR, BIT, false) >>> 0;
                        const resetW = setBit(nextW, BIT, false) >>> 0;
                        await writeWords({ [CMD_R]: resetR, [CMD_W]: resetW });
                    } catch (_) {}
                    
                    // Aguarda e atualiza (sequencial)
                    await new Promise(resolve => setTimeout(resolve, 200));
                    await refreshSelectionsFromPLC(true);
                } catch (e) {
                    console.error('Erro no comando de limpar (bit 8):', e);
                }
            };
            clearBtn.addEventListener('click', clearBtnHandler);
            setupEventListenersHandlers.set('clear-btn', { element: clearBtn, event: 'click', handler: clearBtnHandler });
        }

        // ✅ Handlers para botões de power
        const powerOnBtn = document.getElementById('power-btn-on');
        const powerOffBtn = document.getElementById('power-btn-off');
        if (powerOnBtn) {
            powerOnBtn.addEventListener('click', togglePowerBit);
            setupEventListenersHandlers.set('power-on-btn', { element: powerOnBtn, event: 'click', handler: togglePowerBit });
        }
        if (powerOffBtn) {
            powerOffBtn.addEventListener('click', togglePowerBit);
            setupEventListenersHandlers.set('power-off-btn', { element: powerOffBtn, event: 'click', handler: togglePowerBit });
        }
        // ✅ Handlers para modal de edição de labels
        const labelsModal = document.getElementById('labels-editor-modal');
        if (labelsModal) {
            const cancelBtn = document.getElementById('labels-cancel');
            if (cancelBtn) {
                const cancelHandler = () => hideModal('labels-editor-modal');
                cancelBtn.addEventListener('click', cancelHandler);
                setupEventListenersHandlers.set('labels-cancel', { element: cancelBtn, event: 'click', handler: cancelHandler });
            }
            
            const form = document.getElementById('labels-editor-form');
            if (form) {
                const formSubmitHandler = async (e) => {
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
                };
                form.addEventListener('submit', formSubmitHandler);
                setupEventListenersHandlers.set('labels-form', { element: form, event: 'submit', handler: formSubmitHandler });
                
                // ✅ CORRIGIDO: Adiciona listeners DIRETAMENTE sem setTimeout
                const labelInputIds = ['lbl-C1', 'lbl-C2', 'lbl-C3', 'lbl-C4', 'lbl-C5', 'lbl-C6', 'lbl-C7'];
                labelInputIds.forEach(id => {
                    const input = document.getElementById(id);
                    if (input) {
                        // Handlers individuais para cada evento
                        const clickHandler = () => abrirTecladoSimples(input);
                        const focusHandler = () => abrirTecladoSimples(input);
                        const touchHandler = () => abrirTecladoSimples(input);
                        
                        input.addEventListener('click', clickHandler);
                        input.addEventListener('focus', focusHandler);
                        input.addEventListener('touchstart', touchHandler, { passive: true });
                        
                        setupEventListenersHandlers.set(`${id}-click`, { element: input, event: 'click', handler: clickHandler });
                        setupEventListenersHandlers.set(`${id}-focus`, { element: input, event: 'focus', handler: focusHandler });
                        setupEventListenersHandlers.set(`${id}-touch`, { element: input, event: 'touchstart', handler: touchHandler });
                    }
                });
            }
        }
        // ✅ Handlers para fechar modal ao clicar fora
        document.querySelectorAll('.modal').forEach((modal, index) => {
            const modalClickHandler = (e) => {
                if (e.target === modal) hideModal(modal.id);
            };
            modal.addEventListener('click', modalClickHandler);
            setupEventListenersHandlers.set(`modal-${index}`, { element: modal, event: 'click', handler: modalClickHandler });
        });
    }

    // Initialization
    function initialize() {
        console.log('Inicializando sistema de classificação...');
        
        // ✅ Monitora uso de memória inicial
        if (performance && performance.memory) {
            const usedMB = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
            console.log(`[CLASSIFICATION] 📊 Memória inicial: ${usedMB}MB`);
        }
        
        // Atualiza quantidade inicial
        updateEmbaladorasQuantity();
        
        renderClassesList();
        console.log('Chamando setupEventListeners...');
        setupEventListeners();
        console.log('Chamando renderPresets...');
        renderPresets();
        
        // ✅ CORRIGIDO: Armazena handler para poder remover depois
        storageEventHandler = (e) => {
            if (e.key === 'supervisor_embaladora_quantity') {
                console.log('Quantidade de embaladoras mudou no localStorage:', e.newValue);
                updateEmbaladorasQuantity();
            }
        };
        window.addEventListener('storage', storageEventHandler);
        
        // ✅ CORRIGIDO: Polling para detectar mudanças no localStorage (mesma aba)
        // Limpa timer existente antes de criar novo
        if (localStoragePollTimer) {
            clearInterval(localStoragePollTimer);
            localStoragePollTimer = null;
        }
        
        lastQuantity = getEmbaladoraQuantity();
        localStoragePollTimer = setInterval(() => {
            const currentQuantity = getEmbaladoraQuantity();
            if (currentQuantity !== lastQuantity) {
                console.log('Quantidade de embaladoras mudou:', lastQuantity, '->', currentQuantity);
                lastQuantity = currentQuantity;
                updateEmbaladorasQuantity();
            }
        }, 500); // verifica a cada 500ms

        // Subscrição quando a tela abre
        subscribeScreen();
        startHeartbeat();

        // ✅ CORRIGIDO: Carrega nomes dinâmicos com async/await (evita promise pendente)
        (async () => {
            try {
                const labels = await api.getLabels();
                if (Array.isArray(labels) && labels.length === 7) {
                    state.dynamicLabels = labels.map(v => (v && v.trim() !== '' ? v.trim() : null));
                    // Re-renderiza para refletir nomes adicionais
                    renderGrid();
                    renderClassesList();
                }
            } catch (e) {
                console.error('[CLASSIFICATION] Erro ao carregar labels iniciais:', e);
            }
        })();

        // ✅ INICIALIZA O CACHE E CARREGA OS DADOS DO PLC
        // O cache é inicializado junto com a primeira leitura para evitar race conditions
        console.log('[CLASSIFICATION] 🚀 Inicializando tela com cache de WORDs');
        // ✅ CORRIGIDO: Carrega dados do PLC ao abrir a tela sem setTimeout desnecessário
        (async () => {
            await new Promise(resolve => setTimeout(resolve, 150));
            try {
                await refreshSelectionsFromPLC(true);
            } catch (e) {
                console.error('[CLASSIFICATION] Erro ao carregar seleções iniciais:', e);
            }
        })();

        // ✅ CORRIGIDO: Polling periódico para monitorar conexão PLC ↔ DataHub
        // Reseta estado de conexão
        plcConnected = true;
        consecutiveFailures = 0;
        
        // Limpa timer existente antes de criar novo
        if (labelTimer) {
            clearInterval(labelTimer);
            labelTimer = null;
        }
        
        labelTimer = setInterval(async () => {
            // ✅ CRÍTICO: Evita execuções simultâneas (evita acúmulo de promises)
            if (labelTimerRunning) {
                console.warn('[CLASSIFICATION] ⚠️ labelTimer ainda rodando, pulando execução');
                return;
            }
            
            labelTimerRunning = true;
            try {
                // ✅ VERIFICA STATUS DA CONEXÃO PLC ↔ DataHub
                const isConnected = await api.checkPLCConnection();
                
                // ✅ Detecta DESCONEXÃO (PLC ↔ DataHub)
                if (!isConnected) {
                    consecutiveFailures++;
                    if (consecutiveFailures >= 2) {  // 2 falhas = ~4 segundos
                        if (plcConnected) {
                            // ✅ ACABOU DE DESCONECTAR
                            console.log('[CLASSIFICATION] ❌ Conexão PLC perdida - mostrando ###');
                            plcConnected = false;
                            
                            // Limpa nomes das classes
                            state.dynamicLabels = Array(7).fill(null);
                            renderClassesList();
                        }
                    }
                    return; // Para aqui, não tenta ler dados
                }
                
                // ✅ Detecta RECONEXÃO (PLC ↔ DataHub)
                if (!plcConnected && isConnected) {
                    console.log('[CLASSIFICATION] 🔄 Conexão PLC restaurada - recarregando dados');
                    plcConnected = true;
                    consecutiveFailures = 0;
                    
                    // ✅ CORRIGIDO: Força reload sem setTimeout acumulando
                    try {
                        await refreshSelectionsFromPLC(true);
                    } catch (_) {}
                } else {
                    // Conexão OK
                    consecutiveFailures = 0;
                    plcConnected = true;
                }
                
                // ✅ Lê labels do PLC (só se conectado)
                const labels = await api.getLabels();
                if (Array.isArray(labels) && labels.length === 7) {
                    const normalized = labels.map(v => (v && v.trim() !== '' ? v.trim() : null));
                    
                    // Atualiza labels se mudaram
                    if (!arraysEqual(state.dynamicLabels, normalized)) {
                        state.dynamicLabels = normalized;
                        renderClassesList();
                    }
                }
            } catch (_) { 
                /* ignora erros transitórios */
                consecutiveFailures++;
                if (consecutiveFailures >= 2) {
                    if (plcConnected) {
                        plcConnected = false;
                        state.dynamicLabels = Array(7).fill(null);
                        renderClassesList();
                    }
                }
            } finally {
                labelTimerRunning = false;
            }
        }, LABEL_REFRESH_MS);

        // ✅ CORRIGIDO: Polling periódico para sincronizar seleções do PLC (respeita bloqueio durante escrita)
        // Limpa timer existente antes de criar novo
        if (selectionTimer) {
            clearInterval(selectionTimer);
            selectionTimer = null;
        }
        
        selectionTimer = setInterval(async () => {
            // ✅ CRÍTICO: Evita execuções simultâneas (evita acúmulo de promises)
            if (selectionTimerRunning) {
                logDebug('[CLASSIFICATION] ⚠️ selectionTimer ainda rodando, pulando execução');
                return;
            }
            
            // ✅ Só sincroniza se não estiver escrevendo E não houver itens na fila (evita conflito)
            if (!isClassificationBusy() && !state.isLoadingRecipe && writeQueue.length === 0) {
                selectionTimerRunning = true;
                try {
                    await refreshSelectionsFromPLC(false);
                } catch (error) {
                    console.error('[CLASSIFICATION] Erro no polling de seleções:', error);
                } finally {
                    selectionTimerRunning = false;
                }
            } else {
                logDebug('[CLASSIFICATION] ⏸️ Polling pausado - escritas pendentes ou em andamento');
            }
        }, SELECTION_REFRESH_MS);
        
        // ✅ CORRIGIDO: Polling apenas do alerta de parada
        // Reseta estado dos alertas
        lastAlertText = '';
        lastVisible = false;
        lastGreenVisible = false;
        lastRawAlert = 0; // ✅ Reset valor bruto para forçar primeira atualização
        
        // ✅ CRÍTICO: Limpa timer existente antes de criar novo (evita timers duplicados)
        if (alertTimer) {
            clearInterval(alertTimer);
            alertTimer = null;
        }
        
        // ✅ Garante que não há timer rodando antes de criar novo
        alertTimerRunning = false;
        
        alertTimer = setInterval(async () => {
            // ✅ Evita execuções simultâneas (evita acúmulo de promises e requisições)
            if (alertTimerRunning) {
                return; // Pula se ainda estiver rodando
            }
            
            alertTimerRunning = true;
            try {
                const { rawAlert, rawStatus } = await getAlertAndStatus();
                // Atualiza power pela leitura do status
                updatePowerButtonsFromStatus(rawStatus);

                const text = computeAlertText(rawAlert);

                // Lógica de garras (ajustada):
                // - Garra verde: TAG_STATUS bit 8 = 1
                // - Garra vermelha: QUALQUER alarme (rawAlert != 0) E TAG_STATUS bit 8 = 0
                const statusBit8 = (((rawStatus >>> 8) & 1) === 1);
                const hasAlert   = (Number(rawAlert) >>> 0) !== 0;

                const showGreen = statusBit8;
                const visible   = hasAlert && !statusBit8; // garra vermelha e texto só quando há alarme E não está em movimento (verde)

                // ✅ Compara também o valor bruto para detectar mudanças mesmo quando o texto pode ser similar
                const rawAlertChanged = (rawAlert !== lastRawAlert);
                
                if (rawAlertChanged || text !== lastAlertText || visible !== lastVisible || showGreen !== lastGreenVisible) {
                    lastRawAlert = rawAlert;   // ✅ Atualiza valor bruto
                    lastAlertText = text;
                    lastVisible = visible;
                    lastGreenVisible = showGreen;
                    renderAlert(text, visible);
                    renderClaw(visible);       // garra vermelha
                    renderClawGreen(showGreen);
                    
                    // ✅ Logs removidos completamente para evitar vazamento de memória
                }
            } catch (error) {
                // ✅ Log apenas erros críticos (com throttling para evitar spam)
                if (Date.now() - (window._lastAlertTimerError || 0) > 5000) {
                    console.error('[CLASSIFICATION] Erro no alertTimer:', error);
                    window._lastAlertTimerError = Date.now();
                }
            } finally {
                alertTimerRunning = false;
            }
        }, ALERT_REFRESH_MS);

        // ✅ Função de cleanup para limpar listeners e timers
        function cleanupClassification() {
            console.log('[CLASSIFICATION] 🧹 Limpando recursos...');
            
            // ✅ Remove TODOS os listeners de setupEventListeners
            cleanupSetupEventListeners();
            
            // ✅ Remove event listeners globais
            if (storageEventHandler) {
                window.removeEventListener('storage', storageEventHandler);
                storageEventHandler = null;
            }
            if (visibilityChangeHandler) {
                document.removeEventListener('visibilitychange', visibilityChangeHandler);
                visibilityChangeHandler = null;
            }
            
            // ✅ Remove listener de resize
            if (resizeHandler) {
                window.removeEventListener('resize', resizeHandler);
                resizeHandler = null;
            }
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
                resizeTimeout = null;
            }
            
            // ✅ Limpa todos os listeners de colunas
            document.querySelectorAll('.embaladora-column').forEach(column => {
                const embId = column.getAttribute('data-id');
                const handler = columnClickHandlers.get(embId);
                if (handler) {
                    column.removeEventListener('click', handler);
                    columnClickHandlers.delete(embId);
                }
                // Remove todos os listeners clonando o elemento (força remoção de todos)
                const newColumn = column.cloneNode(true);
                column.parentNode?.replaceChild(newColumn, column);
            });
            columnClickHandlers.clear();
            
            // ✅ Limpa listeners de botões de tipo (podem estar acumulando)
            document.querySelectorAll('.type-btn').forEach(btn => {
                const newBtn = btn.cloneNode(true);
                btn.parentNode?.replaceChild(newBtn, btn);
            });
            
            // ✅ Limpa handler do botão de editar labels
            if (editLabelsBtnHandler) {
                const editLabelsBtn = document.getElementById('edit-labels-btn');
                if (editLabelsBtn) {
                    editLabelsBtn.removeEventListener('click', editLabelsBtnHandler);
                }
                editLabelsBtnHandler = null;
            }
            
            // ✅ Limpa teclado virtual
            cleanupVirtualKeyboard();
            
            // ✅ Limpa handler de preset list
            const presetList = document.getElementById('recipe-list');
            if (presetList && presetListClickHandler) {
                presetList.removeEventListener('click', presetListClickHandler);
                presetListClickHandler = null;
                presetList.dataset.delegated = 'false';
            }
            
            // ✅ Limpa todos os timers conhecidos
            if (labelTimer) {
                clearInterval(labelTimer);
                labelTimer = null;
            }
            if (alertTimer) {
                clearInterval(alertTimer);
                alertTimer = null;
            }
            if (selectionTimer) {
                clearInterval(selectionTimer);
                selectionTimer = null;
            }
            if (localStoragePollTimer) {
                clearInterval(localStoragePollTimer);
                localStoragePollTimer = null;
            }
            if (heartbeatTimer) {
                clearInterval(heartbeatTimer);
                heartbeatTimer = null;
            }
            if (memoryMonitorTimer) {
                clearInterval(memoryMonitorTimer);
                memoryMonitorTimer = null;
            }
            // ✅ Limpa timeout do toast, se existir
            if (typeof toastTimeoutId !== 'undefined' && toastTimeoutId) {
                clearTimeout(toastTimeoutId);
                toastTimeoutId = null;
            }
            
            // ✅ CRÍTICO: Limpa debounce do renderGrid (evita acúmulo de timers)
            if (renderGridDebounceTimer) {
                clearTimeout(renderGridDebounceTimer);
                renderGridDebounceTimer = null;
            }
            
            // ✅ CRÍTICO: Cancela requisição pendente de alertas (evita vazamento de memória)
            if (currentAlertRequestController) {
                try {
                    currentAlertRequestController.abort();
                } catch (_) {}
                currentAlertRequestController = null;
            }
            
            // ✅ Limpa promise pendente
            if (currentAlertRequestPromise) {
                currentAlertRequestPromise = null;
            }
            
            // ✅ Limpa variáveis globais do window (evita vazamento)
            if (window._lastAlertCheck !== undefined) {
                delete window._lastAlertCheck;
            }
            if (window._lastAlertErrorLog !== undefined) {
                delete window._lastAlertErrorLog;
            }
            if (window._lastAlertTimerError !== undefined) {
                delete window._lastAlertTimerError;
            }
            
            // ✅ Força limpeza de variáveis de estado de alertas
            lastRawAlert = 0;
            lastAlertText = '';
            lastVisible = false;
            lastGreenVisible = false;
            
            // ✅ Tenta forçar garbage collection se disponível (apenas Chrome/Edge)
            if (window.gc && typeof window.gc === 'function') {
                try {
                    window.gc();
                } catch (_) {}
            }
            
            // ✅ Limpa todos os timers rastreados (fallback)
            clearAllTrackedTimers();
            
            // Limpa toast
            hideClassificationToast();
            
            // Para heartbeat
            stopHeartbeat();
            
            // Remove subscription
            unsubscribeScreen();
            
            // ✅ Limpa COMPLETAMENTE a fila de escritas e contadores
            clearWriteQueue();
            
            // ✅ Limpa timer do processador de fila
            if (queueProcessorTimer) {
                clearTimeout(queueProcessorTimer);
                queueProcessorTimer = null;
            }
            
            // ✅ Limpa debounce de renderGrid
            if (renderGridDebounceTimer) {
                clearTimeout(renderGridDebounceTimer);
                renderGridDebounceTimer = null;
            }
            
            // Limpa timer de sincronização
            if (syncTimer) {
                clearTimeout(syncTimer);
                syncTimer = null;
            }
            
            // ✅ Limpa estado para liberar memória
            // Limpa arrays de classes mantendo estrutura básica
            state.embaladoras.forEach(emb => {
                if (emb.classes) {
                    emb.classes.length = 0; // Limpa array
                    emb.classes = []; // Força nova referência
                }
            });
            
            // ✅ CRÍTICO: Limita tamanho de presets para evitar acúmulo infinito
            if (state.presets && state.presets.length > 50) {
                console.warn('[CLASSIFICATION] ⚠️ Muitos presets salvos, mantendo apenas os 50 mais recentes');
                state.presets = state.presets.slice(-50);
                try {
                    localStorage.setItem('classification_presets', JSON.stringify(state.presets));
                } catch (_) {}
            }
            
            // ✅ Reseta variáveis de estado
            lastAlertText = '';
            lastVisible = false;
            lastGreenVisible = false;
            plcConnected = true;
            consecutiveFailures = 0;
            lastRenderTime = 0;
            lastClassesListRender = 0;
            
            // ✅ CRÍTICO: Cancela TODAS as requisições pendentes
            activeAbortControllers.forEach(controller => {
                try {
                    controller.abort();
                } catch (_) {}
            });
            activeAbortControllers.clear();
            console.log('[CLASSIFICATION] 🚫 Todas as requisições pendentes canceladas');
            
            // ✅ Monitora uso de memória (apenas em desenvolvimento)
            if (performance && performance.memory) {
                const usedMB = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
                const totalMB = Math.round(performance.memory.totalJSHeapSize / 1024 / 1024);
                console.log(`[CLASSIFICATION] 📊 Memória JS: ${usedMB}MB / ${totalMB}MB`);
            }
            
            // ✅ Força garbage collection sugerindo limpeza (se disponível)
            if (window.gc) {
                window.gc();
                console.log('[CLASSIFICATION] 🗑️ Garbage collection solicitado');
            }
            
            // ✅ CRÍTICO: Reseta flag de inicialização para permitir nova inicialização quando necessário
            if (window._classificationInitialized) {
                window._classificationInitialized = false;
            }
            
            console.log('[CLASSIFICATION] ✅ Cleanup concluído - todos os recursos liberados');
        }
        
        // ✅ Função global de cleanup para ser chamada quando sair da tela
        window.cleanupClassification = cleanupClassification;
        
        // ✅ CORRIGIDO: Cria handler nomeado e armazenado para evitar duplicação
        visibilityChangeHandler = () => {
            if (document.hidden) {
                if (labelTimer) { clearInterval(labelTimer); labelTimer = null; }
                if (alertTimer) { clearInterval(alertTimer); alertTimer = null; }
                if (selectionTimer) { clearInterval(selectionTimer); selectionTimer = null; }
                if (localStoragePollTimer) { clearInterval(localStoragePollTimer); localStoragePollTimer = null; }
                stopHeartbeat();
                unsubscribeScreen();
                
                // ✅ Limpa listeners quando aba fica oculta
                document.querySelectorAll('.embaladora-column').forEach(column => {
                    const embId = column.getAttribute('data-id');
                    const handler = columnClickHandlers.get(embId);
                    if (handler) {
                        column.removeEventListener('click', handler);
                        columnClickHandlers.delete(embId);
                    }
                });
            } else {
                // Ao voltar para esta aba/tela, força leitura do PLC para repovoar os cards
                (async () => {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    try {
                        await refreshSelectionsFromPLC(true);
                    } catch (_) {}
                })();
                subscribeScreen();
                
                // ✅ Reinicia polling de seleções
                if (!selectionTimer) {
                    selectionTimer = setInterval(async () => {
                        if (selectionTimerRunning) return;
                        if (!isClassificationBusy() && !state.isLoadingRecipe) {
                            selectionTimerRunning = true;
                            try {
                                await refreshSelectionsFromPLC(false);
                            } catch (error) {
                                console.error('[CLASSIFICATION] Erro no polling de seleções:', error);
                            } finally {
                                selectionTimerRunning = false;
                            }
                        }
                    }, SELECTION_REFRESH_MS);
                }
                startHeartbeat();
                
                // ✅ Reinicia polling de localStorage
                if (!localStoragePollTimer) {
                    lastQuantity = getEmbaladoraQuantity();
                    localStoragePollTimer = setInterval(() => {
                        const currentQuantity = getEmbaladoraQuantity();
                        if (currentQuantity !== lastQuantity) {
                            console.log('Quantidade de embaladoras mudou:', lastQuantity, '->', currentQuantity);
                            lastQuantity = currentQuantity;
                            updateEmbaladorasQuantity();
                        }
                    }, 500);
                }
                
                if (!labelTimer) {
                    labelTimer = setInterval(async () => {
                        if (labelTimerRunning) return;
                        labelTimerRunning = true;
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
                        finally {
                            labelTimerRunning = false;
                        }
                    }, LABEL_REFRESH_MS);
                }
                if (!alertTimer) {
                    alertTimer = setInterval(async () => {
                        if (alertTimerRunning) return;
                        alertTimerRunning = true;
                        try {
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
                        } catch (error) {
                            console.error('[CLASSIFICATION] Erro no alertTimer (visibilitychange):', error);
                        } finally {
                            alertTimerRunning = false;
                        }
                    }, ALERT_REFRESH_MS);
                }
            }
        };
        
        // ✅ Adiciona handler de visibilitychange apenas uma vez
        document.addEventListener('visibilitychange', visibilityChangeHandler);
        
        // ✅ Monitor de memória periódico (apenas em navegadores que suportam)
        if (performance && performance.memory) {
            if (memoryMonitorTimer) {
                clearInterval(memoryMonitorTimer);
            }
            
            memoryMonitorTimer = setInterval(() => {
                try {
                    const usedMB = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
                    const totalMB = Math.round(performance.memory.totalJSHeapSize / 1024 / 1024);
                    const limitMB = Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024);
                    
                    // Log periódico para monitoramento
                    if (DEBUG_CLASSIFICATION) {
                        console.log(`[CLASSIFICATION] 📊 Memória: ${usedMB}MB / ${totalMB}MB (limite: ${limitMB}MB)`);
                    }
                    
                    // Aviso se uso estiver alto
                    if (usedMB > MEMORY_WARNING_THRESHOLD_MB) {
                        console.warn(`[CLASSIFICATION] ⚠️ Alto uso de memória: ${usedMB}MB`);
                    }
                    
                    // Limpeza automática se uso crítico
                    if (usedMB > MEMORY_CLEANUP_THRESHOLD_MB) {
                        console.error(`[CLASSIFICATION] 🚨 USO CRÍTICO DE MEMÓRIA: ${usedMB}MB - Forçando limpeza!`);
                        
                        // Limpa fila de escritas
                        clearWriteQueue();
                        
                        // Limpa arrays de classes temporariamente
                        state.embaladoras.forEach(emb => {
                            if (emb.classes && emb.classes.length > 10) {
                                emb.classes.splice(10); // Mantém apenas as 10 primeiras
                            }
                        });
                        
                        // Força garbage collection se disponível
                        if (window.gc) {
                            window.gc();
                            console.log('[CLASSIFICATION] 🗑️ GC forçado devido ao uso crítico');
                        }
                    }
                } catch (err) {
                    console.error('[CLASSIFICATION] Erro no monitor de memória:', err);
                }
            }, MEMORY_CHECK_INTERVAL);
        }

        // Simulate active status updates - REMOVIDO para evitar vazamento de memória
        // O status ativo é atualizado pelo polling de seleções quando necessário
    }

    // ✅ Função global para monitoramento de memória (debug)
    window.classificationMemoryReport = function() {
        console.log('=== RELATÓRIO DE MEMÓRIA - CLASSIFICATION ===');
        
        // Memória do navegador
        if (performance && performance.memory) {
            const usedMB = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
            const totalMB = Math.round(performance.memory.totalJSHeapSize / 1024 / 1024);
            const limitMB = Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024);
            console.log(`📊 Heap JS: ${usedMB}MB / ${totalMB}MB (limite: ${limitMB}MB)`);
            console.log(`📊 Uso: ${Math.round((usedMB / limitMB) * 100)}%`);
        } else {
            console.log('⚠️ API performance.memory não disponível');
        }
        
        // Estado interno
        console.log(`\n📋 Estado Interno:`);
        console.log(`  - Embaladoras: ${state.embaladoras.length}`);
        console.log(`  - Classes totais: ${state.embaladoras.reduce((acc, emb) => acc + (emb.classes?.length || 0), 0)}`);
        console.log(`  - Presets salvos: ${state.presets.length}`);
        console.log(`  - Fila de escrita: ${writeQueue.length} itens`);
        console.log(`  - Escritas pendentes: ${pendingWrites}`);
        
        // Timers
        console.log(`\n⏰ Timers Ativos:`);
        console.log(`  - labelTimer: ${labelTimer ? 'ATIVO' : 'inativo'}`);
        console.log(`  - selectionTimer: ${selectionTimer ? 'ATIVO' : 'inativo'}`);
        console.log(`  - alertTimer: ${alertTimer ? 'ATIVO' : 'inativo'}`);
        console.log(`  - localStoragePollTimer: ${localStoragePollTimer ? 'ATIVO' : 'inativo'}`);
        console.log(`  - heartbeatTimer: ${heartbeatTimer ? 'ATIVO' : 'inativo'}`);
        console.log(`  - memoryMonitorTimer: ${memoryMonitorTimer ? 'ATIVO' : 'inativo'}`);
        
        // Event listeners
        console.log(`\n👂 Event Listeners:`);
        console.log(`  - columnClickHandlers: ${columnClickHandlers.size} handlers`);
        console.log(`  - setupEventListenersHandlers: ${setupEventListenersHandlers.size} handlers`);
        console.log(`  - storageEventHandler: ${storageEventHandler ? 'REGISTRADO' : 'não registrado'}`);
        console.log(`  - visibilityChangeHandler: ${visibilityChangeHandler ? 'REGISTRADO' : 'não registrado'}`);
        
        // Requisições
        console.log(`\n🌐 Requisições Ativas:`);
        console.log(`  - activeAbortControllers: ${activeAbortControllers.size} controladores`);
        
        // Flags de execução
        console.log(`\n🚦 Flags de Execução:`);
        console.log(`  - labelTimerRunning: ${labelTimerRunning ? 'SIM' : 'não'}`);
        console.log(`  - selectionTimerRunning: ${selectionTimerRunning ? 'SIM' : 'não'}`);
        console.log(`  - alertTimerRunning: ${alertTimerRunning ? 'SIM' : 'não'}`);
        
        console.log('\n✅ Use window.cleanupClassification() para limpar todos os recursos');
        console.log('===================================\n');
    };
    
    // Start initialization
    initialize();
    
    // ✅ Listener para redimensionamento da janela - recalcula tamanhos dos ovos
    resizeHandler = () => {
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            recalculateEggSizes();
            renderGrid();
        }, 200);
    };
    window.addEventListener('resize', resizeHandler);
    
    // ✅ Log inicial de recursos
    console.log('[CLASSIFICATION] ✅ Inicialização completa');
    console.log('[CLASSIFICATION] 💡 Use window.classificationMemoryReport() para ver status de memória');
}

// ✅ Funções para o teclado virtual simples - movidas para escopo global
let currentInput = null;
let suppressKeyboardOpenUntil = 0;

// ✅ Handlers do teclado virtual para limpeza
let virtualKeyboardHandlers = {
    mousedownHandler: null,
    touchstartHandler: null,
    clickHandler: null,
    keydownHandler: null,
    outsideMouseHandler: null,
    outsideTouchHandler: null
};

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

// ✅ Função para limpar listeners do teclado virtual
function cleanupVirtualKeyboard() {
    const teclado = document.getElementById('simple-keyboard');
    const kbdInput = document.getElementById('keyboard-input');
    
    // Remove listeners do teclado
    if (teclado) {
        if (virtualKeyboardHandlers.mousedownHandler) {
            teclado.removeEventListener('mousedown', virtualKeyboardHandlers.mousedownHandler);
        }
        if (virtualKeyboardHandlers.touchstartHandler) {
            teclado.removeEventListener('touchstart', virtualKeyboardHandlers.touchstartHandler);
        }
        if (virtualKeyboardHandlers.clickHandler) {
            teclado.removeEventListener('click', virtualKeyboardHandlers.clickHandler);
        }
        teclado.dataset.bound = 'false';
    }
    
    // Remove listeners do input
    if (kbdInput) {
        if (virtualKeyboardHandlers.keydownHandler) {
            kbdInput.removeEventListener('keydown', virtualKeyboardHandlers.keydownHandler);
        }
        kbdInput.dataset.bound = 'false';
    }
    
    // Remove listeners globais
    if (virtualKeyboardHandlers.outsideMouseHandler) {
        document.removeEventListener('mousedown', virtualKeyboardHandlers.outsideMouseHandler, true);
    }
    if (virtualKeyboardHandlers.outsideTouchHandler) {
        document.removeEventListener('touchstart', virtualKeyboardHandlers.outsideTouchHandler, { passive: true, capture: true });
    }
    
    // Limpa handlers
    virtualKeyboardHandlers = {
        mousedownHandler: null,
        touchstartHandler: null,
        clickHandler: null,
        keydownHandler: null,
        outsideMouseHandler: null,
        outsideTouchHandler: null
    };
    
    console.log('[CLASSIFICATION] 🧹 Teclado virtual limpo');
}

// Event listeners para o teclado virtual simples
function setupVirtualKeyboard() {
    const teclado = document.getElementById('simple-keyboard');
    if (!teclado) return;
    if (teclado.dataset.bound === 'true') return; // evita bind duplicado
    
    // ✅ Limpa listeners anteriores se existirem
    cleanupVirtualKeyboard();
    
    teclado.dataset.bound = 'true';
    
    // Impede propagação para elementos atrás
    virtualKeyboardHandlers.mousedownHandler = (e) => { e.stopPropagation(); };
    virtualKeyboardHandlers.touchstartHandler = (e) => { e.stopPropagation(); };
    
    teclado.addEventListener('mousedown', virtualKeyboardHandlers.mousedownHandler);
    teclado.addEventListener('touchstart', virtualKeyboardHandlers.touchstartHandler, { passive: true });

    // Manipulação das teclas
    virtualKeyboardHandlers.clickHandler = function(e) {
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
    };
    teclado.addEventListener('click', virtualKeyboardHandlers.clickHandler);

    // Suporte a teclado físico quando o campo do teclado virtual estiver focado
    const kbdInput = document.getElementById('keyboard-input');
    if (kbdInput && kbdInput.dataset.bound !== 'true') {
        kbdInput.dataset.bound = 'true';
        virtualKeyboardHandlers.keydownHandler = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                fecharTecladoSimples(true);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                fecharTecladoSimples(false);
            }
        };
        kbdInput.addEventListener('keydown', virtualKeyboardHandlers.keydownHandler);
    }

    // Fecha ao clicar fora do teclado
    const shouldIgnoreTarget = (el) => {
        if (!el) return false;
        if (el.closest && el.closest('#simple-keyboard')) return true; // clique dentro do teclado
        // campos que disparam a abertura do teclado
        if (el.id && /^lbl-C[1-7]$/.test(el.id)) return true;
        return false;
    };
    
    virtualKeyboardHandlers.outsideMouseHandler = (e) => {
        const isVisible = teclado && teclado.style.display !== 'none';
        if (!isVisible) return;
        const target = e.target;
        if (shouldIgnoreTarget(target)) return;
        fecharTecladoSimples(false);
    };
    
    virtualKeyboardHandlers.outsideTouchHandler = (e) => {
        const isVisible = teclado && teclado.style.display !== 'none';
        if (!isVisible) return;
        const target = e.target;
        if (shouldIgnoreTarget(target)) return;
        fecharTecladoSimples(false);
    };
    
    document.addEventListener('mousedown', virtualKeyboardHandlers.outsideMouseHandler, true);
    document.addEventListener('touchstart', virtualKeyboardHandlers.outsideTouchHandler, { passive: true, capture: true });
}

// Garante inicialização mesmo se o script carregar após DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupVirtualKeyboard);
} else {
    setupVirtualKeyboard();
}

// ✅ IMPORTANTE (SPA): a inicialização da tela de classificação é controlada pelo menu em `static/scripts/main.js`
// (função `showClassification`). Não inicialize aqui no DOMContentLoaded, senão cria múltiplas instâncias/timers
// e a RAM dispara ao abrir a tela.
