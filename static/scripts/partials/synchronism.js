// synchronism.js - Tela de Sincronismo
// ========================================

// ✅ Sistema de rastreamento de recursos para evitar vazamento de memória
let synchronismEventListeners = [];
let synchronismIntervals = [];
let synchronismInitialized = false;

// Estado da tela
let syncState = {
    syncEnabled: false,
    classificadoraPower: false,
    ovoscopiaPower: false,
    classificadoraJog: null,
    ovoscopiaJog: null,
    posClassificadora: 0,
    posOvoscopia: 0
};

// Função para registrar event listeners
function registerSyncEventListener(element, event, handler, options) {
    if (!element) return;
    element.addEventListener(event, handler, options);
    synchronismEventListeners.push({ element, event, handler, options });
}

// Função para registrar intervalos
function registerSyncInterval(callback, interval) {
    const id = setInterval(callback, interval);
    synchronismIntervals.push(id);
    return id;
}

// ✅ Função de cleanup para evitar vazamento de memória
function cleanupSynchronism() {
    console.log('[SYNC] 🧹 Executando cleanup da tela de sincronismo...');
    
    // Remove todos os event listeners registrados
    synchronismEventListeners.forEach(({ element, event, handler, options }) => {
        try {
            element.removeEventListener(event, handler, options);
        } catch (e) {
            console.warn('[SYNC] Erro ao remover listener:', e);
        }
    });
    synchronismEventListeners = [];
    
    // Limpa todos os intervalos
    synchronismIntervals.forEach(id => {
        try {
            clearInterval(id);
        } catch (e) {
            console.warn('[SYNC] Erro ao limpar intervalo:', e);
        }
    });
    synchronismIntervals = [];
    
    synchronismInitialized = false;
    console.log('[SYNC] ✅ Cleanup concluído');
}

// Função principal de inicialização
function inicializarSynchronism() {
    // ✅ Guard: evita múltiplas inicializações
    if (synchronismInitialized) {
        console.warn('[SYNC] Tela já inicializada. Ignorando...');
        return;
    }
    
    // ✅ Cleanup antes de inicializar (evita acumulação)
    cleanupSynchronism();
    
    console.log('[SYNC] 🚀 Inicializando tela de sincronismo...');
    synchronismInitialized = true;
    
    // Setup dos checkboxes de Jog (seleção única)
    setupJogCheckboxes();
    
    // Setup dos botões de power
    setupPowerButtons();
    
    // Setup do botão de sincronismo principal
    setupSyncToggle();
    
    // Setup dos botões de busca
    setupSearchButtons();
    
    // Inicia polling de dados (apenas se a tela estiver visível)
    startDataPolling();
    
    console.log('[SYNC] ✅ Tela inicializada com sucesso');
}

// ========== Setup dos Checkboxes de Jog (seleção única) ==========
function setupJogCheckboxes() {
    // Classificadora
    const classificadoraCheckboxes = document.querySelectorAll('#sync-classificadora-jog-group input[type="checkbox"]');
    classificadoraCheckboxes.forEach(checkbox => {
        registerSyncEventListener(checkbox, 'change', (e) => {
            if (e.target.checked) {
                // Desmarca todos os outros do mesmo grupo
                classificadoraCheckboxes.forEach(cb => {
                    if (cb !== e.target) {
                        cb.checked = false;
                    }
                });
                syncState.classificadoraJog = parseInt(e.target.value);
                console.log('[SYNC] Classificadora Jog selecionado:', syncState.classificadoraJog);
                
                // TODO: Enviar para o PLC
                // writeJogClassificadora(syncState.classificadoraJog);
            } else {
                syncState.classificadoraJog = null;
            }
        });
    });
    
    // Ovoscopia
    const ovoscopiaCheckboxes = document.querySelectorAll('#sync-ovoscopia-jog-group input[type="checkbox"]');
    ovoscopiaCheckboxes.forEach(checkbox => {
        registerSyncEventListener(checkbox, 'change', (e) => {
            if (e.target.checked) {
                // Desmarca todos os outros do mesmo grupo
                ovoscopiaCheckboxes.forEach(cb => {
                    if (cb !== e.target) {
                        cb.checked = false;
                    }
                });
                syncState.ovoscopiaJog = parseInt(e.target.value);
                console.log('[SYNC] Ovoscopia Jog selecionado:', syncState.ovoscopiaJog);
                
                // TODO: Enviar para o PLC
                // writeJogOvoscopia(syncState.ovoscopiaJog);
            } else {
                syncState.ovoscopiaJog = null;
            }
        });
    });
}

// ========== Setup dos Botões de Power ==========
function setupPowerButtons() {
    // Botão Power Classificadora
    const btnClassificadora = document.getElementById('btn-power-classificadora');
    if (btnClassificadora) {
        registerSyncEventListener(btnClassificadora, 'click', () => {
            syncState.classificadoraPower = !syncState.classificadoraPower;
            updatePowerButton(btnClassificadora, syncState.classificadoraPower);
            updateMotorVisual('classificadora', syncState.classificadoraPower);
            console.log('[SYNC] Classificadora Power:', syncState.classificadoraPower ? 'ON' : 'OFF');
            
            // TODO: Enviar para o PLC
            // writePowerClassificadora(syncState.classificadoraPower);
        });
    }
    
    // Botão Power Ovoscopia
    const btnOvoscopia = document.getElementById('btn-power-ovoscopia');
    if (btnOvoscopia) {
        registerSyncEventListener(btnOvoscopia, 'click', () => {
            syncState.ovoscopiaPower = !syncState.ovoscopiaPower;
            updatePowerButton(btnOvoscopia, syncState.ovoscopiaPower);
            updateMotorVisual('ovoscopia', syncState.ovoscopiaPower);
            console.log('[SYNC] Ovoscopia Power:', syncState.ovoscopiaPower ? 'ON' : 'OFF');
            
            // TODO: Enviar para o PLC
            // writePowerOvoscopia(syncState.ovoscopiaPower);
        });
    }
}

// Atualiza visual do botão de power
function updatePowerButton(button, isOn) {
    if (!button) return;
    const img = button.querySelector('.sync-power-icon');
    if (img) {
        const onSrc = img.getAttribute('data-src-on');
        const offSrc = img.getAttribute('data-src-off');
        if (isOn && onSrc) {
            img.src = onSrc;
        } else if (!isOn && offSrc) {
            img.src = offSrc;
        }
    }
    button.classList.toggle('off', !isOn);
}

// Atualiza visual do motor
function updateMotorVisual(type, isOn) {
    const container = document.querySelector(`.sync-column:${type === 'classificadora' ? 'first-child' : 'last-child'} .motor-visual`);
    if (!container) return;
    
    const grayMotor = container.querySelector('.motor-gray');
    const greenMotor = container.querySelector('.motor-green');
    const redMotor = container.querySelector('.motor-red');
    
    if (grayMotor) grayMotor.style.display = isOn ? 'none' : 'block';
    if (greenMotor) greenMotor.style.display = isOn ? 'block' : 'none';
    if (redMotor) redMotor.style.display = 'none';
}

// ========== Setup do Botão de Sincronismo ==========
function setupSyncToggle() {
    const btnSync = document.getElementById('btn-sync-toggle');
    if (btnSync) {
        registerSyncEventListener(btnSync, 'click', () => {
            syncState.syncEnabled = !syncState.syncEnabled;
            if (syncState.syncEnabled) {
                btnSync.classList.add('active');
            } else {
                btnSync.classList.remove('active');
            }
            console.log('[SYNC] Sincronismo:', syncState.syncEnabled ? 'ATIVADO' : 'DESATIVADO');
            
            // TODO: Enviar para o PLC
            // writeSyncEnabled(syncState.syncEnabled);
        });
    }
}

// ========== Setup dos Botões de Busca ==========
function setupSearchButtons() {
    // Busca Classificadora
    const btnSearchClassificadora = document.getElementById('btn-search-classificadora');
    if (btnSearchClassificadora) {
        registerSyncEventListener(btnSearchClassificadora, 'click', () => {
            console.log('[SYNC] Busca Posição Classificadora');
            // TODO: Enviar comando de busca para o PLC
            // searchPositionClassificadora();
            
            // Feedback visual
            showSearchFeedback(btnSearchClassificadora);
        });
    }
    
    // Busca Ovoscopia
    const btnSearchOvoscopia = document.getElementById('btn-search-ovoscopia');
    if (btnSearchOvoscopia) {
        registerSyncEventListener(btnSearchOvoscopia, 'click', () => {
            console.log('[SYNC] Busca Posição Ovoscopia');
            // TODO: Enviar comando de busca para o PLC
            // searchPositionOvoscopia();
            
            // Feedback visual
            showSearchFeedback(btnSearchOvoscopia);
        });
    }
    
    // Busca Global
    const btnSearchGlobal = document.getElementById('btn-sync-search-global');
    if (btnSearchGlobal) {
        registerSyncEventListener(btnSearchGlobal, 'click', () => {
            console.log('[SYNC] Busca Posição Global');
            // TODO: Enviar comando de busca global para o PLC
            // searchPositionGlobal();
            
            // Feedback visual
            showSearchFeedback(btnSearchGlobal);
        });
    }
}

// Feedback visual de busca
function showSearchFeedback(button) {
    button.style.transform = 'scale(0.95)';
    button.style.opacity = '0.7';
    
    setTimeout(() => {
        button.style.transform = '';
        button.style.opacity = '';
    }, 200);
}

// ========== Polling de Dados ==========
function startDataPolling() {
    // Polling a cada 1 segundo para atualizar valores
    registerSyncInterval(() => {
        // Verifica se a tela está visível
        const container = document.getElementById('synchronism-container');
        if (!container || container.style.display === 'none') {
            return;
        }
        
        // TODO: Buscar dados do PLC via telemetria
        // Por enquanto, apenas simula valores
        updateDisplayValues();
    }, 1000);
}

// Atualiza valores na tela
function updateDisplayValues() {
    // Posição Atual - Classificadora
    const posClassificadoraEl = document.getElementById('sync-pos-classificadora');
    if (posClassificadoraEl) {
        posClassificadoraEl.textContent = formatPosition(syncState.posClassificadora);
    }
    
    // Posição Atual - Ovoscopia
    const posOvoscopiaEl = document.getElementById('sync-pos-ovoscopia');
    if (posOvoscopiaEl) {
        posOvoscopiaEl.textContent = formatPosition(syncState.posOvoscopia);
    }
    
    // Pos. Classificadora (valor com mm)
    const posClassificadoraValueEl = document.getElementById('sync-pos-classificadora-value');
    if (posClassificadoraValueEl) {
        posClassificadoraValueEl.textContent = syncState.posClassificadora.toFixed(0) || '####';
    }
    
    // Pos. Ovoscopia (valor com mm)
    const posOvoscopiaValueEl = document.getElementById('sync-pos-ovoscopia-value');
    if (posOvoscopiaValueEl) {
        posOvoscopiaValueEl.textContent = syncState.posOvoscopia.toFixed(0) || '####';
    }
}

// Formata posição para exibição
function formatPosition(value) {
    if (value === null || value === undefined || isNaN(value)) {
        return '########';
    }
    return value.toFixed(2).padStart(8, '0');
}

// ========== API para integração com PLC (TODO) ==========

// Exemplo de função para escrever no PLC
async function writeTagValue(tag, value) {
    try {
        const response = await fetch('/api/write_tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [tag]: value })
        });
        const data = await response.json();
        console.log('[SYNC] Escrita PLC:', tag, '=', value, 'Resp:', data);
        return data;
    } catch (error) {
        console.error('[SYNC] Erro ao escrever no PLC:', error);
        return null;
    }
}

// Exemplo de função para ler do PLC
async function readTagValue(tag) {
    try {
        const response = await fetch(`/api/read_tags?tags=${tag}`);
        const data = await response.json();
        return data[tag];
    } catch (error) {
        console.error('[SYNC] Erro ao ler do PLC:', error);
        return null;
    }
}

// ========== Exportações Globais ==========
window.inicializarSynchronism = inicializarSynchronism;
window.cleanupSynchronism = cleanupSynchronism;
window.synchronismInitialized = synchronismInitialized;

// Exporta estado para debug
window.syncState = syncState;
