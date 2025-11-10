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
                    date: event.date || (event.full_timestamp ? new Date(event.full_timestamp).toLocaleDateString('pt-BR') : ''),
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
    try {
        // Ordena do mais recente para o mais antigo usando full_timestamp (ISO) quando disponível
        if (Array.isArray(currentAlarms)) {
            currentAlarms.sort((a, b) => {
                const ta = (a && a.full_timestamp) ? a.full_timestamp : '';
                const tb = (b && b.full_timestamp) ? b.full_timestamp : '';
                if (ta && tb) return tb.localeCompare(ta);
                // Fallback: mantém ordem atual se não houver timestamps ISO
                return 0;
            });
        }
    } catch (e) {
        console.warn('[ALARM] Falha ao ordenar alarmes no frontend:', e);
    }
    
    if (currentAlarms.length === 0) {
        alarmList.innerHTML = `
            <div class="alarm-header">
                <span></span>
                <span>Data</span>
                <span>Hora</span>
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
                <span class="alarm-date">${alarme.date || ''}</span>
                <span class="alarm-time">${alarme.timestamp || '--:--'}</span>
                <span class="alarm-description">${alarme.description}</span>
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

    // Atualiza indicadores nas abas
    atualizarIndicadoresAbas();
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
    
    alarmList.innerHTML = `
        <div class="alarm-header">
            <span></span>
            <span>Data</span>
            <span>Hora</span>
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
                    atualizarIndicadoresAbas();
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
        const buttons = document.querySelectorAll('.filtro-btn');
        if (!buttons || buttons.length === 0) {
            // Tenta novamente após a UI estar pronta
            setTimeout(() => window.selectAlarmTab(prioridade), 100);
            return;
        }
        // Remove seleção atual
        buttons.forEach(b => b.classList.remove('active'));
        // Encontra o botão correspondente
        const btn = Array.from(buttons).find(b => (b.getAttribute('data-prioridade') || '').toLowerCase() === desired);
        if (btn) {
            btn.classList.add('active');
            aplicarFiltro(desired);
        } else {
            // Fallback para 'todas'
            const allBtn = Array.from(buttons).find(b => (b.getAttribute('data-prioridade') || '').toLowerCase() === 'todas');
            if (allBtn) {
                allBtn.classList.add('active');
                aplicarFiltro('todas');
            }
        }
    } catch (_) {
        // silencioso
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

    async function writeWord(newValue) {
        try {
            console.log(`[QUICK_BUTTONS] Escrevendo valor: ${newValue} (0x${newValue.toString(16).toUpperCase()})`);
            const res = await fetch('/api/write_tags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [TAG_NAME]: newValue })
            });
            const data = await res.json();
            console.log('[QUICK_BUTTONS] Resposta da escrita:', data);
            return !!(data && data.ok);
        } catch (e) {
            console.error('[QUICK_BUTTONS] Erro na escrita:', e);
            return false;
        }
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

    async function toggleBitHandler(button, bit) {
        try {
            console.log(`[QUICK_BUTTONS] Toggle bit ${bit} (${button.id})`);
            
            // Desabilita o botão temporariamente para evitar cliques múltiplos
            button.disabled = true;
            
            const current = await readWord();
            if (current === null) {
                console.error('[QUICK_BUTTONS] Falha na leitura - não é possível continuar');
                button.disabled = false;
                return;
            }
            
            const shouldActivate = !bitIsSet(current, bit);
            const nextValue = setBit(current, bit, shouldActivate);
            
            console.log(`[QUICK_BUTTONS] Valor atual: ${current} (0x${current.toString(16).toUpperCase()})`);
            console.log(`[QUICK_BUTTONS] Próximo valor: ${nextValue} (0x${nextValue.toString(16).toUpperCase()})`);
            console.log(`[QUICK_BUTTONS] Ação: ${shouldActivate ? 'ATIVAR' : 'DESATIVAR'} bit ${bit}`);
            
            const ok = await writeWord(nextValue);
            if (ok) {
                setButtonVisual(button, shouldActivate);
                console.log(`[QUICK_BUTTONS] ✅ Bit ${bit} ${shouldActivate ? 'ativado' : 'desativado'} com sucesso`);
            } else {
                console.error('[QUICK_BUTTONS] ❌ Falha na escrita do bit ${bit}');
                // Mostra feedback visual de erro
                button.style.backgroundColor = '#dc3545';
                setTimeout(() => {
                    button.style.backgroundColor = '';
                }, 1000);
            }
        } catch (e) {
            console.error('[QUICK_BUTTONS] Erro no toggle:', e);
        } finally {
            button.disabled = false;
        }
    }

    // Setup listeners
    console.log('[QUICK_BUTTONS] Configurando event listeners...');
    btnSolenoide.addEventListener('click', (e) => {
        e.preventDefault();
        toggleBitHandler(btnSolenoide, 0);
    });
    btnBalanca.addEventListener('click', (e) => {
        e.preventDefault();
        toggleBitHandler(btnBalanca, 1);
    });

    // Sincroniza estado inicial
    (async function init() {
        try {
            console.log('[QUICK_BUTTONS] Sincronizando estado inicial...');
            const word = await readWord();
            if (word !== null) {
                setButtonVisual(btnSolenoide, bitIsSet(word, 0));
                setButtonVisual(btnBalanca, bitIsSet(word, 1));
                console.log('[QUICK_BUTTONS] ✅ Estado inicial sincronizado com sucesso');
            } else {
                console.error('[QUICK_BUTTONS] ❌ Falha na sincronização inicial');
            }
        } catch (e) {
            console.error('[QUICK_BUTTONS] Erro na sincronização inicial:', e);
        }
    })();

    quickButtonsInitialized = true;
    console.log('[QUICK_BUTTONS] ✅ Botões rápidos inicializados com sucesso');
}

// Exporta a função para o escopo global
window.inicializarAlarmes = inicializarAlarmes;
window.carregarAlarmesDoCommMap = carregarAlarmesDoCommMap;
window.startAlarmAutoRefresh = startAlarmAutoRefresh;
window.stopAlarmAutoRefresh = stopAlarmAutoRefresh;
window.inicializarBotoesRapidos = inicializarBotoesRapidos;