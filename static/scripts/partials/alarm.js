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
        { hora: "14:38", descricao: "Temperatura alta", prioridade: "thermal" }
    ] : [
        { hora: "13:15", descricao: "Histórico: Falha de rede", prioridade: "hardware" },
        { hora: "12:20", descricao: "Histórico: Processo interrompido", prioridade: "process" },
        { hora: "11:30", descricao: "Histórico: Erro de comunicação", prioridade: "hardware" }
    ];

    // Gera o HTML dos alarmes
    const alarmeItems = alarmes.map(alarme => `
        <div class="alarme-item ${alarme.prioridade}">
            <span class="alarm-time">${alarme.hora}</span>
            <span class="alarm-description">${alarme.descricao}</span>
        </div>
    `).join('');

    // Atualiza a lista mantendo o cabeçalho
    alarmList.innerHTML = `
        <div class="alarm-header">
            <span class="alarm-time">Hora de Ativação</span>
            <span class="alarm-description">Descrição do Alarme</span>
        </div>
        ${alarmeItems}
    `;

    // Reaplica o filtro atual
    const filtroAtivo = document.querySelector('.filtro-btn.active');
    if (filtroAtivo) {
        aplicarFiltro(filtroAtivo.dataset.prioridade);
    }
}

// Exporta a função para o escopo global
window.inicializarAlarmes = inicializarAlarmes;