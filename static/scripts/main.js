// ✅ CRÍTICO: Handlers globais para evitar acumulação de erros na memória
// Quando PLC está desconectado, fetch requests falham e podem acumular erros
window.addEventListener('unhandledrejection', function(event) {
    // Log silencioso para não poluir console, mas evita acumulação de erros
    console.debug('[MAIN] Promise rejeitada não tratada:', event.reason);
    // Previne comportamento padrão que pode acumular erros
    event.preventDefault();
});

// Handler para erros gerais (evita acumulação)
window.addEventListener('error', function(event) {
    // Log silencioso para erros de script
    if (event.message && event.message.includes('Script')) {
        console.debug('[MAIN] Erro de script:', event.message);
        event.preventDefault();
    }
});

// ✅ CRÍTICO: Wrapper global de fetch com timeout e monitor opcional
// Isso impede acúmulo de requisições quando o PLC/DataHub está offline
(function installFetchTimeout() {
    if (window.__fetchTimeoutInstalled) return;
    if (typeof window.fetch !== 'function') return;
    const nativeFetch = window.fetch.bind(window);
    const DEFAULT_TIMEOUT_MS = 8000;

    function getUrlKey(input) {
        try {
            if (typeof input === 'string') return input;
            if (input && typeof input.url === 'string') return input.url;
        } catch (_) {}
        return 'unknown';
    }

    window.fetch = function(input, init = {}) {
        const urlKey = getUrlKey(input);
        const isLargeAsset = /\/static\/3D\/|\.glb(\?|$)|\.gltf(\?|$)/i.test(urlKey) || /^blob:/i.test(urlKey) || /^data:/i.test(urlKey);
        const timeoutMs = (typeof init.timeoutMs === 'number') ? init.timeoutMs : (isLargeAsset ? 0 : DEFAULT_TIMEOUT_MS);

        // Monitor: registra início
        if (window.__monitor && typeof window.__monitor.onFetchStart === 'function') {
            window.__monitor.onFetchStart(urlKey);
        }

        // Se já existe signal ou timeout desativado, delega
        if (init.signal || !timeoutMs || timeoutMs <= 0) {
            return nativeFetch(input, init)
                .finally(() => {
                    if (window.__monitor && typeof window.__monitor.onFetchEnd === 'function') {
                        window.__monitor.onFetchEnd(urlKey);
                    }
                });
        }

        const controller = new AbortController();
        const timerId = setTimeout(() => {
            try { controller.abort(); } catch(_) {}
        }, timeoutMs);
        const nextInit = Object.assign({}, init, { signal: controller.signal });

        return nativeFetch(input, nextInit)
            .finally(() => {
                clearTimeout(timerId);
                if (window.__monitor && typeof window.__monitor.onFetchEnd === 'function') {
                    window.__monitor.onFetchEnd(urlKey);
                }
            });
    };
    window.__fetchTimeoutInstalled = true;
})();

// ✅ Monitor opcional de vazamento (fetch/intervals/timeouts/listeners/DOM)
// Ative com ?monitor=1 na URL ou localStorage supervisor_monitor=1
(function installLeakMonitor() {
    function isEnabled() {
        try {
            const q = new URLSearchParams(window.location.search);
            if (q.get('monitor') === '1') return true;
        } catch (_) {}
        try {
            return localStorage.getItem('supervisor_monitor') === '1';
        } catch (_) {}
        return false;
    }

    if (!isEnabled()) return;
    if (window.__monitorInstalled) return;

    const monitor = {
        fetchInFlight: 0,
        fetchByUrl: new Map(),
        intervals: new Map(),
        timeouts: new Map(),
        timeoutCreated: 0,
        timeoutSources: new Map(),
        _lastTimeoutTotals: new Map(),
        listenersAdded: 0,
        listenersRemoved: 0,
        suppress: false,
        onFetchStart(url) {
            this.fetchInFlight++;
            const key = String(url || 'unknown');
            const entry = this.fetchByUrl.get(key) || { inFlight: 0, total: 0, lastAt: 0, lastStack: null };
            entry.inFlight += 1;
            entry.total += 1;
            entry.lastAt = Date.now();
            if (!entry.lastStack) {
                try { entry.lastStack = (new Error().stack || '').split('\n').slice(2, 7).join('\n'); } catch (_) {}
            }
            this.fetchByUrl.set(key, entry);
        },
        onFetchEnd(url) {
            this.fetchInFlight = Math.max(0, this.fetchInFlight - 1);
            const key = String(url || 'unknown');
            const entry = this.fetchByUrl.get(key);
            if (entry) {
                entry.inFlight = Math.max(0, entry.inFlight - 1);
                this.fetchByUrl.set(key, entry);
            }
        },
        withoutTracking(fn) {
            this.suppress = true;
            try { return fn(); } finally { this.suppress = false; }
        }
    };

    window.__monitor = monitor;

    // Wrap setInterval / clearInterval
    const nativeSetInterval = window.setInterval.bind(window);
    const nativeClearInterval = window.clearInterval.bind(window);
    window.setInterval = function(fn, ms, ...args) {
        if (monitor.suppress) return nativeSetInterval(fn, ms, ...args);
        const id = nativeSetInterval(fn, ms, ...args);
        try {
            monitor.intervals.set(id, { ms: ms, at: Date.now(), stack: (new Error().stack || '').split('\n').slice(2, 7).join('\n') });
        } catch (_) {}
        return id;
    };
    window.clearInterval = function(id) {
        monitor.intervals.delete(id);
        return nativeClearInterval(id);
    };

    function getStackKey(skip) {
        try {
            const stack = (new Error().stack || '').split('\n');
            const line = stack[skip || 3] || stack[2] || stack[1] || 'unknown';
            return line.trim();
        } catch (_) {
            return 'unknown';
        }
    }

    // Wrap setTimeout / clearTimeout
    const nativeSetTimeout = window.setTimeout.bind(window);
    const nativeClearTimeout = window.clearTimeout.bind(window);
    window.setTimeout = function(fn, ms, ...args) {
        if (monitor.suppress) return nativeSetTimeout(fn, ms, ...args);
        const key = getStackKey(3);
        monitor.timeoutCreated += 1;
        const src = monitor.timeoutSources.get(key) || { total: 0, lastAt: 0 };
        src.total += 1;
        src.lastAt = Date.now();
        monitor.timeoutSources.set(key, src);

        const handler = (typeof fn === 'function') ? fn : function() {
            try { Function(String(fn))(); } catch (_) {}
        };

        const id = nativeSetTimeout(function(...cbArgs) {
            try {
                return handler.apply(this, cbArgs);
            } finally {
                monitor.timeouts.delete(id);
            }
        }, ms, ...args);
        monitor.timeouts.set(id, { ms: ms, at: Date.now(), key });
        return id;
    };
    window.clearTimeout = function(id) {
        monitor.timeouts.delete(id);
        return nativeClearTimeout(id);
    };

    // Wrap addEventListener / removeEventListener (contagem simples)
    const nativeAdd = EventTarget.prototype.addEventListener;
    const nativeRemove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
        if (!monitor.suppress) monitor.listenersAdded += 1;
        return nativeAdd.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function(type, listener, options) {
        if (!monitor.suppress) monitor.listenersRemoved += 1;
        return nativeRemove.call(this, type, listener, options);
    };

    // Overlay
    const overlay = document.createElement('div');
    overlay.id = 'monitor-overlay';
    overlay.style.cssText = [
        'position:fixed',
        'bottom:12px',
        'right:12px',
        'z-index:99999',
        'background:rgba(0,0,0,0.75)',
        'color:#00ff9a',
        'padding:10px 12px',
        'font:12px/1.4 monospace',
        'border-radius:8px',
        'max-width:420px',
        'box-shadow:0 4px 16px rgba(0,0,0,0.35)'
    ].join(';');
    overlay.textContent = 'monitor inicializando...';
    document.body.appendChild(overlay);

    function formatBytes(n) {
        if (!n && n !== 0) return 'n/a';
        const mb = n / (1024 * 1024);
        return mb.toFixed(1) + ' MB';
    }

    function getTopFetch() {
        const arr = [];
        monitor.fetchByUrl.forEach((v, k) => {
            if (v.inFlight > 0 || v.total > 0) arr.push({ url: k, inFlight: v.inFlight, total: v.total });
        });
        arr.sort((a, b) => (b.inFlight - a.inFlight) || (b.total - a.total));
        return arr.slice(0, 5);
    }

    const render = () => {
        const mem = (performance && performance.memory) ? performance.memory : null;
        const nodes = document.getElementsByTagName('*').length;
        const top = getTopFetch();
        const topText = top.map(t => `${t.inFlight}/${t.total} ${t.url}`).join('\n');
        const intervalCount = monitor.intervals.size;
        const timeoutCount = monitor.timeouts.size;
        const listenersDelta = monitor.listenersAdded - monitor.listenersRemoved;
        overlay.textContent =
            `MONITOR\n` +
            `JS Heap: ${mem ? (formatBytes(mem.usedJSHeapSize) + ' / ' + formatBytes(mem.totalJSHeapSize)) : 'n/a'}\n` +
            `DOM nodes: ${nodes}\n` +
            `fetch in-flight: ${monitor.fetchInFlight}\n` +
            `intervals: ${intervalCount}  timeouts: ${timeoutCount}\n` +
            `listeners Δ: ${listenersDelta}\n` +
            (topText ? `top fetch:\n${topText}` : '');
    };

    monitor.withoutTracking(() => {
        nativeSetInterval(render, 2000);
        nativeSetTimeout(render, 200);
    });

    window.__monitorDump = function() {
        console.log('[MONITOR] fetchByUrl:', Array.from(monitor.fetchByUrl.entries()));
        console.log('[MONITOR] intervals:', Array.from(monitor.intervals.values()));
        console.log('[MONITOR] timeouts:', Array.from(monitor.timeouts.values()));
        console.log('[MONITOR] listeners added/removed:', monitor.listenersAdded, monitor.listenersRemoved);
    };

    window.__monitorInstalled = true;
})();

// ✅ Função utilitária para aplicar traduções após mostrar uma tela
function applyTranslationsIfAvailable() {
    if (window.Translations && typeof window.Translations.applyToDOM === 'function') {
        setTimeout(() => window.Translations.applyToDOM(), 50);
    }
}

// Função para carregar scripts dinamicamente (com dedupe robusto)
const __scriptLoadPromises = new Map();
const SYNC_SCRIPT_SRC = '/static/scripts/partials/synchronism.js?v=20260202_sync_initfix';
const VIEWER3D_SCRIPT_SRC = '/static/scripts/partials/viewer3d.js';
const PLATES_SCRIPT_SRC = '/static/scripts/partials/plates.js?v=20260202_plates';
const SOLENOIDS_SCRIPT_SRC = '/static/scripts/partials/solenoids.js?v=20260202_solenoids';
const PANELS_SCRIPT_SRC = '/static/scripts/partials/panels.js?v=20260202_panels';
const WINDOWS_SCRIPT_SRC = '/static/scripts/partials/windows.js?v=20260202_windows';
function loadScript(src) {
    if (__scriptLoadPromises.has(src)) {
        return __scriptLoadPromises.get(src);
    }

    // Se já existe uma tag <script> com este src (ex.: incluída no HTML), aguarda o load dela
    const existing = Array.from(document.getElementsByTagName('script'))
        .find(s => s.src && s.src.includes(src));

    if (existing) {
        const p = new Promise((resolve, reject) => {
            if (existing.dataset.loaded === '1' || existing.readyState === 'complete') {
                resolve();
                return;
            }
            const onLoad = () => {
                existing.dataset.loaded = '1';
                resolve();
            };
            const onError = () => reject(new Error(`Erro ao carregar ${src}`));
            existing.addEventListener('load', onLoad, { once: true });
            existing.addEventListener('error', onError, { once: true });
        });
        __scriptLoadPromises.set(src, p);
        return p;
    }

    const p = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
            script.dataset.loaded = '1';
            console.log(`Script ${src} carregado com sucesso!`);
            resolve();
        };
        script.onerror = () => reject(new Error(`Erro ao carregar ${src}`));
        document.head.appendChild(script);
    });
    __scriptLoadPromises.set(src, p);
    return p;
}

// =========================
// Persistência da última tela aberta
// =========================
const LAST_SCREEN_KEY = 'supervisor_last_screen';

function setLastScreen(screenName) {
    try {
        localStorage.setItem(LAST_SCREEN_KEY, screenName);
    } catch (e) {
        console.warn('Não foi possível salvar última tela no localStorage:', e);
    }
}

function showWeightRange() {
    console.log('Mostrando tela de faixa de peso...'); // Debug
    
    // Oculta outros containers
    document.getElementById('grid-container').style.display = 'none';
    document.getElementById('alarm-container').style.display = 'none';
    
    // Mostra o container de faixa de peso
    const weightContainer = document.getElementById('weight-range-container');
    if (weightContainer) {
        weightContainer.style.display = 'block';
    } else {
        console.error('Container weight-range-container não encontrado!');
    }
    
    // Atualiza botão ativo no menu
    document.querySelectorAll('.menu-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    // Inicializa se necessário
    if (typeof inicializarWeightRange === 'function') {
        inicializarWeightRange();
    } else {
        console.error('Função inicializarWeightRange não encontrada!');
    }
}



function hideAllContainers() {
    console.log('[MAIN] 🧹 Escondendo todos os containers e limpando recursos...');
    
    const containers = [
        'grid-container',
        'alarm-container',
        'weight-range-container',
        'balance-container',
        'classification-container',
        'input-container',
        'washer-container',
        'dryer-container',
        'windows-container', // Adicionar windows-container
        'diagram-container',
        'graphics-container', // Adicionar graphics-container
        'viewer3d-container', // Adicionar viewer3d-container
        'samples-container', // Adicionar samples-container
        'panels-container', // Adicionar panels-container
        'plates-container', // Adicionar plates-container
        'solenoids-container', // Adicionar solenoids-container
        'synchronism-container', // Adicionar synchronism-container
        'information-container' // Adicionar information-container
    ];
    containers.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'none';
            el.style.visibility = 'hidden';
        }
    });
    
    // ✅ CRÍTICO: Cleanup de TODAS as telas quando sair (evita vazamento de memória)
    // Cleanup do grid (sempre ativo, mas limpa quando outras telas são abertas)
    if (typeof window.cleanupGrid === 'function') {
        try {
            window.cleanupGrid();
        } catch (e) {
            console.warn('Erro ao fazer cleanup do grid:', e);
        }
    }
    
    // Cleanup da tela de balança
    if (typeof window.cleanupBalance === 'function') {
        try {
            window.cleanupBalance();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de balança:', e);
        }
    }
    
    // Cleanup da tela de classificação
    if (typeof window.cleanupClassification === 'function') {
        try {
            window.cleanupClassification();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de classificação:', e);
        }
    }
    
    // Cleanup da tela de gráficos
    if (typeof window.cleanupGraphics === 'function') {
        try {
            window.cleanupGraphics();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de gráficos:', e);
        }
    }
    
    // Cleanup da tela de entrada
    if (typeof window.cleanupInput === 'function') {
        try {
            window.cleanupInput();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de entrada:', e);
        }
    }
    
    // Cleanup da tela de lavadora
    if (typeof window.cleanupWasher === 'function') {
        try {
            window.cleanupWasher();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de lavadora:', e);
        }
    }
    
    // Cleanup da tela de secadora
    if (typeof window.cleanupDryer === 'function') {
        try {
            window.cleanupDryer();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de secadora:', e);
        }
    }
    
    // Cleanup da tela de diagrama
    if (typeof window.cleanupDiagram === 'function') {
        try {
            window.cleanupDiagram();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de diagrama:', e);
        }
    }
    
    // Cleanup da tela de janelas
    if (typeof window.cleanupWindows === 'function') {
        try {
            window.cleanupWindows();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de janelas:', e);
        }
    }
    
    // Cleanup da tela de visualizador 3D
    if (typeof window.cleanupViewer3D === 'function') {
        try {
            window.cleanupViewer3D();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de visualizador 3D:', e);
        }
    }
    
    // Cleanup da tela de faixa de peso
    if (typeof window.cleanupWeightRange === 'function') {
        try {
            window.cleanupWeightRange();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de faixa de peso:', e);
        }
    }
    
    // Cleanup da tela de alarmes
    if (typeof window.cleanupAlarm === 'function') {
        try {
            window.cleanupAlarm();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de alarmes:', e);
        }
    }
    
    // Cleanup da tela de amostras
    if (typeof window.cleanupSamples === 'function') {
        try {
            window.cleanupSamples();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de amostras:', e);
        }
    }
    
    // Cleanup da tela de solenoides
    if (typeof window.cleanupSolenoids === 'function') {
        try {
            window.cleanupSolenoids();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de solenoides:', e);
        }
    }

    // Cleanup da tela de painéis
    if (typeof window.cleanupPanels === 'function') {
        try {
            window.cleanupPanels();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de painéis:', e);
        }
    }

    // Cleanup da tela de placas
    if (typeof window.cleanupPlates === 'function') {
        try {
            window.cleanupPlates();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de placas:', e);
        }
    }
    
    // Cleanup da tela de sincronismo
    if (typeof window.cleanupSynchronism === 'function') {
        try {
            window.cleanupSynchronism();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de sincronismo:', e);
        }
    }
    
    // Cleanup da tela de informações
    if (typeof window.cleanupInformation === 'function') {
        try {
            window.cleanupInformation();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de informações:', e);
        }
    }
    
    // ✅ CRÍTICO: Para o background feed de gráficos (roda SEMPRE, mesmo com telas ocultas)
    // Será reiniciado quando grid ou graphics forem abertos
    if (typeof window.stopGraphicsBackgroundFeed === 'function') {
        try {
            window.stopGraphicsBackgroundFeed();
        } catch (e) {
            console.warn('[MAIN] Erro ao parar background feed de gráficos:', e);
        }
    }
    
    // ✅ CRÍTICO: Desconecta Socket.IO global quando não há telas que precisam dele
    // Isso evita tentativas infinitas de reconexão que consomem memória
    if (window.supervisorSocket) {
        try {
            // Antes de desconectar, verifica se alguma tela precisa do socket
            // Grid e Graphics são as principais telas que usam o socket
            const gridVisible = document.getElementById('grid-container')?.style.display !== 'none';
            const graphicsVisible = document.getElementById('graphics-container')?.style.display !== 'none';
            const samplesVisible = document.getElementById('samples-container')?.style.display !== 'none';
            
            // Se nenhuma dessas telas está visível, pode desconectar o socket
            if (!gridVisible && !graphicsVisible && !samplesVisible) {
                console.log('[MAIN] 🔌 Desconectando Socket.IO global (nenhuma tela precisa dele)...');
                
                // Remove todos os listeners antes de desconectar
                window.supervisorSocket.removeAllListeners();
                
                // Desconecta o socket
                window.supervisorSocket.disconnect();
                
                // Define como null para permitir reconexão quando necessário
                window.supervisorSocket = null;
                
                console.log('[MAIN] ✅ Socket.IO desconectado');
            }
        } catch (e) {
            console.warn('[MAIN] ⚠️ Erro ao desconectar Socket.IO:', e);
        }
    }
    
    // ✅ CRÍTICO: Resetamos as flags de inicialização para permitir reinicialização
    // Agora que temos funções de cleanup adequadas, as telas podem ser reinicializadas com segurança
    window.washerInitialized = false;
    window.dryerInitialized = false;
    window.diagramInitialized = false;
    window.windowsInitialized = false;
    window.panelsInitialized = false;
    window.solenoidsInitialized = false;
    window.viewer3dInitialized = false;
    window._classificationInitialized = false;
    window.synchronismInitialized = false;
    window.informationInitialized = false;
    
    console.log('[MAIN] ✅ Cleanup de todos os containers concluído');
}

// Função para exibir o grid
function showGrid(event) {
    setLastScreen('grid');
    hideAllContainers();
    const grid = document.getElementById('grid-container');
    if (grid) {
        grid.style.display = 'block';
        grid.style.visibility = 'visible';
    }

    // Parar atualização de alarmes ao sair da tela de alarmes
    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    // Só marca como ativo se a origem do clique for um botão de menu
    if (event && event.currentTarget && event.currentTarget.classList && event.currentTarget.classList.contains('menu-btn')) {
        event.currentTarget.classList.add('active');
    }
    
    // Iniciar atualização de data/hora quando mostrar o grid
    if (window.startDateTimeUpdate) {
        window.startDateTimeUpdate();
    }
    
    // ✅ CRÍTICO: Inicia background feed de gráficos (mini-gráfico do grid)
    if (typeof window.startGraphicsBackgroundFeed === 'function') {
        setTimeout(() => window.startGraphicsBackgroundFeed(), 100);
    }
    
    // ✅ Garante que subscription seja ativada quando tela inicial (grid) for aberta
    // O grid também tem um mini-gráfico que precisa dos dados
    if (typeof window.checkGraphicsSubscription === 'function') {
        setTimeout(() => window.checkGraphicsSubscription(), 200);
    }
    
    // Re-inicializa o grid se necessário (após cleanup)
    if (typeof window.inicializarVelocimetro === 'function') {
        try {
            window.inicializarVelocimetro();
        } catch (e) {
            console.warn('Erro ao reinicializar grid:', e);
        }
    }
    
    // ✅ CRÍTICO: Inicia processos do grid sob demanda (evita vazamento de memória)
    // Estas funções foram desabilitadas do auto-start no DOMContentLoaded
    // e agora só iniciam quando o grid está visível
    setTimeout(() => {
        // Inicia atualização de data/hora
        if (typeof window.startDateTimeUpdate === 'function') {
            try {
                window.startDateTimeUpdate();
            } catch (e) {
                console.warn('[GRID] Erro ao iniciar data/hora:', e);
            }
        }
        
        // Inicia jogs e velocidades fixas
        if (typeof window.setupJogAcumuladora === 'function') {
            try { window.setupJogAcumuladora(); } catch (e) { console.warn('[GRID] Erro setupJogAcumuladora:', e); }
        }
        if (typeof window.bindVelocidadeFixaAcumuladora === 'function') {
            try { window.bindVelocidadeFixaAcumuladora(); } catch (e) { console.warn('[GRID] Erro bindVelocidadeFixaAcumuladora:', e); }
        }
        if (typeof window.setupJogDosificadora === 'function') {
            try { window.setupJogDosificadora(); } catch (e) { console.warn('[GRID] Erro setupJogDosificadora:', e); }
        }
        if (typeof window.bindVelocidadeFixaDosificadora === 'function') {
            try { window.bindVelocidadeFixaDosificadora(); } catch (e) { console.warn('[GRID] Erro bindVelocidadeFixaDosificadora:', e); }
        }
        if (typeof window.setupJogEscova === 'function') {
            try { window.setupJogEscova(); } catch (e) { console.warn('[GRID] Erro setupJogEscova:', e); }
        }
        if (typeof window.bindVelocidadeFixaEscova === 'function') {
            try { window.bindVelocidadeFixaEscova(); } catch (e) { console.warn('[GRID] Erro bindVelocidadeFixaEscova:', e); }
        }
        
        // Inicia periféricos
        if (typeof window.initPeripherals === 'function') {
            try { window.initPeripherals(); } catch (e) { console.warn('[GRID] Erro initPeripherals:', e); }
        }
        if (typeof window.startPeripheralsSync === 'function') {
            try {
                setTimeout(() => window.startPeripheralsSync(), 1000);
            } catch (e) {
                console.warn('[GRID] Erro startPeripheralsSync:', e);
            }
        }
        
        // Inicia intervalo de garantia do botão de power no lugar correto
        if (!window.__ensurePowerBtnInterval && typeof window.ensurePowerButtonInCorrectPlace === 'function') {
            try {
                window.__ensurePowerBtnInterval = setInterval(window.ensurePowerButtonInCorrectPlace, 10000);
            } catch (e) {
                console.warn('[GRID] Erro ao criar __ensurePowerBtnInterval:', e);
            }
        }
        
        // Configura drag and drop do grid
        if (typeof window.configurarDragAndDrop === 'function') {
            try { window.configurarDragAndDrop(); } catch (e) { console.warn('[GRID] Erro configurarDragAndDrop:', e); }
        }
        
        // ✅ Aplica traduções após mostrar a tela
        applyTranslationsIfAvailable();
    }, 300);
}

// Função para exibir gráficos
function showGraphics(event) {
    setLastScreen('graphics');
    hideAllContainers();
    const graphics = document.getElementById('graphics-container');
    if (graphics) {
        graphics.style.display = 'block';
        graphics.style.visibility = 'visible';
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    // Marca ativo somente quando for clique em botão do menu
    if (event && event.currentTarget && event.currentTarget.classList && event.currentTarget.classList.contains('menu-btn')) {
        event.currentTarget.classList.add('active');
    }

    // ✅ CRÍTICO: Inicia background feed de gráficos
    if (typeof window.startGraphicsBackgroundFeed === 'function') {
        setTimeout(() => window.startGraphicsBackgroundFeed(), 100);
    }
    
    // Inicializa gráficos se necessário
    if (typeof window.initGraphics === 'function') {
        const chart = window.classesChart;
        // Evita re-inicializar se já existe um gráfico válido
        if (!chart || (chart && chart._destroyed)) {
            window.initGraphics();
        } else {
            // Tenta atualizar de forma segura após ficar visível
            try {
                if (typeof chart.update === 'function') {
                    chart.update('none');
                } else {
                    // Se não houver update, re-inicializa
                    window.initGraphics();
                }
            } catch (e) {
                console.warn('Falha ao atualizar o gráfico. Reinicializando...', e);
                window.initGraphics();
            }
        }
    } else {
        console.error('Função initGraphics não encontrada!');
    }
    
    // ✅ Garante que subscription seja ativada quando tela de gráficos for aberta
    if (typeof window.checkGraphicsSubscription === 'function') {
        setTimeout(() => window.checkGraphicsSubscription(), 200);
    }
}

// Função para exibir o conteúdo do alarme
function showAlarm(event) {
    setLastScreen('alarm');
    hideAllContainers();
    const alarm = document.getElementById('alarm-container');
    if (alarm) {
        alarm.style.display = 'block';
        alarm.style.visibility = 'visible';
    }

    // Remove active de todos os botões do menu
    document.querySelectorAll('.menu-btn').forEach(btn => {
        if (btn && btn.classList) {
            btn.classList.remove('active');
        }
    });
    
    // Adiciona active apenas se o currentTarget for um botão do menu válido
    if (event && event.currentTarget && event.currentTarget.classList) {
        const isMenuBtn = event.currentTarget.classList.contains('menu-btn') || 
                         event.currentTarget.closest('.menu-btn');
        if (isMenuBtn) {
            const menuBtn = event.currentTarget.classList.contains('menu-btn') 
                ? event.currentTarget 
                : event.currentTarget.closest('.menu-btn');
            if (menuBtn && menuBtn.classList) {
                menuBtn.classList.add('active');
            }
        }
    }

    if (window.inicializarAlarmes) {
        window.inicializarAlarmes();
    }

    // Inicializar botões rápidos de comunicação com PLC
    if (window.inicializarBotoesRapidos) {
        window.inicializarBotoesRapidos();
    }

    // Iniciar atualização automática dos alarmes quando a tela estiver visível
    if (window.startAlarmAutoRefresh) {
        window.startAlarmAutoRefresh();
    }

    // Seleciona a aba desejada APÓS garantir que o DOM está pronto e os botões existem
    // Aguarda um pouco mais para garantir que inicializarAlarmes() terminou de configurar os botões
    const selectDesiredTab = () => {
        try {
            let desired = (window.__desiredAlarmTab || '').toLowerCase();
            if (!desired && window.location && window.location.hash && window.location.hash.startsWith('#alarms-')) {
                desired = window.location.hash.replace('#alarms-', '').toLowerCase();
            }
            if (desired && typeof window.selectAlarmTab === 'function') {
                console.log(`[SHOW_ALARM] Tentando selecionar aba: "${desired}"`);
                const ok = window.selectAlarmTab(desired);
                if (ok) {
                    window.__desiredAlarmTab = '';
                    try { if (window.location && window.location.hash) window.location.hash = ''; } catch(_) {}
                    console.log(`[SHOW_ALARM] ✅ Aba "${desired}" selecionada com sucesso`);
                    return true;
                } else {
                    console.log(`[SHOW_ALARM] ⚠️ Primeira tentativa falhou, tentando novamente...`);
                    return false;
                }
            }
        } catch(err) {
            console.error('[SHOW_ALARM] Erro ao selecionar aba:', err);
        }
        return false;
    };

    // ✅ Sempre força modo "Instantâneo" ao abrir a tela de alarmes via botões
    const forceInstantIfNeeded = () => {
        try {
            if (typeof window.forceInstantAlarmView === 'function') {
                window.forceInstantAlarmView();
                return true;
            }
        } catch (e) {
            console.warn('[SHOW_ALARM] Falha ao forçar modo instantâneo:', e);
        }
        return false;
    };
    
    // Tenta selecionar após um pequeno delay para garantir que os botões estão prontos
    requestAnimationFrame(() => {
        setTimeout(() => {
            forceInstantIfNeeded();
            if (!selectDesiredTab()) {
                // Retry rápido se os botões ainda não estiverem prontos
                let attempts = 0;
                const maxAttempts = 50; // Aumentado para dar mais tempo
                const retry = () => {
                    attempts++;
                    if (selectDesiredTab()) {
                        return; // Sucesso, para de tentar
                    }
                    if (attempts < maxAttempts) {
                        setTimeout(retry, 30); // Aumentado para 30ms
                    } else {
                        console.warn(`[SHOW_ALARM] ⚠️ Não foi possível selecionar aba após ${maxAttempts} tentativas`);
                    }
                };
                setTimeout(retry, 50); // Delay inicial maior
            }
        }, 50); // Delay inicial aumentado
    });
}

function showWeightRange(event) {
    setLastScreen('weight');
    hideAllContainers();
    const weightContainer = document.getElementById('weight-range-container');
    if (weightContainer) {
        weightContainer.style.display = 'block';
        weightContainer.style.visibility = 'visible';
    }

    // Parar atualização de alarmes ao sair da tela de alarmes
    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    if (typeof inicializarWeightRange === 'function') {
        inicializarWeightRange();
    }
}

function showBalance(event) {
    setLastScreen('balance');
    hideAllContainers();
    const balanceContainer = document.getElementById('balance-container');
    if (balanceContainer) {
        balanceContainer.style.display = 'block';
        balanceContainer.style.visibility = 'visible';
    }

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    if (typeof inicializarBalance === 'function') {
        inicializarBalance();
    }
}

function showClassification(event) {
    setLastScreen('classification');
    hideAllContainers();
    const classificationContainer = document.getElementById('classification-container');
    if (classificationContainer) {
        classificationContainer.style.display = 'block';
        classificationContainer.style.visibility = 'visible';
        classificationContainer.style.zIndex = '1';
    }

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    // ✅ CRÍTICO: Sempre limpa antes de reabrir para evitar vazamento de memória
    // O cleanupClassification já limpa todos os timers, então podemos sempre reinicializar
    if (typeof window.cleanupClassification === 'function') {
        try {
            window.cleanupClassification();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de classificação:', e);
        }
    }
    
    // ✅ CRÍTICO: Sempre reinicializa após limpar (evita timers duplicados)
    if (typeof inicializarClassification === 'function') {
        inicializarClassification();
        window._classificationInitialized = true;
    }
}

function showInput(event) {
    setLastScreen('input');
    hideAllContainers();
    const inputContainer = document.getElementById('input-container');
    if (inputContainer) {
        inputContainer.style.display = 'block';
        inputContainer.style.visibility = 'visible';
    }

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    if (typeof inicializarInput === 'function') {
        inicializarInput();
    }
}

// ✅ Exibe a tela da lavadora
function showWasher(event) {
    setLastScreen('washer');
    hideAllContainers();
    const washerContainer = document.getElementById('washer-container');
    if (washerContainer) {
        washerContainer.style.display = 'block';
        washerContainer.style.visibility = 'visible';
    }

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    
    // Inicializa o washer se ainda não foi inicializado
    if (typeof window.inicializarWasher === 'function' && !window.washerInitialized) {
        console.log('🔧 Inicializando sistema Washer...');
        window.inicializarWasher();
        window.washerInitialized = true; // Evita reinicializar
    }
}

// ✅ Exibe a tela da secadora
function showDryer(event) {
    setLastScreen('dryer');
    hideAllContainers();
    const dryerContainer = document.getElementById('dryer-container');
    if (dryerContainer) {
        dryerContainer.style.display = 'block';
        dryerContainer.style.visibility = 'visible';
    }

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    if (typeof window.inicializarDryer === 'function' && !window.dryerInitialized) {
        console.log('🔧 Inicializando sistema Dryer...');
        window.inicializarDryer();
        window.dryerInitialized = true;
    }
}

// Função para exibir a tela de diagramas
function showDiagram(event) {
    setLastScreen('diagram');
    hideAllContainers();
    const diagramContainer = document.getElementById('diagram-container');
    if (diagramContainer) {
        diagramContainer.style.display = 'block';
        diagramContainer.style.visibility = 'visible';
    }

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    
    // A inicialização agora acontece aqui, se ainda não tiver sido feita.
    // A verificação 'typeof window.inicializarDiagrama' garante que o script já carregou.
    if (typeof window.inicializarDiagrama === 'function' && !window.diagramInitialized) {
        window.inicializarDiagrama();
        window.diagramInitialized = true; // Evita reinicializar
    }
}

// 1. Adicione esta função ao seu main.js
function showWindows(event) {
    setLastScreen('windows');
    hideAllContainers();
    const windowsContainer = document.getElementById('windows-container');
    if (windowsContainer) {
        windowsContainer.style.display = 'flex';
        windowsContainer.style.visibility = 'visible';
    }

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    
    // Inicializa / reconfigura sempre o sistema Windows ao entrar na tela
    if (typeof window.inicializarWindows === 'function') {
        console.log('🎯 (Re)inicializando sistema Windows...');
        window.inicializarWindows();
        window.windowsInitialized = true;
    }
}

// ✅ Exibe a tela de painéis de conexão
function showPanels(event) {
    setLastScreen('panels');
    hideAllContainers();
    const panelsContainer = document.getElementById('panels-container');
    if (panelsContainer) {
        panelsContainer.style.display = 'flex';
        panelsContainer.style.visibility = 'visible';
    }

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    
    loadScript(PANELS_SCRIPT_SRC)
        .then(() => {
            if (typeof window.inicializarPanels === 'function' && !window.panelsInitialized) {
                console.log('Inicializando sistema de Painéis...');
                window.inicializarPanels();
                window.panelsInitialized = true; // Evita reinicializar
            }
        })
        .catch((err) => {
            console.error('[PANELS] Erro ao carregar script de painéis:', err);
        });
}

// Exibe a tela de placas
function showPlates(event) {
    setLastScreen('plates');
    hideAllContainers();
    const platesContainer = document.getElementById('plates-container');
    if (platesContainer) {
        platesContainer.style.display = 'flex';
        platesContainer.style.visibility = 'visible';
    }

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    loadScript(PLATES_SCRIPT_SRC)
        .then(() => {
            if (typeof window.inicializarPlates === 'function' && !window.platesInitialized) {
                console.log('Inicializando tela de Placas...');
                window.inicializarPlates();
                window.platesInitialized = true;
            }
        })
        .catch((err) => {
            console.error('[PLATES] Erro ao carregar script de placas:', err);
        });
}

// Exibe a tela de solenoides
function showSolenoids(event) {
    setLastScreen('solenoids');
    hideAllContainers();
    const solenoidsContainer = document.getElementById('solenoids-container');
    if (solenoidsContainer) {
        solenoidsContainer.style.display = 'flex';
        solenoidsContainer.style.visibility = 'visible';
    }

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    
    loadScript(SOLENOIDS_SCRIPT_SRC)
        .then(() => {
            if (typeof window.inicializarSolenoids === 'function' && !window.solenoidsInitialized) {
                console.log('Inicializando sistema de Solenoides...');
                window.inicializarSolenoids();
                window.solenoidsInitialized = true; // Evita reinicializar
            }
        })
        .catch((err) => {
            console.error('[SOLENOIDS] Erro ao carregar script de solenoides:', err);
        });
}

// ✅ Exibe a tela de sincronismo
function showSynchronism(event) {
    setLastScreen('synchronism');
    hideAllContainers();
    const synchronismContainer = document.getElementById('synchronism-container');
    if (synchronismContainer) {
        synchronismContainer.style.display = 'block';
        synchronismContainer.style.visibility = 'visible';
    }

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    
    // Inicializa o sincronismo (garante script carregado antes)
    loadScript(SYNC_SCRIPT_SRC)
        .then(() => {
            if (typeof window.inicializarSynchronism === 'function' && !window.synchronismInitialized) {
                console.log('🔄 Inicializando sistema de Sincronismo...');
                window.inicializarSynchronism();
                window.synchronismInitialized = true; // Evita reinicializar
            }
        })
        .catch((err) => {
            console.error('[SYNC] Erro ao carregar script de sincronismo:', err);
        });
    
    // ✅ Aplica traduções após mostrar a tela
    applyTranslationsIfAvailable();
}

// ✅ Exibe a tela de informações
function showInformation(event) {
    setLastScreen('information');
    hideAllContainers();
    const informationContainer = document.getElementById('information-container');
    if (informationContainer) {
        informationContainer.style.display = 'block';
        informationContainer.style.visibility = 'visible';
    }

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    
    // Inicializa as informações se ainda não foi inicializado
    if (typeof window.inicializarInformation === 'function' && !window.informationInitialized) {
        console.log('ℹ️ Inicializando sistema de Informações...');
        window.inicializarInformation();
        window.informationInitialized = true; // Evita reinicializar
    }
    
    // ✅ Aplica traduções após mostrar a tela
    applyTranslationsIfAvailable();
}

// Função para exibir a tela do visualizador 3D
function showViewer3D(event) {
    setLastScreen('viewer3d');
    hideAllContainers();
    const viewer3dContainer = document.getElementById('viewer3d-container');
    if (viewer3dContainer) {
        viewer3dContainer.style.display = 'block';
        viewer3dContainer.style.visibility = 'visible';
    }

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    
    // Inicializa o visualizador 3D quando a tela for exibida
    // Usa um pequeno delay para garantir que o DOM está pronto
    loadScript(VIEWER3D_SCRIPT_SRC)
        .then(() => {
            // Usa um pequeno delay para garantir que o DOM está pronto
            setTimeout(() => {
                if (typeof window.initViewer3D === 'function') {
                    console.log('🎯 Inicializando visualizador 3D...');
                    window.initViewer3D();
                    window.viewer3dInitialized = true;
                } else {
                    console.warn('[VIEWER3D] initViewer3D não disponível após carregar script');
                }
            }, 100);
        })
        .catch((err) => {
            console.error('[VIEWER3D] Erro ao carregar script do visualizador 3D:', err);
        });
}

// Função para exibir a tela de amostras
function showSamples(event) {
    setLastScreen('samples');
    hideAllContainers();
    const samplesContainer = document.getElementById('samples-container');
    if (samplesContainer) {
        samplesContainer.style.display = 'block';
        samplesContainer.style.visibility = 'visible';
    }

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    
    // Inicializa a tela de amostras sempre que a tela for exibida
    // Usa um pequeno delay para garantir que o DOM está pronto
    setTimeout(() => {
        if (typeof window.inicializarSamples === 'function') {
            console.log('🔧 Inicializando sistema de Amostras...');
            // Limpa estado anterior se existir
            if (window.cleanupSamples) {
                window.cleanupSamples();
            }
            // Reinicializa
            window.inicializarSamples();
        }
    }, 100);
}


// Carregar os scripts de forma assíncrona
Promise.all([
    loadScript('/static/scripts/partials/menu.js'),
    loadScript('/static/scripts/partials/grid.js'),
    loadScript('/static/scripts/partials/alarm.js'),
    loadScript('/static/scripts/partials/weight_range.js'),
    loadScript('/static/scripts/partials/balance.js'),
    loadScript('/static/scripts/partials/classification.js'),
    loadScript('/static/scripts/partials/login.js'),  // Caminho atualizado para partials
    loadScript('/static/scripts/partials/input.js'),  // Caminho atualizado para partials
    loadScript('/static/scripts/partials/washer.js'), // ✅ Script da lavadora
    loadScript('/static/scripts/partials/dryer.js'), // ✅ Script da secadora
    loadScript('/static/scripts/partials/diagram.js'), 
    loadScript(WINDOWS_SCRIPT_SRC),
    loadScript('/static/scripts/partials/graphics.js'),
    loadScript(VIEWER3D_SCRIPT_SRC),
    loadScript('/static/scripts/partials/samples.js'), // ✅ Script de amostras
    loadScript(PANELS_SCRIPT_SRC),
    loadScript(PLATES_SCRIPT_SRC),
    loadScript(SOLENOIDS_SCRIPT_SRC),
    loadScript(SYNC_SCRIPT_SRC),
    loadScript('/static/scripts/partials/information.js')

])
.then(() => {
    console.log('Todos os scripts carregados com sucesso!');

    // Restaura usuário salvo (mantém menu técnico após F5 até logoff)
    try {
        if (typeof loadUserFromStorage === 'function') {
            loadUserFromStorage();
        }
        if (typeof updateUserDisplay === 'function') {
            updateUserDisplay();
        }
    } catch (e) {
        console.warn('Falha ao restaurar usuário salvo:', e);
    }
    
    // Inicializa o grid somente se estiver visível
    const gridContainer = document.getElementById('grid-container');
    const gridVisible = gridContainer && gridContainer.style.display !== 'none';
    if (gridVisible && typeof inicializarVelocimetro === 'function') {
        inicializarVelocimetro();
    } else if (gridVisible) {
        console.warn('Função inicializarVelocimetro não encontrada!');
    }
    
    // ✅ CRÍTICO - CORREÇÃO DE VAZAMENTO DE MEMÓRIA:
    // NÃO inicializa telas automaticamente ao carregar a página!
    // Cada tela será inicializada apenas quando o usuário abri-la.
    // Isso evita que múltiplos intervalos sejam criados desnecessariamente.
    
    // REMOVIDO: inicializarAlarmes() - será chamado apenas quando showAlarm() for executado
    // REMOVIDO: inicializarWeightRange() - será chamado apenas quando showWeightRange() for executado
    // REMOVIDO: inicializarBalance() - será chamado apenas quando showBalance() for executado
    // REMOVIDO: inicializarClassification() - será chamado apenas quando showClassification() for executado
    // REMOVIDO: inicializarInput() - será chamado apenas quando showInput() for executado
    
    // ✅ Se a tela atual for lavadora/secadora (ex: F5), inicializa após scripts carregarem
    try {
        let lastScreen = null;
        try {
            lastScreen = localStorage.getItem(LAST_SCREEN_KEY);
        } catch (_) {}

        const washerVisible = document.getElementById('washer-container')?.style.display !== 'none';
        if ((lastScreen === 'washer' || washerVisible) && typeof window.inicializarWasher === 'function' && !window.washerInitialized) {
            console.log('[MAIN] 🔧 Inicializando lavadora pós-carregamento...');
            window.inicializarWasher();
            window.washerInitialized = true;
        }

        const dryerVisible = document.getElementById('dryer-container')?.style.display !== 'none';
        if ((lastScreen === 'dryer' || dryerVisible) && typeof window.inicializarDryer === 'function' && !window.dryerInitialized) {
            console.log('[MAIN] 🔧 Inicializando secadora pós-carregamento...');
            window.inicializarDryer();
            window.dryerInitialized = true;
        }

        const diagramVisible = document.getElementById('diagram-container')?.style.display !== 'none';
        if ((lastScreen === 'diagram' || diagramVisible) && typeof window.inicializarDiagrama === 'function' && !window.diagramInitialized) {
            console.log('[MAIN] 🔧 Inicializando diagramas pós-carregamento...');
            window.inicializarDiagrama();
            window.diagramInitialized = true;
        }

        const windowsVisible = document.getElementById('windows-container')?.style.display !== 'none';
        if ((lastScreen === 'windows' || windowsVisible) && typeof window.inicializarWindows === 'function' && !window.windowsInitialized) {
            console.log('[MAIN] Inicializando janelas pos-carregamento...');
            try {
                if (typeof window.cleanupWindows === 'function') {
                    window.cleanupWindows();
                }
            } catch (_) {}
            window.inicializarWindows();
            window.windowsInitialized = true;
        }


        const balanceVisible = document.getElementById('balance-container')?.style.display !== 'none';
        if ((lastScreen === 'balance' || balanceVisible) && typeof window.inicializarBalance === 'function') {
            console.log('[MAIN] 🔧 Inicializando balan�a pós-carregamento...');
            window.inicializarBalance();
        }

        const classificationVisible = document.getElementById('classification-container')?.style.display !== 'none';
        if ((lastScreen === 'classification' || classificationVisible) && typeof window.inicializarClassification === 'function') {
            console.log('[MAIN] 🔧 Inicializando classificação pós-carregamento...');
            try {
                if (typeof window.cleanupClassification === 'function') {
                    window.cleanupClassification();
                }
            } catch (_) {}
            window.inicializarClassification();
            window._classificationInitialized = true;
        }

        const samplesVisible = document.getElementById('samples-container')?.style.display !== 'none';
        if ((lastScreen === 'samples' || samplesVisible) && typeof window.inicializarSamples === 'function') {
            console.log('[MAIN] 🔧 Inicializando amostras pós-carregamento...');
            try {
                if (typeof window.cleanupSamples === 'function') {
                    window.cleanupSamples();
                }
            } catch (_) {}
            window.inicializarSamples();
            window._samplesInitialized = true;
        }

        const alarmVisible = document.getElementById('alarm-container')?.style.display !== 'none';
        if ((lastScreen === 'alarm' || alarmVisible) && typeof window.showAlarm === 'function') {
            console.log('[MAIN] 🔧 Inicializando alarmes pós-carregamento...');
            window.showAlarm();
        }
    } catch (e) {
        console.warn('[MAIN] ⚠️ Falha ao inicializar lavadora/secadora/diagramas/balança/classificação/amostras/alarmes pós-carregamento:', e);
    }

    console.log('[MAIN] ✅ Scripts carregados - telas serão inicializadas sob demanda');

})
.catch(error => console.error('Erro ao carregar scripts:', error));


document.addEventListener('DOMContentLoaded', function() {
    // Detecta se é um recarregamento (F5) ou uma navegação inicial/aba nova
    let isReload = false;
    try {
        if (performance && typeof performance.getEntriesByType === 'function') {
            const navEntries = performance.getEntriesByType('navigation');
            if (navEntries && navEntries[0]) {
                isReload = navEntries[0].type === 'reload';
            }
        } else if (performance && performance.navigation) {
            // API antiga (fallback)
            isReload = performance.navigation.type === 1; // 1 = reload
        }
    } catch (e) {
        console.warn('Não foi possível determinar o tipo de navegação:', e);
    }

    // Mapa de telas
    const screenMap = {
        grid: showGrid,
        alarm: showAlarm,
        graphics: showGraphics,
        weight: showWeightRange,
        balance: showBalance,
        classification: showClassification,
        input: showInput,
        washer: showWasher,
        dryer: showDryer,
        diagram: showDiagram,
        windows: showWindows,
        viewer3d: showViewer3D,
        samples: showSamples,
        panels: showPanels,
        plates: showPlates,
        solenoids: showSolenoids,
        synchronism: showSynchronism,
        information: showInformation
    };

    // Regra:
    // - Primeira carga / navegação normal: sempre abre na tela inicial (grid)
    // - Recarregamento (F5): tenta voltar para a última tela salva
    if (!isReload) {
        // Primeira vez após iniciar servidor ou abrir nova aba → sempre grid
        showGrid();
    } else {
        let lastScreen = null;
        try {
            lastScreen = localStorage.getItem(LAST_SCREEN_KEY);
        } catch (e) {
            console.warn('Não foi possível ler última tela do localStorage:', e);
        }
        const fn = screenMap[lastScreen] || showGrid;
        fn();
    }
});
// Exporta funções para o escopo global
window.showGrid = showGrid;
window.showAlarm = showAlarm;
window.showWeightRange = showWeightRange;
window.showBalance = showBalance;
window.showClassification = showClassification;
window.showInput = showInput;
window.showWasher = showWasher; // ✅ Exportação global da função da lavadora
window.showDryer = showDryer;   // ✅ Exportação global da função da secadora
window.showDiagram = showDiagram;
window.showWindows = showWindows;
window.showViewer3D = showViewer3D; // ✅ Exportação global da função do visualizador 3D
window.showSamples = showSamples; // ✅ Exportação global da função de amostras
window.showPanels = showPanels; // ✅ Exportação global da função de painéis
window.showPlates = showPlates; // ✅ Exportação global da função de placas
window.showSolenoids = showSolenoids; // ✅ Exportação global da função de solenoides
window.showSynchronism = showSynchronism; // ✅ Exportação global da função de sincronismo
window.showInformation = showInformation; // ✅ Exportação global da função de informações
