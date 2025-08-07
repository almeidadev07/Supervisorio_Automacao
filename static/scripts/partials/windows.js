// windows.js - Modal Centralizado e Controle de Um Por Vez

// Estado global do sistema de captura
let captureState = {
    completedStations: new Set(),
    currentStation: null,
    totalStations: 11,
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

function inicializarWindows() {
    console.log("🚀 Sistema de Windows/Captura Inicializado - Modal Centralizado");
    
    // Aguarda um pouco para garantir que o DOM está pronto
    setTimeout(() => {
        // Força aplicação do layout de grid
        forceGridLayout();
        
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

function forceGridLayout() {
    console.log("🎯 Forçando layout de grid...");
    
    // Força o grid no container principal
    const captureGrid = document.querySelector('#windows-container .capture-grid') || 
                       document.querySelector('.capture-grid');
    
    if (captureGrid) {
        // Aplica estilos de grid diretamente
        captureGrid.style.display = 'grid';
        captureGrid.style.gridTemplateColumns = 'repeat(9, 1fr)';
        captureGrid.style.gridTemplateRows = 'repeat(2, auto)';
        captureGrid.style.gap = '20px';
        captureGrid.style.justifyItems = 'center';
        captureGrid.style.alignItems = 'center';
        captureGrid.style.padding = '25px';
        captureGrid.style.background = 'white';
        captureGrid.style.borderRadius = '16px';
        captureGrid.style.boxShadow = '0 6px 20px rgba(0,0,0,0.15)';
        
        console.log("✅ Grid aplicado ao container principal");
    }
    
    // Remove display das linhas (capture-row)
    const captureRows = document.querySelectorAll('#windows-container .capture-row, .capture-row');
    captureRows.forEach(row => {
        row.style.display = 'contents';
    });
    
    // Posiciona cada botão especificamente no grid
    const buttonPositions = {
        'magna-visio': { column: 1, row: 1 },
        'grieta': { column: 2, row: 1 },
        'peso': { column: 3, row: 1 },
        'cint-corr-ind': { column: 4, row: 1 },
        'e01': { column: 5, row: 1 },
        'e02': { column: 6, row: 1 },
        'e03': { column: 7, row: 1 },
        'e04': { column: 8, row: 1 },
        'e05': { column: 9, row: 1 },
        'e06': { column: 1, row: 2 },
        'captura-final': { column: 2, row: 2 }
    };
    
    // Aplica posicionamento e estilos em cada botão
    Object.keys(buttonPositions).forEach(station => {
        const button = document.querySelector(`#windows-container .capture-btn[data-station="${station}"]`) ||
                      document.querySelector(`.capture-btn[data-station="${station}"]`);
        
        if (button) {
            const pos = buttonPositions[station];
            
            // Posicionamento no grid
            button.style.gridColumn = pos.column.toString();
            button.style.gridRow = pos.row.toString();
            
            // Estilos do botão
            applyButtonStyles(button);
            
            console.log(`✅ Botão ${station} posicionado em coluna ${pos.column}, linha ${pos.row}`);
        }
    });
    
    console.log("🎨 Layout de grid forçado aplicado com sucesso!");
}

function applyButtonStyles(button) {
    button.style.width = '120px';
    button.style.height = '120px';
    button.style.minWidth = '120px';
    button.style.minHeight = '120px';
    button.style.maxWidth = '120px';
    button.style.maxHeight = '120px';
    button.style.display = 'flex';
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
    button.style.fontSize = '13px';
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
        // Remove listeners antigos
        button.removeEventListener("click", handleButtonClick);
        
        // Adiciona novo listener
        button.addEventListener("click", handleButtonClick);
        
        // Adiciona efeitos hover
        button.addEventListener("mouseenter", function() {
            if (!this.classList.contains('processing')) {
                this.style.transform = "translateY(-3px) scale(1.02)";
                this.style.boxShadow = "0 10px 25px rgba(0,0,0,0.35)";
            }
        });
        
        button.addEventListener("mouseleave", function() {
            if (!this.classList.contains('processing')) {
                this.style.transform = "translateY(0) scale(1)";
                this.style.boxShadow = "0 6px 16px rgba(0,0,0,0.25)";
            }
        });
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
    
    // Fechar modal
    [closeBtn, overlay].forEach(element => {
        if (element) {
            element.addEventListener("click", closeModal);
        }
    });
    
    // Ações do modal
    if (capturaInicialBtn) {
        capturaInicialBtn.addEventListener("click", () => {
            executeCaptureAction("inicial");
        });
    }
    
    if (capturaFinalBtn) {
        capturaFinalBtn.addEventListener("click", () => {
            executeCaptureAction("final");
        });
    }
    
    if (buscaOffsetBtn) {
        buscaOffsetBtn.addEventListener("click", () => {
            executeCaptureAction("offset");
        });
    }
    
    // Fechar modal com ESC
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && captureState.modal.isOpen) {
            closeModal();
        }
    });
    
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
    const progressFill = document.getElementById("progress-fill");
    const completedCount = captureState.completedStations.size;
    const progressPercentage = (completedCount / captureState.totalStations) * 100;
    
    if (progressFill) {
        progressFill.style.width = `${progressPercentage}%`;
        progressFill.style.background = 'linear-gradient(90deg, #dc3545 0%, #c82333 100%)';
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
        const allStations = [
            "magna-visio", "grieta", "peso", "cint-corr-ind", 
            "e01", "e02", "e03", "e04", "e05", "e06"
        ];
        
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

