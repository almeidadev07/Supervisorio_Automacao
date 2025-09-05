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
    
    // Carrega os alarmes iniciais
    carregarAlarmes('instantaneos');
}

function toggleAlarmView(button) {
    const currentState = button.getAttribute('data-state');
    const toggleText = button.querySelector('.toggle-text');
    
    if (currentState === 'instantaneos') {
        button.setAttribute('data-state', 'historicos');
        toggleText.textContent = 'Histórico';
        carregarAlarmes('historicos');
    } else {
        button.setAttribute('data-state', 'instantaneos');
        toggleText.textContent = 'Instantâneo';
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

function carregarAlarmes(tipo) {
    console.log(`Carregando alarmes ${tipo}...`);
    const alarmList = document.getElementById('alarmList');
    
    // Dados simulados para cada tipo
    const alarmes = tipo === 'instantaneos' ? [
        { hora: "14:32", descricao: "Falha no Motor Principal", prioridade: "emergency" },
        { hora: "14:35", descricao: "Drive 1 com erro", prioridade: "drives" },
        { hora: "14:38", descricao: "Temperatura alta", prioridade: "thermal" },
        { hora: "14:40", descricao: "Erro de Comunicação com PLC", prioridade: "hardware" },
        { hora: "14:42", descricao: "Processo interrompido", prioridade: "process" }
    ] : [
        { hora: "13:15", descricao: "Histórico: Falha de rede", prioridade: "hardware" },
        { hora: "12:20", descricao: "Histórico: Processo interrompido", prioridade: "process" },
        { hora: "11:30", descricao: "Histórico: Erro de comunicação", prioridade: "hardware" },
        { hora: "10:45", descricao: "Histórico: Motor travado", prioridade: "emergency" },
        { hora: "09:20", descricao: "Histórico: Drive com falha", prioridade: "drives" }
    ];

    // Gera o HTML dos alarmes
    const alarmeItems = alarmes.map(alarme => `
        <div class="alarme-item ${alarme.prioridade}">
            <div class="alarm-type-dot ${alarme.prioridade}"></div>
            <span class="alarm-time">${alarme.hora}</span>
            <span class="alarm-description">${alarme.descricao}</span>
        </div>
    `).join('');

    // Atualiza a lista mantendo o cabeçalho
    alarmList.innerHTML = `
        <div class="alarm-header">
            <span></span>
            <span>Hora de Ativação</span>
            <span>Descrição do Alarme</span>
        </div>
        ${alarmeItems}
    `;

    // Reaplica o filtro atual
    const filtroAtivo = document.querySelector('.filtro-btn.active');
    if (filtroAtivo) {
        aplicarFiltro(filtroAtivo.dataset.prioridade);
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