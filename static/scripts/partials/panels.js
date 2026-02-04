// panels.js - Controle da tela de Painéis de Conexão

// Estado dos painéis
const panelStates = {};
let panelsEventListeners = [];

// ============================================
// FILTRO DINÂMICO DE EMBALADORAS (Emb 01-24)
// ============================================
const PANELS_EMBALADORA_QUANTITY_KEY = 'supervisor_embaladora_quantity';

// Painéis que sempre ficam visíveis (não são embaladoras)
const FIXED_PANELS = [
    'lavadora',
    'esteiras',
    'ovoscopia',
    'pre-selecionador'
];

/**
 * Filtra os painéis de embaladoras baseado na quantidade definida nos parâmetros
 */
function filterEmbaladoraPanels() {
    const savedQuantity = localStorage.getItem(PANELS_EMBALADORA_QUANTITY_KEY);
    const quantity = parseInt(savedQuantity) || 24; // Padrão: 24
    
    console.log(`[PANELS] Filtrando embaladoras - Quantidade: ${quantity}`);
    
    const allPanels = document.querySelectorAll('.panel-item');
    
    allPanels.forEach(panel => {
        const panelId = panel.dataset.panel;
        
        // Se for painel fixo, sempre mostra
        if (FIXED_PANELS.includes(panelId)) {
            panel.style.display = '';
            return;
        }
        
        // Se for painel de embaladora (emb-01 a emb-24), verifica a quantidade
        const embaladoraMatch = panelId && panelId.match(/^emb-(\d{2})$/);
        if (embaladoraMatch) {
            const embaladoraNumber = parseInt(embaladoraMatch[1]);
            if (embaladoraNumber <= quantity) {
                panel.style.display = '';
            } else {
                panel.style.display = 'none';
            }
        }
    });
    
    // Reorganiza as linhas do grid após filtrar
    reorganizePanelRows();
}

/**
 * Verifica e esconde linhas que ficarem vazias (sem painéis visíveis)
 */
function reorganizePanelRows() {
    const panelRows = document.querySelectorAll('.panel-row');
    
    panelRows.forEach(row => {
        // Conta painéis visíveis nesta linha
        const visiblePanels = Array.from(row.querySelectorAll('.panel-item'))
            .filter(panel => panel.style.display !== 'none');
        
        // Esconde a linha se não tiver painéis visíveis
        if (visiblePanels.length === 0) {
            row.style.display = 'none';
        } else {
            row.style.display = '';
        }
    });
    
    // Conta total de painéis visíveis
    const totalVisible = document.querySelectorAll('.panel-item:not([style*="display: none"])').length;
    console.log(`[PANELS] Grid atualizado - ${totalVisible} painéis visíveis`);
}

/**
 * Listener para mudanças na quantidade de embaladoras
 */
function setupPanelsEmbaladoraQuantityListener() {
    // Escuta evento customizado de mudança de quantidade
    const quantityChangeHandler = (event) => {
        console.log('[PANELS] Evento embaladoraQuantityChanged recebido:', event.detail);
        filterEmbaladoraPanels();
    };
    
    document.addEventListener('embaladoraQuantityChanged', quantityChangeHandler);
    panelsEventListeners.push({ 
        element: document, 
        event: 'embaladoraQuantityChanged', 
        handler: quantityChangeHandler 
    });
    
    // Também escuta mudanças no localStorage (para sincronização entre abas)
    const storageHandler = (event) => {
        if (event.key === PANELS_EMBALADORA_QUANTITY_KEY) {
            console.log('[PANELS] localStorage embaladora quantity changed:', event.newValue);
            filterEmbaladoraPanels();
        }
    };
    
    window.addEventListener('storage', storageHandler);
    panelsEventListeners.push({ 
        element: window, 
        event: 'storage', 
        handler: storageHandler 
    });
}

function registerPanelsEventListener(element, event, handler) {
    if (element) {
        element.addEventListener(event, handler);
        panelsEventListeners.push({ element, event, handler });
    }
}

function cleanupPanels() {
    console.log('[PANELS] 🧹 Limpando listeners...');
    panelsEventListeners.forEach(({ element, event, handler }) => {
        if (element) {
            element.removeEventListener(event, handler);
        }
    });
    panelsEventListeners = [];
}

// Chave para localStorage
const PANELS_STATE_KEY = 'supervisor_panels_state';

/**
 * Inicializa a tela de painéis
 */
function inicializarPanels() {
    console.log('🚀 Tela de Painéis Inicializada');
    
    // Evita duplicação de listeners
    cleanupPanels();
    
    // Filtra embaladoras baseado na quantidade configurada
    filterEmbaladoraPanels();
    
    // Configura listener para mudanças na quantidade de embaladoras
    setupPanelsEmbaladoraQuantityListener();
    
    // Carrega estados salvos
    loadPanelStates();
    
    // Configura eventos de clique para todos os painéis
    setupPanelClickEvents();
    
    // Aplica estados salvos na UI
    applyPanelStates();
}

/**
 * Carrega estados dos painéis do localStorage
 */
function loadPanelStates() {
    try {
        const saved = localStorage.getItem(PANELS_STATE_KEY);
        if (saved) {
            const states = JSON.parse(saved);
            Object.assign(panelStates, states);
            console.log('[PANELS] Estados carregados:', panelStates);
        }
    } catch (error) {
        console.error('[PANELS] Erro ao carregar estados:', error);
    }
}

/**
 * Salva estados dos painéis no localStorage
 */
function savePanelStates() {
    try {
        localStorage.setItem(PANELS_STATE_KEY, JSON.stringify(panelStates));
        console.log('[PANELS] Estados salvos:', panelStates);
    } catch (error) {
        console.error('[PANELS] Erro ao salvar estados:', error);
    }
}

/**
 * Configura eventos de clique para os botões dos painéis
 */
function setupPanelClickEvents() {
    const panelItems = document.querySelectorAll('.panel-item');
    
    panelItems.forEach(item => {
        const button = item.querySelector('.panel-button');
        const panelId = item.dataset.panel;
        
        if (button && panelId) {
            const clickHandler = function(e) {
                handlePanelClick(e, item, panelId);
            };
            registerPanelsEventListener(button, 'click', clickHandler);
            
            console.log(`[PANELS] Evento configurado para: ${panelId}`);
        }
    });
}

/**
 * Handler para clique no painel
 */
function handlePanelClick(event, item, panelId) {
    event.preventDefault();
    event.stopPropagation();
    
    // Alterna estado do painel
    togglePanelState(item, panelId);
}

/**
 * Alterna o estado de conexão do painel
 */
function togglePanelState(item, panelId) {
    // Verifica estado atual
    const isConnected = item.classList.contains('connected');
    
    // Adiciona classe de loading durante a transição
    item.classList.add('loading');
    
    // Simula delay de conexão/desconexão
    setTimeout(() => {
        if (isConnected) {
            // Desconecta
            item.classList.remove('connected');
            panelStates[panelId] = false;
            console.log(`[PANELS] ${panelId} desconectado`);
        } else {
            // Conecta
            item.classList.add('connected');
            panelStates[panelId] = true;
            console.log(`[PANELS] ${panelId} conectado`);
        }
        
        // Remove classe de loading
        item.classList.remove('loading');
        
        // Salva estados
        savePanelStates();
        
        // Dispara evento customizado
        dispatchPanelChangeEvent(panelId, !isConnected);
    }, 300);
}

/**
 * Aplica estados salvos na UI
 */
function applyPanelStates() {
    const panelItems = document.querySelectorAll('.panel-item');
    
    panelItems.forEach(item => {
        const panelId = item.dataset.panel;
        
        if (panelId && panelStates[panelId] === true) {
            item.classList.add('connected');
        } else {
            item.classList.remove('connected');
        }
    });
    
    console.log('[PANELS] Estados aplicados na UI');
}

/**
 * Define o estado de um painel específico
 * @param {string} panelId - ID do painel
 * @param {boolean} connected - Estado de conexão
 */
function setPanelState(panelId, connected) {
    const item = document.querySelector(`.panel-item[data-panel="${panelId}"]`);
    
    if (item) {
        if (connected) {
            item.classList.add('connected');
        } else {
            item.classList.remove('connected');
        }
        
        panelStates[panelId] = connected;
        savePanelStates();
        
        console.log(`[PANELS] Estado de ${panelId} definido para: ${connected}`);
    }
}

/**
 * Obtém o estado de um painel específico
 * @param {string} panelId - ID do painel
 * @returns {boolean} Estado de conexão
 */
function getPanelState(panelId) {
    return panelStates[panelId] === true;
}

/**
 * Conecta todos os painéis
 */
function connectAllPanels() {
    const panelItems = document.querySelectorAll('.panel-item');
    
    panelItems.forEach(item => {
        const panelId = item.dataset.panel;
        if (panelId) {
            item.classList.add('connected');
            panelStates[panelId] = true;
        }
    });
    
    savePanelStates();
    console.log('[PANELS] Todos os painéis conectados');
}

/**
 * Desconecta todos os painéis
 */
function disconnectAllPanels() {
    const panelItems = document.querySelectorAll('.panel-item');
    
    panelItems.forEach(item => {
        const panelId = item.dataset.panel;
        if (panelId) {
            item.classList.remove('connected');
            panelStates[panelId] = false;
        }
    });
    
    savePanelStates();
    console.log('[PANELS] Todos os painéis desconectados');
}

// Exporta cleanup
window.cleanupPanels = cleanupPanels;

/**
 * Dispara evento customizado quando um painel muda de estado
 */
function dispatchPanelChangeEvent(panelId, connected) {
    const event = new CustomEvent('panelStateChange', {
        detail: {
            panelId: panelId,
            connected: connected,
            timestamp: Date.now()
        }
    });
    
    document.dispatchEvent(event);
}

/**
 * Simula atualização de estados via PLC (para integração futura)
 * @param {Object} plcData - Dados do PLC com estados dos painéis
 */
function updatePanelsFromPLC(plcData) {
    if (!plcData) return;
    
    Object.keys(plcData).forEach(panelId => {
        const connected = plcData[panelId] === true || plcData[panelId] === 1;
        setPanelState(panelId, connected);
    });
    
    console.log('[PANELS] Estados atualizados via PLC:', plcData);
}

/**
 * Define estado de alerta para um painel
 * @param {string} panelId - ID do painel
 * @param {boolean} alert - Se deve mostrar alerta
 */
function setPanelAlert(panelId, alert) {
    const item = document.querySelector(`.panel-item[data-panel="${panelId}"]`);
    
    if (item) {
        if (alert) {
            item.classList.add('alert');
        } else {
            item.classList.remove('alert');
        }
    }
}

// Exporta funções para escopo global
window.inicializarPanels = inicializarPanels;
window.setPanelState = setPanelState;
window.getPanelState = getPanelState;
window.connectAllPanels = connectAllPanels;
window.disconnectAllPanels = disconnectAllPanels;
window.updatePanelsFromPLC = updatePanelsFromPLC;
window.setPanelAlert = setPanelAlert;
window.filterEmbaladoraPanels = filterEmbaladoraPanels;

// Inicializa quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // A inicialização será chamada pela função showPanels
        console.log('[PANELS] Script carregado, aguardando chamada de showPanels');
    });
} else {
    console.log('[PANELS] Script carregado (DOM já pronto)');
}
