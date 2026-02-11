// windows.js - Modal Centralizado e Controle de Um Por Vez

// ============================================
// GERENCIAMENTO DE EVENT LISTENERS
// ============================================
let windowsEventListeners = [];
let windowsEscHandler = null; // Handler especial para ESC no document
let windowsGridButtonSize = 140;
let windowsGridGap = 24;
let windowsGridPadding = 30;
let windowsGridResizeTimer = null;

// ============================================
// FILTRO DINÂMICO DE EMBALADORAS (E01-E24)
// ============================================
const EMBALADORA_QUANTITY_KEY = 'supervisor_embaladora_quantity';

// Botões que sempre ficam visíveis (não são embaladoras)
const FIXED_WINDOWS_STATIONS = [
    'magna-visio',
    'grieta',
    'peso',
    'cint-corr-ind',
    'captura-final'
];

/**
 * Filtra os botões de embaladoras baseado na quantidade definida nos parâmetros
 */
function filterEmbaladoraButtons() {
    const savedQuantity = localStorage.getItem(EMBALADORA_QUANTITY_KEY);
    const quantity = parseInt(savedQuantity) || 24; // Padrão: 24
    
    console.log(`[WINDOWS] Filtrando embaladoras - Quantidade: ${quantity}`);
    
    const allButtons = document.querySelectorAll('#windows-container .capture-btn, .capture-btn');
    const visibleStations = [];
    
    allButtons.forEach(button => {
        const station = button.dataset.station;
        const isGridWrapper = button.classList.contains('capture-grid') || station === 'grid';

        // Mantem o container do grid sempre visivel
        if (isGridWrapper) {
            button.style.removeProperty('display');
            return;
        }
        
        // Se for botão fixo, sempre mostra
        if (FIXED_WINDOWS_STATIONS.includes(station)) {
            button.style.removeProperty('display');
            if (station) {
                visibleStations.push(station);
            }
            return;
        }
        
        // Se for botão de embaladora (e01-e24), verifica a quantidade
        const embaladoraMatch = station && station.match(/^e(\d{2})$/);
        if (embaladoraMatch) {
            const embaladoraNumber = parseInt(embaladoraMatch[1]);
            if (embaladoraNumber <= quantity) {
                button.style.removeProperty('display');
                if (station) {
                    visibleStations.push(station);
                }
            } else {
                button.style.setProperty('display', 'none', 'important');
            }
        }
    });

    // Atualiza total de estações e remove conclusões de botões ocultos
    if (typeof captureState !== 'undefined' && captureState) {
        captureState.totalStations = visibleStations.length;
        if (captureState.completedStations && captureState.completedStations.size) {
            const allowed = new Set(visibleStations);
            captureState.completedStations.forEach((station) => {
                if (!allowed.has(station)) {
                    captureState.completedStations.delete(station);
                }
            });
        }
        if (typeof updateProgressBar === 'function') {
            updateProgressBar();
        }
    }
    
    // Recalcula o layout do grid após filtrar
    setTimeout(() => {
        forceGridLayout();
        // Mostra o grid após aplicar o filtro/layout para evitar flash
        setWindowsGridHidden(false);
    }, 50);
}

/**
 * Listener para mudanças na quantidade de embaladoras
 */
function setupEmbaladoraQuantityListener() {
    // Escuta evento customizado de mudança de quantidade
    const quantityChangeHandler = (event) => {
        console.log('[WINDOWS] Evento embaladoraQuantityChanged recebido:', event.detail);
        filterEmbaladoraButtons();
    };
    
    document.addEventListener('embaladoraQuantityChanged', quantityChangeHandler);
    windowsEventListeners.push({ 
        element: document, 
        event: 'embaladoraQuantityChanged', 
        handler: quantityChangeHandler 
    });
    
    // Também escuta mudanças no localStorage (para sincronização entre abas)
    const storageHandler = (event) => {
        if (event.key === EMBALADORA_QUANTITY_KEY) {
            console.log('[WINDOWS] localStorage embaladora quantity changed:', event.newValue);
            filterEmbaladoraButtons();
        }
    };
    
    window.addEventListener('storage', storageHandler);
    windowsEventListeners.push({ 
        element: window, 
        event: 'storage', 
        handler: storageHandler 
    });
}

function registerWindowsEventListener(element, event, handler) {
    if (element) {
        element.addEventListener(event, handler);
        windowsEventListeners.push({ element, event, handler });
    }
}

// Função de cleanup
function cleanupWindows() {
    console.log('[WINDOWS] 🧹 Iniciando cleanup...');
    
    // Remove todos os event listeners registrados
    windowsEventListeners.forEach(({ element, event, handler }) => {
        if (element) {
            element.removeEventListener(event, handler);
        }
    });
    windowsEventListeners = [];
    
    // Remove o handler ESC do document
    if (windowsEscHandler) {
        document.removeEventListener('keydown', windowsEscHandler);
        windowsEscHandler = null;
    }

    if (windowsGridResizeTimer) {
        clearTimeout(windowsGridResizeTimer);
        windowsGridResizeTimer = null;
    }
    
    console.log('[WINDOWS] ✅ Cleanup concluído');
}

window.cleanupWindows = cleanupWindows;

// Estado global do sistema de captura
let captureState = {
    completedStations: new Set(),
    currentStation: null,
    totalStations: 28,
    modal: {
        isOpen: false,
        currentStation: null,
        element: null,
        overlay: null
    }
};

// Mapeamento de estações para os pinos da barra de status
const stationToPinMap = {
    'magna-visio': 'cinta',
    'grieta': 'peso', 
    'peso': 'peso',
    'cint-corr-ind': 'cinta2',
    'e01': 'e01',
    'e02': 'cinta',
    'e03': 'peso',
    'e04': 'cinta2',
    'e05': 'e01',
    'e06': 'cinta'
};

function setWindowsGridHidden(hidden) {
    const captureGrid = document.querySelector('#windows-container .capture-grid');
    if (!captureGrid) {
        return;
    }
    if (hidden) {
        captureGrid.classList.add('grid-hidden');
    } else {
        captureGrid.classList.remove('grid-hidden');
    }
}

function inicializarWindows() {
    console.log("🚀 Sistema de Windows/Captura Inicializado - Modal Centralizado");
    
    // CRÍTICO: Limpa listeners anteriores para evitar duplicação
    cleanupWindows();
    
    // Aguarda um pouco para garantir que o DOM está pronto
    setTimeout(() => {
        setWindowsGridHidden(true);
        // Filtra embaladoras baseado na quantidade configurada
        filterEmbaladoraButtons();
        
        // Configura listener para mudanças na quantidade de embaladoras
        setupEmbaladoraQuantityListener();
        
        // Força aplicação do layout de grid
        forceGridLayout();
        setupGridResizeHandler();
        
        // Configura os botões de captura
        setupCaptureButtons();
        
        // Configura o modal
        setupModal();
        
        // Inicializa a barra de status
        initializeStatusBar();
        
        // Força visibilidade da barra de status
        forceStatusBarVisibility();
        
        console.log("✅ Windows configurado com sucesso!");
    }, 200);
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function calculateGridLayout(captureGrid, buttonCount) {
    const fallback = {
        columns: 0,
        size: 140,
        gap: 24,
        padding: 30,
        template: 'repeat(auto-fit, minmax(120px, 1fr))',
        autoRows: 'auto',
        alignContent: 'start'
    };

    if (!captureGrid || !buttonCount) {
        return fallback;
    }

    const width = captureGrid.clientWidth;
    const height = captureGrid.clientHeight;

    if (!width || !height) {
        return fallback;
    }

    const config = {
        minSize: 110,
        maxSize: 190,
        minGap: 12,
        maxGap: 26,
        padding: 24
    };

    const innerWidth = Math.max(0, width - config.padding * 2);
    const innerHeight = Math.max(0, height - config.padding * 2);

    if (innerWidth <= 0 || innerHeight <= 0) {
        return fallback;
    }

    const maxColumns = Math.max(
        1,
        Math.min(
            buttonCount,
            Math.floor((innerWidth + config.minGap) / (config.minSize + config.minGap))
        )
    );

    let best = null;

    for (let columns = maxColumns; columns >= 1; columns--) {
        const rows = Math.ceil(buttonCount / columns);
        const gap = clamp(Math.round((innerWidth / columns) * 0.1), config.minGap, config.maxGap);
        const sizeByWidth = (innerWidth - gap * (columns - 1)) / columns;
        const sizeByHeight = (innerHeight - gap * (rows - 1)) / rows;
        const size = Math.min(sizeByWidth, sizeByHeight);

        if (size < config.minSize) {
            continue;
        }

        const finalSize = Math.min(config.maxSize, Math.floor(size));

        if (!best || finalSize > best.size) {
            best = { columns, rows, size: finalSize, gap, padding: config.padding };
        }
    }

    if (!best) {
        return fallback;
    }

    return {
        columns: best.columns,
        size: best.size,
        gap: best.gap,
        padding: best.padding,
        template: `repeat(${best.columns}, ${best.size}px)`,
        autoRows: `${best.size}px`,
        alignContent: 'space-evenly'
    };
}

function setupGridResizeHandler() {
    const resizeHandler = () => {
        if (windowsGridResizeTimer) {
            clearTimeout(windowsGridResizeTimer);
        }

        windowsGridResizeTimer = setTimeout(() => {
            windowsGridResizeTimer = null;
            forceGridLayout();
        }, 120);
    };

    registerWindowsEventListener(window, "resize", resizeHandler);
}

function forceGridLayout() {
    console.log("[WINDOWS] Forcando layout de grid...");
    
    // Forca o grid no container principal
    const captureGrid = document.querySelector('#windows-container .capture-grid') || 
                       document.querySelector('.capture-grid');
    // Conta apenas os botões visíveis para calcular o layout
    const allButtons = document.querySelectorAll('#windows-container .capture-btn, .capture-btn');
    const buttons = Array.from(allButtons).filter(btn => btn.style.display !== 'none');
    
    if (captureGrid) {
        const layout = calculateGridLayout(captureGrid, buttons.length);
        windowsGridButtonSize = layout.size;
        windowsGridGap = layout.gap;
        windowsGridPadding = layout.padding;

        // Aplica estilos de grid diretamente
        captureGrid.style.setProperty('display', 'grid', 'important');
        captureGrid.style.setProperty('grid-template-columns', layout.template, 'important');
        captureGrid.style.setProperty('grid-auto-rows', layout.autoRows, 'important');
        captureGrid.style.setProperty('gap', `${layout.gap}px`, 'important');
        captureGrid.style.setProperty('justify-items', 'stretch', 'important');
        captureGrid.style.setProperty('align-items', 'stretch', 'important');
        captureGrid.style.setProperty('justify-content', 'space-evenly', 'important');
        captureGrid.style.setProperty('align-content', layout.alignContent, 'important');
        captureGrid.style.setProperty('padding', `${layout.padding}px`, 'important');
        captureGrid.style.setProperty('height', '100%', 'important');
        captureGrid.style.setProperty('box-sizing', 'border-box', 'important');
        const rootStyles = getComputedStyle(document.documentElement);
        const surface = rootStyles.getPropertyValue('--surface').trim() || 'white';
        const shadowLg = rootStyles.getPropertyValue('--shadow-lg').trim() || '0 6px 20px rgba(0,0,0,0.15)';
        const borderSubtle = rootStyles.getPropertyValue('--border-subtle').trim() || 'rgba(255,255,255,0.2)';

        captureGrid.style.setProperty('background', surface, 'important');
        captureGrid.style.setProperty('border', `1px solid ${borderSubtle}`, 'important');
        captureGrid.style.setProperty('border-radius', '16px', 'important');
        captureGrid.style.setProperty('box-shadow', shadowLg, 'important');
        
        console.log("[WINDOWS] Grid aplicado ao container principal");
    }
    
    // Remove display das linhas (capture-row)
    const captureRows = document.querySelectorAll('#windows-container .capture-row, .capture-row');
    captureRows.forEach(row => {
        row.style.display = 'contents';
    });
    
    // Aplica estilos base em cada botao
    buttons.forEach(button => {
        button.style.setProperty('grid-column', 'auto', 'important');
        button.style.setProperty('grid-row', 'auto', 'important');
        applyButtonStyles(button, windowsGridButtonSize);
    });
    
    console.log("[WINDOWS] Layout de grid forcado aplicado com sucesso!");
}

function applyButtonStyles(button, sizeOverride) {
    const size = sizeOverride || windowsGridButtonSize || 140;
    const fontSize = Math.max(12, Math.min(16, Math.round(size * 0.11)));

    button.style.setProperty('width', `${size}px`, 'important');
    button.style.setProperty('height', `${size}px`, 'important');
    button.style.setProperty('min-width', `${size}px`, 'important');
    button.style.setProperty('min-height', `${size}px`, 'important');
    button.style.setProperty('max-width', `${size}px`, 'important');
    button.style.setProperty('max-height', `${size}px`, 'important');
    // Só aplica display flex se o botão não estiver oculto
    if (button.style.display !== 'none') {
        button.style.display = 'flex';
    }
    button.style.flexDirection = 'column';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.gap = '8px';
    button.style.borderRadius = '16px';
    button.style.border = 'none';
    button.style.cursor = 'pointer';
    button.style.transition = 'all 0.3s ease';
    button.style.boxShadow = '0 6px 16px rgba(0,0,0,0.25)';
    button.style.position = 'relative';
    button.style.overflow = 'hidden';
    button.style.fontFamily = 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
    button.style.fontSize = `${fontSize}px`;
    button.style.fontWeight = '600';
    button.style.textAlign = 'center';
    button.style.lineHeight = '1.3';
    button.style.padding = '10px';
    button.style.margin = '0';
    
    // Aplica cores baseadas nas classes
    if (button.classList.contains('active')) {
        button.style.backgroundColor = '#ff8c00';
        button.style.color = 'white';
    } else if (button.classList.contains('special')) {
        button.style.backgroundColor = '#343a40';
        button.style.color = 'white';
    } else if (button.classList.contains('completed')) {
        button.style.backgroundColor = '#28a745';
        button.style.color = 'white';
    } else {
        button.style.backgroundColor = '#495057';
        button.style.color = 'white';
    }
}

function forceStatusBarVisibility() {
    console.log("📊 Forçando visibilidade da barra de status...");
    
    const statusBar = document.querySelector('#windows-container .status-bar') || 
                     document.querySelector('.status-bar');
    
    if (statusBar) {
        statusBar.style.display = 'flex';
        statusBar.style.visibility = 'visible';
        statusBar.style.opacity = '1';
        statusBar.style.position = 'relative';
        statusBar.style.zIndex = '10';
        statusBar.style.background = 'linear-gradient(135deg, #343a40 0%, #495057 100%)';
        statusBar.style.borderRadius = '12px';
        statusBar.style.padding = '20px 30px';
        statusBar.style.alignItems = 'center';
        statusBar.style.justifyContent = 'space-between';
        statusBar.style.boxShadow = '0 6px 20px rgba(0,0,0,0.25)';
        statusBar.style.marginBottom = '25px';
        statusBar.style.minHeight = '80px';
        
        console.log("✅ Barra de status forçada a ser visível");
    }
    
    // Força visibilidade dos elementos da barra de status
    const statusElements = document.querySelectorAll(
        '#windows-container .status-section, .status-section, ' +
        '#windows-container .status-label, .status-label, ' +
        '#windows-container .status-pin, .status-pin, ' +
        '#windows-container .progress-bar, .progress-bar, ' +
        '#windows-container .pin-indicators, .pin-indicators'
    );
    
    statusElements.forEach(element => {
        element.style.display = element.classList.contains('pin-indicators') ? 'flex' : 
                               element.classList.contains('status-section') ? 'flex' : 'block';
        element.style.visibility = 'visible';
        element.style.opacity = '1';
    });
}

function setupCaptureButtons() {
    const captureButtons = document.querySelectorAll("#windows-container .capture-btn, .capture-btn");
    
    if (captureButtons.length === 0) {
        console.error("❌ Nenhum botão de captura encontrado!");
        return;
    }
    
    captureButtons.forEach(button => {
        // Registra novo listener - USANDO FUNÇÃO DE REGISTRO
        registerWindowsEventListener(button, "click", handleButtonClick);
        
        // Adiciona efeitos hover
        const mouseEnterHandler = function() {
            if (!this.classList.contains('processing')) {
                this.style.transform = "translateY(-3px) scale(1.02)";
                this.style.boxShadow = "0 10px 25px rgba(0,0,0,0.35)";
            }
        };
        registerWindowsEventListener(button, "mouseenter", mouseEnterHandler.bind(button));
        
        const mouseLeaveHandler = function() {
            if (!this.classList.contains('processing')) {
                this.style.transform = "translateY(0) scale(1)";
                this.style.boxShadow = "0 6px 16px rgba(0,0,0,0.25)";
            }
        };
        registerWindowsEventListener(button, "mouseleave", mouseLeaveHandler.bind(button));
    });
    
    console.log(`📋 Configurados ${captureButtons.length} botões de captura`);
}

function handleButtonClick(event) {
    event.preventDefault();
    event.stopPropagation();
    
    // Impede abertura de múltiplos modais
    if (captureState.modal.isOpen) {
        console.log("⚠️ Modal já está aberto, ignorando clique");
        return;
    }
    
    const station = this.dataset.station;
    
    if (station === "captura-final") {
        handleCapturaFinal();
    } else {
        const labelElement = this.querySelector(".capture-label");
        const stationName = labelElement ? labelElement.textContent : station;
        openCaptureModal(station, stationName);
    }
}

function setupModal() {
    const modal = document.getElementById("capture-modal");
    const overlay = document.getElementById("modal-overlay");
    const closeBtn = document.getElementById("modal-close");
    const capturaInicialBtn = document.getElementById("btn-captura-inicial");
    const capturaFinalBtn = document.getElementById("btn-captura-final");
    const buscaOffsetBtn = document.getElementById("btn-busca-offset");
    
    if (!modal || !overlay) {
        console.error("❌ Elementos do modal não encontrados!");
        return;
    }
    
    // Armazena referências no estado
    captureState.modal.element = modal;
    captureState.modal.overlay = overlay;
    
    // Força estilos do modal para garantir centralização
    modal.style.position = 'fixed';
    modal.style.top = '50%';
    modal.style.left = '50%';
    modal.style.transform = 'translate(-50%, -50%) scale(0.9)';
    modal.style.zIndex = '10000';
    modal.style.display = 'none';
    modal.style.opacity = '0';
    
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'none';
    overlay.style.opacity = '0';
    overlay.style.background = 'rgba(0, 0, 0, 0.7)';
    overlay.style.backdropFilter = 'blur(3px)';
    
    // Fechar modal - USANDO FUNÇÃO DE REGISTRO
    [closeBtn, overlay].forEach(element => {
        if (element) {
            registerWindowsEventListener(element, "click", closeModal);
        }
    });
    
    // Ações do modal - USANDO FUNÇÃO DE REGISTRO
    if (capturaInicialBtn) {
        const inicialHandler = () => executeCaptureAction("inicial");
        registerWindowsEventListener(capturaInicialBtn, "click", inicialHandler);
    }
    
    if (capturaFinalBtn) {
        const finalHandler = () => executeCaptureAction("final");
        registerWindowsEventListener(capturaFinalBtn, "click", finalHandler);
    }
    
    if (buscaOffsetBtn) {
        const offsetHandler = () => executeCaptureAction("offset");
        registerWindowsEventListener(buscaOffsetBtn, "click", offsetHandler);
    }
    
    // Fechar modal com ESC - ARMAZENA REFERÊNCIA PARA CLEANUP
    windowsEscHandler = (e) => {
        if (e.key === "Escape" && captureState.modal.isOpen) {
            closeModal();
        }
    };
    document.addEventListener("keydown", windowsEscHandler);
    
    console.log("🎭 Modal configurado com centralização forçada");
}

function openCaptureModal(station, stationName) {
    // Impede abertura de múltiplos modais
    if (captureState.modal.isOpen) {
        console.log("⚠️ Modal já está aberto");
        return;
    }
    
    const modal = captureState.modal.element || document.getElementById("capture-modal");
    const overlay = captureState.modal.overlay || document.getElementById("modal-overlay");
    const title = document.getElementById("modal-title");
    
    if (!modal || !overlay) {
        console.error("❌ Elementos do modal não encontrados!");
        return;
    }
    
    captureState.modal.isOpen = true;
    captureState.modal.currentStation = station;
    
    if (title) {
        title.textContent = stationName;
    }
    
    // Força estilos de centralização
    modal.style.position = 'fixed';
    modal.style.top = '50%';
    modal.style.left = '50%';
    modal.style.transform = 'translate(-50%, -50%) scale(0.9)';
    modal.style.zIndex = '10000';
    modal.style.display = 'block';
    modal.style.opacity = '0';
    
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'block';
    overlay.style.opacity = '0';
    
    // Adiciona classes para animação
    modal.classList.add('show');
    overlay.classList.add('show');
    
    // Animação de entrada
    setTimeout(() => {
        overlay.style.opacity = "1";
        modal.style.opacity = "1";
        modal.style.transform = "translate(-50%, -50%) scale(1)";
    }, 10);
    
    console.log(`🎯 Modal aberto e centralizado para estação: ${station} (${stationName})`);
}

function closeModal() {
    const modal = captureState.modal.element || document.getElementById("capture-modal");
    const overlay = captureState.modal.overlay || document.getElementById("modal-overlay");
    
    if (!modal || !overlay) return;
    
    captureState.modal.isOpen = false;
    captureState.modal.currentStation = null;
    
    // Animação de fechamento
    overlay.style.opacity = "0";
    modal.style.opacity = "0";
    modal.style.transform = "translate(-50%, -50%) scale(0.9)";
    
    // Remove classes
    modal.classList.remove('show');
    overlay.classList.remove('show');
    
    setTimeout(() => {
        overlay.style.display = "none";
        modal.style.display = "none";
    }, 300);
    
    console.log("❌ Modal fechado");
}

function executeCaptureAction(action) {
    const station = captureState.modal.currentStation;
    
    if (!station) {
        console.error("❌ Nenhuma estação selecionada");
        return;
    }
    
    console.log(`🎬 Executando ${action} para estação: ${station}`);
    
    // Simula o processo de captura
    const button = document.querySelector(`#windows-container [data-station="${station}"]`) ||
                  document.querySelector(`[data-station="${station}"]`);
    if (button) {
        button.classList.add("processing");
    }
    
    // Simula delay de processamento
    setTimeout(() => {
        if (action === "final") {
            markStationCompleted(station);
        }
        
        if (button) {
            button.classList.remove("processing");
        }
        
        closeModal();
        showCaptureNotification(action, station);
        
    }, 1500);
}

function markStationCompleted(station) {
    captureState.completedStations.add(station);
    
    // Atualiza o botão visual
    const button = document.querySelector(`#windows-container [data-station="${station}"]`) ||
                  document.querySelector(`[data-station="${station}"]`);
    if (button) {
        button.classList.add("completed");
        button.style.backgroundColor = '#28a745';
        button.style.color = 'white';
    }
    
    // Atualiza a barra de status se esta estação tem um pino correspondente
    if (stationToPinMap[station]) {
        updateStatusPin(stationToPinMap[station]);
    }
    
    // Atualiza a barra de progresso
    updateProgressBar();
    
    console.log(`✅ Estação ${station} marcada como completa`);
}

function updateStatusPin(pinId) {
    const pin = document.getElementById(`pin-${pinId}`);
    const indicator = document.getElementById(`indicator-${pinId}`);
    
    if (pin) {
        pin.classList.add("completed");
        pin.style.background = '#28a745';
        pin.style.borderColor = '#1e7e34';
        pin.style.boxShadow = '0 0 15px rgba(40, 167, 69, 0.8)';
        pin.style.transform = 'scale(1.1)';
    }
    
    if (indicator) {
        indicator.classList.add("completed");
        indicator.style.background = '#ffffff';
        indicator.style.boxShadow = '0 0 12px rgba(255, 255, 255, 0.9)';
        indicator.style.transform = 'scale(1.15)';
        indicator.style.borderColor = '#ffffff';
    }
    
    console.log(`📍 Pino ${pinId} atualizado visualmente`);
}

function updateProgressBar() {
    const progressLeft = document.getElementById("loading-progress-left");
    const progressRight = document.getElementById("loading-progress-right");
    const completedCount = captureState.completedStations.size;
    const progressPercentage = (completedCount / captureState.totalStations) * 100;
    
    if (progressLeft && progressRight) {
        const halfWidth = Math.max(0, Math.min(50, progressPercentage / 2));
        progressLeft.style.width = `${halfWidth}%`;
        progressRight.style.width = `${halfWidth}%`;
        progressLeft.style.background = '#dc3545';
        progressRight.style.background = '#dc3545';
    }
    
    console.log(`📊 Progresso: ${completedCount}/${captureState.totalStations} (${progressPercentage.toFixed(1)}%)`);
}

function initializeStatusBar() {
    // Força visibilidade da barra de status
    forceStatusBarVisibility();
    
    // Inicializa a barra de progresso
    updateProgressBar();
    
    // Garante que os pinos estejam no estado inicial
    const pins = document.querySelectorAll("#windows-container .status-pin, #windows-container .pin-indicator, .status-pin, .pin-indicator");
    pins.forEach(pin => {
        pin.classList.remove("completed");
        if (pin.classList.contains('status-pin')) {
            pin.style.background = '#6c757d';
            pin.style.borderColor = '#495057';
            pin.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
            pin.style.transform = 'scale(1)';
        } else if (pin.classList.contains('pin-indicator')) {
            pin.style.background = '#adb5bd';
            pin.style.borderColor = '#343a40';
            pin.style.boxShadow = '0 3px 8px rgba(0,0,0,0.3)';
            pin.style.transform = 'scale(1)';
        }
    });
    
    console.log("📊 Barra de status inicializada e visível");
}

function handleCapturaFinal() {
    console.log("🏁 Executando Captura Final Global");
    
    const capturaFinalBtn = document.querySelector('#windows-container [data-station="captura-final"]') ||
                           document.querySelector('[data-station="captura-final"]');
    if (capturaFinalBtn) {
        capturaFinalBtn.classList.add("processing");
    }
    
    setTimeout(() => {
        const allStations = ["magna-visio", "grieta", "peso", "cint-corr-ind"];
        for (let i = 1; i <= 24; i++) {
            allStations.push(`e${i.toString().padStart(2, '0')}`);
        }
        
        allStations.forEach(station => {
            if (!captureState.completedStations.has(station)) {
                markStationCompleted(station);
            }
        });
        
        if (capturaFinalBtn) {
            capturaFinalBtn.classList.remove("processing");
            capturaFinalBtn.classList.add("completed");
            capturaFinalBtn.style.backgroundColor = '#28a745';
        }
        
        // Atualiza todos os pinos da barra de status
        Object.values(stationToPinMap).forEach(pinId => {
            updateStatusPin(pinId);
        });
        
        showCaptureNotification("final-global", "todas as estações");
        
    }, 3000);
}

function showCaptureNotification(action, station) {
    const notification = document.createElement("div");
    notification.className = "capture-notification";
    
    const actionText = {
        "inicial": "Captura Inicial",
        "final": "Captura Final",
        "offset": "Busca de Offset",
        "final-global": "Captura Final Global"
    };
    
    notification.textContent = `${actionText[action]} - ${station} ✓`;
    
    // Força estilos da notificação
    notification.style.position = 'fixed';
    notification.style.top = '30px';
    notification.style.right = '30px';
    notification.style.background = 'linear-gradient(135deg, #28a745 0%, #1e7e34 100%)';
    notification.style.color = 'white';
    notification.style.padding = '18px 30px';
    notification.style.borderRadius = '12px';
    notification.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)';
    notification.style.zIndex = '10001';
    notification.style.fontWeight = '700';
    notification.style.fontSize = '15px';
    notification.style.transform = 'translateX(120%)';
    notification.style.transition = 'transform 0.4s ease-out, opacity 0.4s ease-out';
    notification.style.opacity = '0';
    notification.style.border = '2px solid rgba(255,255,255,0.2)';
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.transform = 'translateX(0%)';
        notification.style.opacity = '1';
    }, 100);
    
    setTimeout(() => {
        notification.style.transform = 'translateX(120%)';
        notification.style.opacity = '0';
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 400);
    }, 3000);
}

function resetCaptureSystem() {
    captureState.completedStations.clear();
    
    const buttons = document.querySelectorAll("#windows-container .capture-btn, .capture-btn");
    buttons.forEach(btn => {
        btn.classList.remove("completed", "processing");
        applyButtonStyles(btn);
    });
    
    const pins = document.querySelectorAll("#windows-container .status-pin, #windows-container .pin-indicator, .status-pin, .pin-indicator");
    pins.forEach(pin => {
        pin.classList.remove("completed");
    });
    
    updateProgressBar();
    initializeStatusBar();
    
    // Reaplica o layout de grid após reset
    setTimeout(() => {
        forceGridLayout();
        forceStatusBarVisibility();
    }, 100);
    
    console.log("🔄 Sistema de captura resetado");
}

// Exporta as funções para o escopo global
window.inicializarWindows = inicializarWindows;
window.resetCaptureSystem = resetCaptureSystem;
window.forceGridLayout = forceGridLayout;
window.forceStatusBarVisibility = forceStatusBarVisibility;
window.filterEmbaladoraButtons = filterEmbaladoraButtons;

