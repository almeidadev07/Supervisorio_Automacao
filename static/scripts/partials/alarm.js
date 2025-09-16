let alarmesInicializados = false;

function inicializarAlarmes() {
    if (alarmesInicializados) {
        console.log('Alarmes já inicializados!');
        return;
    }

    console.log('Tentando inicializar tela de alarmes...');
    
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
    
    // Configura os filtros de prioridade
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

    alarmesInicializados = true;
    console.log('Tela de alarmes inicializada com sucesso!');
    
    // Inicializa SocketIO para alarmes em tempo real
    inicializarSocketAlarmes();
    
    // Carrega os alarmes iniciais
    carregarAlarmes('instantaneos');
}

function toggleAlarmView(button) {
    const currentState = button.getAttribute('data-state');
    const toggleText = button.querySelector('.toggle-text');
    
    if (currentState === 'instantaneos') {
        button.setAttribute('data-state', 'historicos');
        toggleText.textContent = 'Histórico';
        currentViewMode = 'historicos';
        // Para o polling automático quando em histórico
        stopAlarmAutoRefresh();
        // Força recarregamento do histórico
        carregarAlarmesHistoricos();
    } else {
        button.setAttribute('data-state', 'instantaneos');
        toggleText.textContent = 'Instantâneo';
        currentViewMode = 'instantaneos';
        // Reinicia o polling quando volta para instantâneo
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

function carregarAlarmesHistoricos() {
    console.log('Carregando histórico de alarmes...');
    
    // Carrega histórico real via API
    fetch('/api/alarms/history?limit=200')
        .then(response => response.json())
        .then(data => {
            if (data.ok && data.history) {
                console.log(`[ALARM] ${data.history.length} eventos de histórico carregados`);
                
                // Converte eventos do histórico para o mesmo formato da lista ativa
                const alarmes = data.history.map(event => ({
                    id: event.id,
                    var_name: event.var_name || '',
                    bit_index: event.bit_index || 0,
                    description: `${event.action === 'activated' ? 'ATIVADO' : 'LIMPO'}: ${event.description}`,
                    priority: event.priority,
                    type: event.type,
                    machine: event.machine,
                    timestamp: event.timestamp,
                    active: event.action === 'activated'
                }));
                
                currentAlarms = alarmes;
                atualizarInterfaceAlarmes();
            } else {
                console.log('[ALARM] Nenhum histórico disponível ou erro na API:', data.error);
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
    if (!alarmList) return;
    
    if (currentAlarms.length === 0) {
        alarmList.innerHTML = `
            <div class="alarm-header">
                <span></span>
                <span>Hora de Ativação</span>
                <span>Descrição do Alarme</span>
            </div>
            <div class="no-alarms">
                <span>Nenhum alarme ativo</span>
            </div>
        `;
    } else {
        // Gera o HTML dos alarmes
        const alarmeItems = currentAlarms.map(alarme => {
            const prioridade = normalizarPrioridade(alarme);
            return `
            <div class="alarme-item ${prioridade}">
                <div class="alarm-type-dot ${prioridade}"></div>
                <span class="alarm-time">${alarme.timestamp || '--:--'}</span>
                <span class="alarm-description">${alarme.description}</span>
            </div>`;
        }).join('');

        // Atualiza a lista mantendo o cabeçalho
        alarmList.innerHTML = `
            <div class="alarm-header">
                <span></span>
                <span>Hora de Ativação</span>
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
        console.log('[ALARM] Resumo dos alarmes:', summary);
        // Aqui você pode atualizar elementos da UI com os contadores
        // Por exemplo, se houver elementos com classes como .alarm-count-emergency, etc.
    }
}

function mostrarMensagemErroAlarmes() {
    const alarmList = document.getElementById('alarmList');
    if (!alarmList) return;
    
    alarmList.innerHTML = `
        <div class="alarm-header">
            <span></span>
            <span>Hora de Ativação</span>
            <span>Descrição do Alarme</span>
        </div>
        <div class="alarm-error">
            <span>Erro ao carregar alarmes do PLC</span>
        </div>
    `;
}

// Inicializa SocketIO para receber alarmes em tempo real
function inicializarSocketAlarmes() {
    if (alarmSocket) return; // Já inicializado
    
    try {
        alarmSocket = io();
        
        alarmSocket.on('telemetry', (data) => {
            if (data && data.active_alarms) {
                console.log('[ALARM] Alarmes recebidos via SocketIO:', data.active_alarms.length);
                // Só atualiza se estiver no modo instantâneo
                if (currentViewMode === 'instantaneos') {
                    currentAlarms = data.active_alarms;
                    atualizarInterfaceAlarmes();
                    atualizarContadoresAlarmes(data.alarm_summary);
                }
            }
        });
        
        alarmSocket.on('plc_connection_changed', (data) => {
            if (data && data.connected) {
                console.log('[ALARM] PLC conectado, recarregando alarmes...');
                if (currentViewMode === 'instantaneos') {
                    carregarAlarmesReais();
                }
            } else {
                console.log('[ALARM] PLC desconectado, limpando alarmes...');
                if (currentViewMode === 'instantaneos') {
                    currentAlarms = [];
                    atualizarInterfaceAlarmes();
                }
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

// Exporta a função para o escopo global
window.inicializarAlarmes = inicializarAlarmes;
window.carregarAlarmesDoCommMap = carregarAlarmesDoCommMap;
window.startAlarmAutoRefresh = startAlarmAutoRefresh;
window.stopAlarmAutoRefresh = stopAlarmAutoRefresh;