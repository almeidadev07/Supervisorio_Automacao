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

    // Se o grid solicitou uma aba específica, aplica após renderizar
    try {
        const desired = (window.__desiredAlarmTab || '').toLowerCase();
        if (desired) {
            let attempts = 0;
            const maxAttempts = 10;
            const trySelect = () => {
                attempts++;
                if (window.selectAlarmTab) {
                    const ok = window.selectAlarmTab(desired);
                    if (ok || attempts >= maxAttempts) {
                        window.__desiredAlarmTab = '';
                        return;
                    }
                }
                if (attempts < maxAttempts) setTimeout(trySelect, 100);
            };
            setTimeout(trySelect, 50);
        }
    } catch(_) {}
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
        console.log(`[ALARM] Tentando selecionar aba: "${desired}"`);
        
        const buttons = document.querySelectorAll('.filtro-btn');
        if (!buttons || buttons.length === 0) {
            console.log('[ALARM] Botões de filtro não encontrados ainda, aguardando...');
            return false; // Retorna false para indicar que precisa retry
        }
        
        console.log(`[ALARM] ${buttons.length} botões de filtro encontrados`);
        
        // Remove seleção atual
        buttons.forEach(b => b.classList.remove('active'));
        
        // Encontra o botão correspondente
        const btn = Array.from(buttons).find(b => {
            const btnPrioridade = (b.getAttribute('data-prioridade') || '').toLowerCase();
            return btnPrioridade === desired;
        });
        
        if (btn) {
            btn.classList.add('active');
            aplicarFiltro(desired);
            console.log(`[ALARM] ✅ Aba "${desired}" selecionada com sucesso`);
            return true;
        } else {
            console.log(`[ALARM] ⚠️ Aba "${desired}" não encontrada, usando fallback "todas"`);
            // Fallback para 'todas'
            const allBtn = Array.from(buttons).find(b => (b.getAttribute('data-prioridade') || '').toLowerCase() === 'todas');
            if (allBtn) {
                allBtn.classList.add('active');
                aplicarFiltro('todas');
                console.log('[ALARM] ✅ Fallback para aba "todas" aplicado');
                return true;
            } else {
                console.error('[ALARM] ❌ Nenhuma aba encontrada, nem mesmo "todas"');
                return false;
            }
        }
    } catch (err) {
        console.error('[ALARM] Erro ao selecionar aba:', err);
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

// Exporta as funções para o escopo global
window.inicializarAlarmes = inicializarAlarmes;
window.toggleAlarmView = toggleAlarmView;
window.carregarAlarmesDoCommMap = carregarAlarmesDoCommMap;
window.startAlarmAutoRefresh = startAlarmAutoRefresh;
window.stopAlarmAutoRefresh = stopAlarmAutoRefresh;
window.inicializarBotoesRapidos = inicializarBotoesRapidos;