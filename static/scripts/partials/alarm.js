let alarmesInicializados = false;

function inicializarAlarmes() {
    // Verifica se o DOM está completamente carregado
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializarAlarmes);
        return;
    }
    
    // Verifique se os elementos existem no DOM
    const filterButtons = document.querySelectorAll('.filtro-btn');
    const alarmList = document.getElementById('alarmList');
    
    if (!alarmList) {
        console.error('Elemento alarmList não encontrado!');
        setTimeout(inicializarAlarmes, 300);
        return;
    }
    
    // Configura os filtros de prioridade (só uma vez, mesmo se já inicializado)
    if (!alarmesInicializados) {
        filterButtons.forEach(btn => {
            console.log('Configurando botão de filtro:', btn.dataset.prioridade);
            btn.addEventListener('click', function() {
                // Remove active class de todos os botões
                filterButtons.forEach(b => b.classList.remove('active'));
                // Adiciona active class ao botão clicado
                this.classList.add('active');
                // Aplica o filtro
                aplicarFiltro(this.dataset.prioridade);
            });
        });
    }

    // Inicializa SocketIO e carrega alarmes apenas na primeira vez
    if (!alarmesInicializados) {
        alarmesInicializados = true;
        console.log('Tela de alarmes inicializada com sucesso!');
        
        // Inicializa SocketIO para alarmes em tempo real
        inicializarSocketAlarmes();
        
        // Carrega os alarmes iniciais
        carregarAlarmes('instantaneos');
    }
    
    // ✅ SEMPRE tenta selecionar a aba desejada quando os botões estão prontos
    // Isso garante que mesmo se já foi inicializado, a aba será selecionada ao abrir novamente
    try {
        let desired = (window.__desiredAlarmTab || '').toLowerCase();
        if (!desired && window.location && window.location.hash && window.location.hash.startsWith('#alarms-')) {
            desired = window.location.hash.replace('#alarms-', '').toLowerCase();
        }
        if (desired && filterButtons.length > 0 && typeof window.selectAlarmTab === 'function') {
            // Pequeno delay para garantir que os botões estão totalmente prontos
            setTimeout(() => {
                const ok = window.selectAlarmTab(desired);
                if (ok) {
                    window.__desiredAlarmTab = '';
                    try { if (window.location && window.location.hash) window.location.hash = ''; } catch(_) {}
                    console.log(`[INICIALIZAR_ALARMES] ✅ Aba "${desired}" selecionada com sucesso`);
                } else {
                    console.log(`[INICIALIZAR_ALARMES] ⚠️ Falha ao selecionar aba "${desired}" - será tentado novamente por showAlarm`);
                }
            }, 10);
        }
    } catch(err) {
        console.error('[INICIALIZAR_ALARMES] Erro ao selecionar aba:', err);
    }
}

function toggleAlarmView(button) {
    if (!button) {
        console.error('[ALARM] toggleAlarmView: botão não fornecido');
        return;
    }
    
    const currentState = button.getAttribute('data-state') || 'instantaneos';
    const toggleText = button.querySelector('.toggle-text');
    
    console.log(`[ALARM] Alternando modo: ${currentState} -> ${currentState === 'instantaneos' ? 'historicos' : 'instantaneos'}`);
    
    if (currentState === 'instantaneos') {
        button.setAttribute('data-state', 'historicos');
        if (toggleText) toggleText.textContent = 'Histórico';
        currentViewMode = 'historicos';
        // Para o polling automático quando em histórico
        stopAlarmAutoRefresh();
        // Para atualizações via SocketIO no modo histórico
        console.log('[ALARM] Modo histórico ativado - carregando histórico...');
        // Força recarregamento do histórico
        carregarAlarmesHistoricos();
    } else {
        button.setAttribute('data-state', 'instantaneos');
        if (toggleText) toggleText.textContent = 'Instantâneo';
        currentViewMode = 'instantaneos';
        // Reinicia o polling quando volta para instantâneo
        console.log('[ALARM] Modo instantâneo ativado - carregando alarmes ativos...');
        startAlarmAutoRefresh();
        carregarAlarmes('instantaneos');
    }
}

function aplicarFiltro(prioridade) {
    console.log(`Aplicando filtro: ${prioridade}`);
    const alarmes = document.querySelectorAll('.alarme-item');
    
    alarmes.forEach(alarme => {
        if (prioridade === 'todas') {
            alarme.style.display = 'grid';
        } else {
            alarme.style.display = alarme.classList.contains(prioridade) ? 'grid' : 'none';
        }
    });
}

// Variáveis globais para armazenar alarmes
let currentAlarms = [];
let alarmSocket = null;
let alarmPollIntervalId = null;
let currentViewMode = 'instantaneos'; // Controla se está em modo instantâneo ou histórico
const ALARM_POLL_MS = 1000; // Intervalo ideal para atualização de alarmes

function carregarAlarmes(tipo) {
    console.log(`Carregando alarmes ${tipo}...`);
    
    if (tipo === 'instantaneos') {
        // Carrega alarmes reais do PLC
        carregarAlarmesReais();
    } else {
        // Para histórico, usa dados simulados por enquanto
        carregarAlarmesHistoricos();
    }
}

function startAlarmAutoRefresh() {
    try {
        // Evita múltiplos intervals
        if (alarmPollIntervalId) {
            return;
        }
        // Atualiza imediatamente e depois a cada intervalo
        carregarAlarmesReais();
        alarmPollIntervalId = setInterval(() => {
            carregarAlarmesReais();
        }, ALARM_POLL_MS);
        console.log(`[ALARM] Auto refresh iniciado (${ALARM_POLL_MS} ms)`);
    } catch (e) {
        console.error('[ALARM] Erro ao iniciar auto refresh:', e);
    }
}

function stopAlarmAutoRefresh() {
    try {
        if (alarmPollIntervalId) {
            clearInterval(alarmPollIntervalId);
            alarmPollIntervalId = null;
            console.log('[ALARM] Auto refresh parado');
        }
    } catch (e) {
        console.error('[ALARM] Erro ao parar auto refresh:', e);
    }
}

function carregarAlarmesReais() {
    // ✅ PROTEÇÃO: Não carrega se está offline confirmado
    const isOffline = window.PLC_OFFLINE_CONFIRMED === true;
    if (isOffline) {
        console.log('[ALARM] ⚠️ PLC offline confirmado - não carregando alarmes via API');
        mostrarMensagemDesconexaoAlarmes();
        return;
    }
    
    console.log('Carregando alarmes reais do PLC...');
    
    // Tenta carregar via API
    fetch('/api/alarms')
        .then(response => response.json())
        .then(data => {
            if (data.ok && data.active_alarms) {
                console.log(`[ALARM] ${data.active_alarms.length} alarmes recebidos do PLC`);
                currentAlarms = data.active_alarms;
                atualizarInterfaceAlarmes();
                atualizarContadoresAlarmes(data.alarm_summary);
            } else {
                console.log('[ALARM] Nenhum alarme ativo ou erro na API:', data.error);
                currentAlarms = [];
                atualizarInterfaceAlarmes();
            }
        })
        .catch(error => {
            console.error('[ALARM] Erro ao carregar alarmes:', error);
            // Em caso de erro, mostra mensagem
            mostrarMensagemErroAlarmes();
        });
}

// ✅ Torna função acessível globalmente para grid.js poder chamar na reconexão
window.carregarAlarmesReais = carregarAlarmesReais;

function carregarAlarmesHistoricos() {
    console.log('Carregando histórico de alarmes...');
    
    // Carrega histórico real via API
    fetch('/api/alarms/history?limit=200')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.ok && data.history && Array.isArray(data.history)) {
                console.log(`[ALARM] ${data.history.length} eventos de histórico carregados`);
                
                // Converte eventos do histórico para o mesmo formato da lista ativa
                const alarmes = data.history.map(event => {
                    // Formata data e hora a partir do full_timestamp
                    let dateStr = '';
                    let timeStr = '--:--';
                    
                    if (event.full_timestamp) {
                        try {
                            const date = new Date(event.full_timestamp);
                            dateStr = date.toLocaleDateString('pt-BR');
                            timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                        } catch (e) {
                            console.warn('[ALARM] Erro ao formatar timestamp:', e);
                        }
                    } else if (event.date) {
                        dateStr = event.date;
                        timeStr = event.timestamp || '--:--';
                    }
                    
                    return {
                        id: event.id || `${event.var_name}_${event.bit_index}_${event.full_timestamp}`,
                        var_name: event.var_name || '',
                        bit_index: event.bit_index || 0,
                        description: `${event.action === 'activated' ? 'ATIVADO' : 'LIMPO'}: ${event.description || 'Sem descrição'}`,
                        priority: event.priority || 'hardware',
                        type: event.type || event.priority || 'hardware',
                        machine: event.machine || '',
                        date: dateStr,
                        timestamp: timeStr,
                        full_timestamp: event.full_timestamp || '', // ✅ PRESERVA full_timestamp para ordenação
                        active: event.action === 'activated'
                    };
                });
                
                currentAlarms = alarmes;
                atualizarInterfaceAlarmes();
            } else {
                console.log('[ALARM] Nenhum histórico disponível ou erro na API:', data.error || 'Dados inválidos');
                currentAlarms = [];
                atualizarInterfaceAlarmes();
            }
        })
        .catch(error => {
            console.error('[ALARM] Erro ao carregar histórico:', error);
            // Em caso de erro, mostra mensagem
            mostrarMensagemErroAlarmes();
        });
}

function atualizarInterfaceAlarmes() {
    const alarmList = document.getElementById('alarmList');
    if (!alarmList) {
        console.warn('[ALARM] Elemento alarmList não encontrado');
        return;
    }
    
    // ✅ PROTEÇÃO: Se está offline confirmado, mostra mensagem de desconexão
    const isOffline = window.PLC_OFFLINE_CONFIRMED === true;
    if (isOffline && currentViewMode === 'instantaneos') {
        mostrarMensagemDesconexaoAlarmes();
        return;
    }
    
    try {
        // Ordena do mais recente para o mais antigo usando full_timestamp (ISO) quando disponível
        if (Array.isArray(currentAlarms) && currentAlarms.length > 0) {
            currentAlarms.sort((a, b) => {
                // Prioriza full_timestamp (ISO format)
                const ta = (a && a.full_timestamp) ? a.full_timestamp : '';
                const tb = (b && b.full_timestamp) ? b.full_timestamp : '';
                
                if (ta && tb) {
                    // Compara timestamps ISO diretamente
                    return new Date(tb).getTime() - new Date(ta).getTime();
                }
                
                // Fallback: tenta usar date + timestamp
                if (a && b && a.date && b.date) {
                    const dateA = new Date(a.date + ' ' + (a.timestamp || '00:00'));
                    const dateB = new Date(b.date + ' ' + (b.timestamp || '00:00'));
                    if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
                        return dateB.getTime() - dateA.getTime();
                    }
                }
                
                // Mantém ordem atual se não houver timestamps válidos
                return 0;
            });
        }
    } catch (e) {
        console.warn('[ALARM] Falha ao ordenar alarmes no frontend:', e);
    }
    
    // Determina mensagem baseada no modo atual
    const mensagemVazio = currentViewMode === 'historicos' 
        ? 'Nenhum evento no histórico' 
        : 'Nenhum alarme ativo';
    
    if (!currentAlarms || currentAlarms.length === 0) {
        alarmList.innerHTML = `
            <div class="alarm-header">
                <span></span>
                <span>Data</span>
                <span>Hora</span>
                <span>Descrição do Alarme</span>
            </div>
            <div class="no-alarms">
                <span>${mensagemVazio}</span>
            </div>
        `;
    } else {
        // Gera o HTML dos alarmes
        const alarmeItems = currentAlarms.map(alarme => {
            const prioridade = normalizarPrioridade(alarme);
            const descricao = alarme.description || 'Sem descrição';
            const data = alarme.date || '';
            const hora = alarme.timestamp || '--:--';
            
            return `
            <div class="alarme-item ${prioridade}">
                <div class="alarm-type-dot ${prioridade}"></div>
                <span class="alarm-date">${data}</span>
                <span class="alarm-time">${hora}</span>
                <span class="alarm-description">${descricao}</span>
            </div>`;
        }).join('');

        // Atualiza a lista mantendo o cabeçalho
        alarmList.innerHTML = `
            <div class="alarm-header">
                <span></span>
                <span>Data</span>
                <span>Hora</span>
                <span>Descrição do Alarme</span>
            </div>
            ${alarmeItems}
        `;
    }

    // Reaplica o filtro atual
    const filtroAtivo = document.querySelector('.filtro-btn.active');
    if (filtroAtivo) {
        aplicarFiltro(filtroAtivo.dataset.prioridade);
    }

    // Atualiza indicadores nas abas (apenas no modo instantâneo)
    if (currentViewMode === 'instantaneos') {
        atualizarIndicadoresAbas();
    }
    
    // Removido ajuste tardio de aba para evitar troca após abrir
}

// Normaliza prioridade separando NR12 de Emergência
function normalizarPrioridade(alarme) {
    try {
        // Prioriza o campo 'type' vindo do backend (definido por índice/overrides)
        const tipo = (alarme.type || '').toLowerCase();
        if (tipo) return tipo;

        // Fallback para prioridade do backend
        const basePriority = (alarme.priority || '').toLowerCase();
        if (basePriority) return basePriority;

        return 'hardware';
    } catch (e) {
        return 'hardware';
    }
}

function atualizarContadoresAlarmes(summary) {
    // Atualiza os contadores na interface (se existirem)
    if (summary) {
        console.log('[ALARM] Resumo dos alarmes recebido:', summary);
        
        // Atualiza os círculos no grid (caso esteja na tela de alarmes)
        const tipos = ['emergency', 'nr12', 'drives', 'thermal', 'hardware', 'process', 'total'];
        tipos.forEach(tipo => {
            const count = Number(summary[tipo] || 0);
            const elemento = document.querySelector(`.alarm-count-circle.${tipo} .count-value`);
            const circle = document.querySelector(`.alarm-count-circle.${tipo}`);
            
            if (elemento) {
                elemento.textContent = count.toString().padStart(2, '0');
                console.log(`[ALARM] ✓ Contador '${tipo}' atualizado: ${count}`);
            }
            
            if (circle) {
                if (count > 0) {
                    circle.classList.add('has-alarms');
                    console.log(`[ALARM] ✓ Círculo '${tipo}' marcado com has-alarms`);
                } else {
                    circle.classList.remove('has-alarms');
                }
            }
        });
    } else {
        console.log('[ALARM] Nenhum resumo de alarmes fornecido');
    }
}

function mostrarMensagemErroAlarmes() {
    const alarmList = document.getElementById('alarmList');
    if (!alarmList) return;
    
    const mensagemErro = currentViewMode === 'historicos'
        ? 'Erro ao carregar histórico de alarmes'
        : 'Erro ao carregar alarmes do PLC';
    
    alarmList.innerHTML = `
        <div class="alarm-header">
            <span></span>
            <span>Data</span>
            <span>Hora</span>
            <span>Descrição do Alarme</span>
        </div>
        <div class="alarm-error">
            <span>${mensagemErro}</span>
        </div>
    `;
}

// ✅ NOVA FUNÇÃO: Mostra mensagem de desconexão no grid de alarmes
function mostrarMensagemDesconexaoAlarmes() {
    const alarmList = document.getElementById('alarmList');
    if (!alarmList) return;
    
    alarmList.innerHTML = `
        <div class="alarm-header">
            <span></span>
            <span>Data</span>
            <span>Hora</span>
            <span>Descrição do Alarme</span>
        </div>
        <div class="no-alarms">
            <span style="color: #ff6b6b; font-weight: bold;">### PLC Desconectado ###</span>
        </div>
    `;
}

// Inicializa SocketIO para receber alarmes em tempo real
function inicializarSocketAlarmes() {
    if (alarmSocket) return; // Já inicializado
    
    try {
        alarmSocket = io();
        
        alarmSocket.on('telemetry', (data) => {
            // ✅ PROTEÇÃO: Não atualiza alarmes se está offline confirmado
            const isOffline = window.PLC_OFFLINE_CONFIRMED === true;
            if (isOffline) {
                console.log('[ALARM] ⚠️ PLC offline confirmado - bloqueando atualização de alarmes');
                return;
            }
            
            if (data && data.active_alarms) {
                console.log('[ALARM] Alarmes recebidos via SocketIO:', data.active_alarms.length);
                // Só atualiza se estiver no modo instantâneo
                if (currentViewMode === 'instantaneos') {
                    currentAlarms = data.active_alarms;
                    atualizarInterfaceAlarmes();
                    atualizarContadoresAlarmes(data.alarm_summary);
                    atualizarIndicadoresAbas();
                }
            }
        });
        
        alarmSocket.on('plc_connection_changed', (data) => {
            if (data && data.connected) {
                console.log('[ALARM] PLC conectado, aguardando confirmação estável...');
                // ✅ Não atualiza imediatamente - aguarda confirmação estável via telemetry
                // O sistema de confirmação vai atualizar quando reconexão for confirmada
            } else {
                console.log('[ALARM] PLC desconectado, mostrando mensagem de desconexão...');
                if (currentViewMode === 'instantaneos') {
                    // ✅ Mostra mensagem de desconexão em vez de limpar completamente
                    mostrarMensagemDesconexaoAlarmes();
                }
                // Marca os contadores do grid como offline (##)
                try { if (window.setAlarmCountsOffline) window.setAlarmCountsOffline(); } catch(_) {}
            }
        });
        
        console.log('[ALARM] SocketIO inicializado para alarmes');
        // Mantém o polling como fallback caso o socket não emita com frequência
        if (!alarmPollIntervalId) {
            startAlarmAutoRefresh();
        }
    } catch (error) {
        console.error('[ALARM] Erro ao inicializar SocketIO:', error);
    }
}

// Determina quais tipos possuem alarmes ativos e marca as abas correspondentes
function atualizarIndicadoresAbas() {
    try {
        const tiposAtivos = new Set();
        currentAlarms.forEach(alarme => {
            const tipo = normalizarPrioridade(alarme);
            if (tipo) tiposAtivos.add(tipo);
        });

        console.log('[ALARM] Tipos ativos detectados:', Array.from(tiposAtivos));
        console.log('[ALARM] Total de alarmes:', currentAlarms.length);

        const tabs = document.querySelectorAll('.filtro-btn');
        console.log('[ALARM] Total de abas encontradas:', tabs.length);
        
        tabs.forEach(tab => {
            const prioridade = tab.getAttribute('data-prioridade');
            if (!prioridade || prioridade === 'todas') {
                tab.classList.remove('has-alarms');
                return;
            }
            if (tiposAtivos.has(prioridade)) {
                tab.classList.add('has-alarms');
                console.log(`[ALARM] ✓ Aba '${prioridade}' marcada com has-alarms`);
            } else {
                tab.classList.remove('has-alarms');
                console.log(`[ALARM] ✗ Aba '${prioridade}' sem alarmes`);
            }
        });
    } catch (e) {
        console.error('[ALARM] Erro ao atualizar indicadores de abas:', e);
    }
}

// Atualiza ao trocar modo de visualização
document.addEventListener('DOMContentLoaded', () => {
    atualizarIndicadoresAbas();
});

// Permite selecionar uma aba de alarmes programaticamente a partir do grid
window.selectAlarmTab = function(prioridade) {
    try {
        const desired = (prioridade || 'todas').toLowerCase();
        console.log(`[SELECT_TAB] Tentando selecionar aba: "${desired}"`);
        
        const buttons = document.querySelectorAll('.filtro-btn');
        if (!buttons || buttons.length === 0) {
            console.log('[SELECT_TAB] ⚠️ Botões de filtro não encontrados ainda');
            return false; // Retorna false para indicar que precisa retry
        }
        
        console.log(`[SELECT_TAB] ${buttons.length} botões de filtro encontrados`);
        
        // Lista todas as prioridades disponíveis para debug
        const availablePriorities = Array.from(buttons).map(b => (b.getAttribute('data-prioridade') || '').toLowerCase());
        console.log(`[SELECT_TAB] Prioridades disponíveis:`, availablePriorities);
        
        // Remove seleção atual
        buttons.forEach(b => b.classList.remove('active'));
        
        // Encontra o botão correspondente
        const btn = Array.from(buttons).find(b => {
            const btnPrioridade = (b.getAttribute('data-prioridade') || '').toLowerCase();
            const match = btnPrioridade === desired;
            if (match) {
                console.log(`[SELECT_TAB] ✅ Encontrado botão com data-prioridade="${btnPrioridade}"`);
            }
            return match;
        });
        
        if (btn) {
            btn.classList.add('active');
            aplicarFiltro(desired);
            console.log(`[SELECT_TAB] ✅ Aba "${desired}" selecionada e filtro aplicado com sucesso`);
            return true;
        } else {
            console.log(`[SELECT_TAB] ⚠️ Aba "${desired}" não encontrada, usando fallback "todas"`);
            // Fallback para 'todas'
            const allBtn = Array.from(buttons).find(b => (b.getAttribute('data-prioridade') || '').toLowerCase() === 'todas');
            if (allBtn) {
                allBtn.classList.add('active');
                aplicarFiltro('todas');
                console.log('[SELECT_TAB] ✅ Fallback para aba "todas" aplicado');
                return true;
            } else {
                console.error('[SELECT_TAB] ❌ Nenhuma aba encontrada, nem mesmo "todas"');
                return false;
            }
        }
    } catch (err) {
        console.error('[SELECT_TAB] ❌ Erro ao selecionar aba:', err);
        return false;
    }
};

// Função para carregar alarmes do comm_map.json
async function carregarAlarmesDoCommMap() {
    try {
        const response = await fetch('/api/comm-map');
        const commMapData = await response.json();
        
        // Processa os dados do comm_map para extrair alarmes
        const alarmes = [];
        
        // Itera sobre as máquinas no comm_map
        Object.keys(commMapData).forEach(machine => {
            if (Array.isArray(commMapData[machine])) {
                commMapData[machine].forEach(item => {
                    if (item.name && item.name.toLowerCase().includes('alarme')) {
                        alarmes.push({
                            name: item.name,
                            description: item.description || item.name,
                            machine: machine,
                            area: item.area,
                            db: item.db,
                            offset: item.offset,
                            type: item.type,
                            prioridade: determinarPrioridade(item.name, item.description)
                        });
                    }
                });
            }
        });
        
        return alarmes;
    } catch (error) {
        console.error('Erro ao carregar comm_map:', error);
        return [];
    }
}

// Função para determinar prioridade baseada no nome/descrição do alarme
function determinarPrioridade(name, description) {
    const text = (name + ' ' + description).toLowerCase();
    
    if (text.includes('emergency') || text.includes('emergência') || text.includes('nr12')) {
        return 'emergency';
    } else if (text.includes('drive') || text.includes('inversor')) {
        return 'drives';
    } else if (text.includes('thermal') || text.includes('térmico') || text.includes('temperatura')) {
        return 'thermal';
    } else if (text.includes('hardware') || text.includes('comunicação') || text.includes('plc')) {
        return 'hardware';
    } else if (text.includes('process') || text.includes('processo')) {
        return 'process';
    }
    
    return 'hardware'; // padrão
}

// ===== BOTÕES RÁPIDOS DE COMUNICAÇÃO COM PLC =====
let quickButtonsInitialized = false;
let syncInterval = null; // Intervalo de sincronização global
let isWriting = false; // Lock para evitar escritas simultâneas
let lastSyncTime = 0; // Timestamp da última sincronização

// ✅ NOVA PROTEÇÃO: Sistema de fila e bloqueio para evitar conflitos
const QUICK_BUTTON_PROCESSING = new Set(); // Botões atualmente processando
const QUICK_BUTTON_LAST_CLICK = new Map(); // Último timestamp de clique por botão
const QUICK_BUTTON_MIN_INTERVAL = 2000; // Mínimo de 2 segundos entre cliques
const QUICK_TAG_WRITE_QUEUE = new Map(); // Fila de escritas por TAG
const QUICK_TAG_WRITE_LOCK = new Map(); // Lock por TAG
const QUICK_TAG_LAST_WRITE = new Map(); // Timestamp da última escrita por TAG
const QUICK_MIN_DELAY_BETWEEN_WRITES = 5000; // 5 segundos entre escritas na mesma TAG

// ✅ Função para mostrar toast nos botões rápidos
function showQuickButtonToast(message, duration = 3000) {
    // Remove toast anterior se existir
    const existingToast = document.getElementById('quick-button-toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // Cria novo toast
    const toast = document.createElement('div');
    toast.id = 'quick-button-toast';
    toast.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.85);
        color: white;
        padding: 20px 30px;
        border-radius: 8px;
        font-size: 16px;
        font-weight: bold;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        text-align: center;
        min-width: 300px;
        animation: fadeInOut 0.3s ease-in-out;
    `;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Remove após o tempo especificado
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ✅ Função para enfileirar escritas na mesma TAG (serializadas)
async function enqueueQuickTagWrite(tagName, writeOperation) {
    const previousPromise = QUICK_TAG_WRITE_QUEUE.get(tagName) || Promise.resolve();
    
    const newPromise = previousPromise
        .catch(() => {})
        .then(async () => {
            // Calcula delay necessário desde a última escrita
            const lastWriteTime = QUICK_TAG_LAST_WRITE.get(tagName) || 0;
            const timeSinceLastWrite = Date.now() - lastWriteTime;
            const delayNeeded = Math.max(0, QUICK_MIN_DELAY_BETWEEN_WRITES - timeSinceLastWrite);
            
            if (delayNeeded > 0) {
                console.log(`[QUICK_BUTTONS] ⏳ ${tagName}: Aguardando ${delayNeeded}ms antes de escrever`);
                await new Promise(resolve => setTimeout(resolve, delayNeeded));
            }
            
            console.log(`[QUICK_BUTTONS] 🔒 ${tagName}: Iniciando escrita serializada`);
            QUICK_TAG_WRITE_LOCK.set(tagName, true);
            try {
                const result = await writeOperation();
                QUICK_TAG_LAST_WRITE.set(tagName, Date.now());
                return result;
            } finally {
                QUICK_TAG_WRITE_LOCK.set(tagName, false);
                console.log(`[QUICK_BUTTONS] 🔓 ${tagName}: Escrita concluída`);
            }
        });
    
    QUICK_TAG_WRITE_QUEUE.set(tagName, newPromise);
    return newPromise;
}

// ✅ Função para verificar se TAG está sendo escrita
function isQuickTagWriting(tagName) {
    return QUICK_TAG_WRITE_LOCK.get(tagName) === true;
}

function inicializarBotoesRapidos() {
    if (quickButtonsInitialized) {
        console.log('[QUICK_BUTTONS] Botões já inicializados');
        return;
    }
    
    console.log('[QUICK_BUTTONS] Inicializando botões rápidos...');
    
    const TAG_NAME = 'XLCLASS_DB1_PRINCIPAL_COMANDO_STATUS_03';
    const btnSolenoide = document.getElementById('btn-acionamento'); // bit 0
    const btnBalanca = document.getElementById('btn-balanca');       // bit 1

    if (!btnSolenoide || !btnBalanca) {
        console.log('[QUICK_BUTTONS] Botões não encontrados, tentando novamente...');
        setTimeout(inicializarBotoesRapidos, 500);
        return;
    }

    console.log('[QUICK_BUTTONS] Botões encontrados:', {
        solenoide: !!btnSolenoide,
        balanca: !!btnBalanca
    });

    async function readWord() {
        try {
            console.log(`[QUICK_BUTTONS] Lendo tag: ${TAG_NAME}`);
            const res = await fetch(`/api/read_tags?names=${TAG_NAME}`);
            const data = await res.json();
            console.log('[QUICK_BUTTONS] Resposta da leitura:', data);
            
            if (data && data.ok && data.values && typeof data.values[TAG_NAME] !== 'undefined') {
                const value = Number(data.values[TAG_NAME]);
                console.log(`[QUICK_BUTTONS] Valor lido: ${value} (0x${value.toString(16).toUpperCase()})`);
                return value;
            } else {
                console.error('[QUICK_BUTTONS] Dados inválidos na leitura:', data);
                return null;
            }
        } catch (e) {
            console.error('[QUICK_BUTTONS] Erro na leitura:', e);
            return null;
        }
    }

    // ✅ NOVA FUNÇÃO: Usa write_word_bit para escrita serializada (igual ao grid)
    async function writeWordBit(tagName, bit, value) {
        return enqueueQuickTagWrite(tagName, async () => {
            try {
                console.log(`[QUICK_BUTTONS] 📝 Enviando escrita ${tagName}, bit ${bit} = ${value}`);
                
                const payload = {
                    name: tagName,
                    bit: bit,
                    mode: 'state',
                    value: value ? 1 : 0,
                    pure: false
                };
                
                const response = await fetch('/api/write_word_bit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`[QUICK_BUTTONS] ❌ Erro HTTP ${response.status}:`, errorText);
                    return false;
                }
                
                const data = await response.json();
                if (!data.ok) {
                    console.error(`[QUICK_BUTTONS] ❌ Falha na escrita:`, data.error);
                    return false;
                }
                
                const writtenValue = Number(data.written) >>> 0;
                console.log(`[QUICK_BUTTONS] ✅ Backend processou (WORD=0x${writtenValue.toString(16).toUpperCase().padStart(4,'0')})`);
                
                return true;
            } catch (error) {
                console.error(`[QUICK_BUTTONS] ❌ Exceção:`, error);
                return false;
            }
        });
    }

    function setButtonVisual(button, active) {
        if (!button) return;
        button.classList.toggle('active', !!active);
        const badge = button.querySelector('.status-badge');
        if (badge) {
            badge.textContent = active ? '✓' : '✕';
            badge.style.color = active ? '#28a745' : '#dc3545';
        }
        console.log(`[QUICK_BUTTONS] Botão ${button.id} ${active ? 'ativado' : 'desativado'}`);
    }

    function bitIsSet(word, bit) {
        const result = ((word >>> bit) & 1) === 1;
        console.log(`[QUICK_BUTTONS] Bit ${bit} do valor ${word}: ${result}`);
        return result;
    }

    function setBit(word, bit, on) {
        if (on) {
            const result = word | (1 << bit);
            console.log(`[QUICK_BUTTONS] Setando bit ${bit} em ${word}: ${result}`);
            return result;
        } else {
            const result = word & ~(1 << bit);
            console.log(`[QUICK_BUTTONS] Limpando bit ${bit} em ${word}: ${result}`);
            return result;
        }
    }

    async function clickBitHandler(button, bit) {
        const buttonRole = bit === 0 ? 'solenoide' : 'balanca';
        
        // ✅ PROTEÇÃO 1: Verifica se este botão já está processando
        if (QUICK_BUTTON_PROCESSING.has(buttonRole)) {
            console.log(`[QUICK_BUTTONS] ⏸️ ${buttonRole} já está processando`);
            showQuickButtonToast('⏳ Aguarde o comando anterior ser processado!', 2500);
            return;
        }
        
        // ✅ PROTEÇÃO 2: Verifica se OUTRO botão da mesma WORD está processando
        const allRoles = ['solenoide', 'balanca'];
        const isAnyProcessing = allRoles.some(r => QUICK_BUTTON_PROCESSING.has(r));
        if (isAnyProcessing) {
            console.log(`[QUICK_BUTTONS] 🚫 ${buttonRole}: Outro botão está processando`);
            showQuickButtonToast('⏳ Aguarde! Outro comando está sendo processado.\nTente novamente em alguns segundos.', 3000);
            return;
        }
        
        // ✅ PROTEÇÃO 3: Verifica se a TAG está sendo escrita
        if (isQuickTagWriting(TAG_NAME)) {
            console.log(`[QUICK_BUTTONS] 🚫 ${buttonRole}: TAG está sendo escrita`);
            showQuickButtonToast('⏳ Aguarde! Escrita em andamento.\nTente novamente em alguns segundos.', 3000);
            return;
        }
        
        // ✅ PROTEÇÃO 4: Debounce
        const now = Date.now();
        const lastClick = QUICK_BUTTON_LAST_CLICK.get(buttonRole) || 0;
        const timeSinceLastClick = now - lastClick;
        
        if (timeSinceLastClick < QUICK_BUTTON_MIN_INTERVAL) {
            const remainingSeconds = Math.ceil((QUICK_BUTTON_MIN_INTERVAL - timeSinceLastClick) / 1000);
            console.log(`[QUICK_BUTTONS] ⏸️ ${buttonRole} debounce ativo`);
            showQuickButtonToast(`⏳ Aguarde ${remainingSeconds} segundo${remainingSeconds > 1 ? 's' : ''} e clique novamente!`, 2500);
            return;
        }
        
        // ✅ MARCA como processando
        QUICK_BUTTON_PROCESSING.add(buttonRole);
        QUICK_BUTTON_LAST_CLICK.set(buttonRole, now);
        
        console.log(`[QUICK_BUTTONS] 🎯 ${buttonRole} - Clique AUTORIZADO`);
        
        try {
            console.log(`[QUICK_BUTTONS] Clicado botão bit ${bit} (${button.id})`);
            
            // ✅ Lê estado atual para fazer toggle
            const current = await readWord();
            if (current === null) {
                console.error('[QUICK_BUTTONS] Falha na leitura');
                QUICK_BUTTON_PROCESSING.delete(buttonRole);
                return;
            }
            
            const isCurrentlySet = bitIsSet(current, bit);
            const nextState = !isCurrentlySet;
            
            console.log(`[QUICK_BUTTONS] 🚀 ${buttonRole}: Bit ${bit}: ${isCurrentlySet} → ${nextState}`);
            
            // ✅ ATUALIZA UI IMEDIATAMENTE (feedback instantâneo)
            setButtonVisual(button, nextState);
            button.style.transform = 'scale(0.95)';
            setTimeout(() => { button.style.transform = ''; }, 100);
            
            // ✅ Escreve usando write_word_bit (SERIALIZADO no backend)
            // A função writeWordBit já gerencia a fila e delays
            writeWordBit(TAG_NAME, bit, nextState ? 1 : 0)
                .then(ok => {
                    if (ok) {
                        console.log(`[QUICK_BUTTONS] ✅ Bit ${bit} ${nextState ? 'ativado' : 'desativado'}`);
                        // Sincroniza após 7 segundos (tempo de validação)
                        setTimeout(async () => {
                            await syncButtonStatus();
                        }, 7000);
                    } else {
                        console.error(`[QUICK_BUTTONS] ❌ Falha na escrita do bit ${bit}`);
                        // Reverte o visual em caso de erro
                        setButtonVisual(button, isCurrentlySet);
                        button.style.backgroundColor = '#dc3545';
                        setTimeout(() => {
                            button.style.backgroundColor = '';
                            syncButtonStatus();
                        }, 1000);
                    }
                })
                .catch(e => {
                    console.error('[QUICK_BUTTONS] Erro na escrita:', e);
                    // Reverte o visual em caso de erro
                    setButtonVisual(button, isCurrentlySet);
                    syncButtonStatus();
                })
                .finally(() => {
                    // Libera após 7 segundos (tempo de validação completo)
                    setTimeout(() => {
                        QUICK_BUTTON_PROCESSING.delete(buttonRole);
                        console.log(`[QUICK_BUTTONS] 🔓 ${buttonRole}: Liberado para novo clique`);
                    }, 7000);
                });
            
        } catch (e) {
            console.error('[QUICK_BUTTONS] Erro no clique:', e);
            QUICK_BUTTON_PROCESSING.delete(buttonRole);
            try {
                await syncButtonStatus();
            } catch (syncErr) {
                console.error('[QUICK_BUTTONS] Erro na sincronização:', syncErr);
            }
        }
    }
    
    // Função para sincronizar o status dos botões lendo do PLC
    async function syncButtonStatus() {
        // Não sincroniza se estiver escrevendo (evita conflito)
        if (isWriting) {
            console.log('[QUICK_BUTTONS] Sincronização ignorada - escrita em andamento');
            return;
        }
        
        // Throttle: não sincroniza se foi sincronizado recentemente (menos de 500ms)
        const now = Date.now();
        if (now - lastSyncTime < 500) {
            return;
        }
        
        try {
            const word = await readWord();
            if (word !== null) {
                // Atualiza status visual baseado na leitura do PLC
                const solenoideActive = bitIsSet(word, 0);
                const balancaActive = bitIsSet(word, 1);
                
                setButtonVisual(btnSolenoide, solenoideActive);
                setButtonVisual(btnBalanca, balancaActive);
                
                lastSyncTime = now;
                console.log(`[QUICK_BUTTONS] Status sincronizado: Solenoide=${solenoideActive}, Balança=${balancaActive}`);
            }
        } catch (e) {
            console.error('[QUICK_BUTTONS] Erro na sincronização:', e);
        }
    }

    // Setup listeners
    console.log('[QUICK_BUTTONS] Configurando event listeners...');
    btnSolenoide.addEventListener('click', (e) => {
        e.preventDefault();
        clickBitHandler(btnSolenoide, 0);
    });
    btnBalanca.addEventListener('click', (e) => {
        e.preventDefault();
        clickBitHandler(btnBalanca, 1);
    });

    // Sincroniza estado inicial
    (async function init() {
        try {
            console.log('[QUICK_BUTTONS] Sincronizando estado inicial...');
            await syncButtonStatus();
            console.log('[QUICK_BUTTONS] ✅ Estado inicial sincronizado com sucesso');
        } catch (e) {
            console.error('[QUICK_BUTTONS] Erro na sincronização inicial:', e);
        }
    })();
    
    // Limpa intervalo anterior se existir
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
    
    // Sincroniza periodicamente o status dos botões (a cada 2 segundos)
    syncInterval = setInterval(() => {
        syncButtonStatus();
    }, 2000);
    
    // Limpa o intervalo quando a página é fechada
    window.addEventListener('beforeunload', () => {
        if (syncInterval) {
            clearInterval(syncInterval);
            syncInterval = null;
        }
    });

    quickButtonsInitialized = true;
    console.log('[QUICK_BUTTONS] ✅ Botões rápidos inicializados com sucesso');
}

// Exporta as funções para o escopo global
window.inicializarAlarmes = inicializarAlarmes;
window.toggleAlarmView = toggleAlarmView;
window.carregarAlarmesDoCommMap = carregarAlarmesDoCommMap;
window.startAlarmAutoRefresh = startAlarmAutoRefresh;
window.stopAlarmAutoRefresh = stopAlarmAutoRefresh;
window.inicializarBotoesRapidos = inicializarBotoesRapidos;