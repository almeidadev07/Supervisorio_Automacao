// === alarm.js ===

// Variável para controle de estado
let alarmesInicializados = false;

// Função para inicializar a tela de alarmes
function inicializarAlarmes() {
    if (alarmesInicializados) {
        console.log('Alarmes já inicializados, ignorando chamada duplicada.');
        return;
    }
    
    console.log('Tentando inicializar tela de alarmes...');
    
    // Verifica se o DOM está completamente carregado
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializarAlarmes);
        return;
    }
    
    // Verifique se os elementos existem no DOM
    const viewButtons = document.querySelectorAll('#alarmScreen .view-btn');
    const filterButtons = document.querySelectorAll('#alarmScreen .filtro-btn');
    const alarmList = document.getElementById('alarmList');
    
    if (!alarmList) {
        console.error('Elemento alarmList não encontrado!');
        setTimeout(inicializarAlarmes, 300);
        return;
    }
    
    if (viewButtons.length === 0 || filterButtons.length === 0) {
        console.error('Botões não encontrados! Tentando novamente em 300ms...');
        setTimeout(inicializarAlarmes, 300);
        return;
    }
    
    alarmesInicializados = true;
    console.log('Tela de alarmes inicializada com sucesso!');
    
    // Configura os botões de alternância de visualização
    viewButtons.forEach(btn => {
        console.log('Configurando botão de visualização:', btn.dataset.view);
        btn.addEventListener('click', function() {
            console.log('Clicou em botão de visualização:', this.dataset.view);
            viewButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            carregarAlarmes(this.dataset.view);
        });
    });
    
    // Configura os filtros de prioridade
    filterButtons.forEach(btn => {
        console.log('Configurando botão de filtro:', btn.dataset.prioridade);
        btn.addEventListener('click', function() {
            console.log('Clicou em botão de filtro:', this.dataset.prioridade);
            filterButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            aplicarFiltro(this.dataset.prioridade);
        });
    });
    
    // Carrega os alarmes iniciais
    carregarAlarmes('instantaneos');
}

// Função para carregar os alarmes
function carregarAlarmes(tipo) {
    console.log(`Carregando alarmes ${tipo}...`);
    
    // Simulação de dados de alarmes
    const alarmesInstantaneos = [
        { hora: "10:23:45", descricao: "Falha crítica no sistema", prioridade: "emergencia" },
        { hora: "10:25:12", descricao: "Drive 1 desligado", prioridade: "drives" },
        { hora: "10:30:00", descricao: "Temperatura alta no motor", prioridade: "thermal" },
    ];
    
    const alarmesHistoricos = [
        { hora: "09:15:30", descricao: "Falha de rede", prioridade: "hardware" },
        { hora: "09:20:45", descricao: "Processo interrompido", prioridade: "process" },
        { hora: "08:30:10", descricao: "Erro de comunicação", prioridade: "hardware" },
    ];
    
    // Seleciona a lista de alarmes com base no tipo
    const alarmes = tipo === 'instantaneos' ? alarmesInstantaneos : alarmesHistoricos;
    
    // Atualiza a lista de alarmes na tela
    const alarmList = document.getElementById('alarmList');
    
    if (!alarmList) {
        console.error('Elemento alarmList não encontrado!');
        return;
    }
    
    // Preserva o cabeçalho da tabela
    const headerHtml = `
        <div class="alarm-header">
            <span class="alarm-time">Hora de Ativação</span>
            <span class="alarm-description">Descrição do Alarme</span>
        </div>
    `;
    
    // Gera os itens de alarme
    const alarmeItems = alarmes.map(alarme => `
        <div class="alarme-item" data-prioridade="${alarme.prioridade}">
            <span class="alarm-time">${alarme.hora}</span>
            <span class="alarm-description">${alarme.descricao}</span>
        </div>
    `).join('');
    
    // Atualiza o conteúdo com cabeçalho + itens
    alarmList.innerHTML = headerHtml + alarmeItems;
    
    // Reaplica o filtro atual se houver algum
    const filtroAtual = document.querySelector('#alarmScreen .filtro-btn.active');
    if (filtroAtual) {
        aplicarFiltro(filtroAtual.getAttribute('data-prioridade'));
    }
}

// Função para aplicar filtros de prioridade
function aplicarFiltro(prioridade) {
    console.log(`Aplicando filtro: ${prioridade}`);
    
    // Obtém todos os itens de alarme
    const alarmes = document.querySelectorAll('.alarme-item');
    
    // Aplica o filtro
    alarmes.forEach(alarme => {
        const alarmePrioridade = alarme.getAttribute('data-prioridade');
        if (prioridade === 'todas' || alarmePrioridade === prioridade) {
            alarme.style.display = 'flex'; // Exibe o alarme
        } else {
            alarme.style.display = 'none'; // Oculta o alarme
        }
    });
}

// Exporta as funções necessárias
window.inicializarAlarmes = inicializarAlarmes;
window.carregarAlarmes = carregarAlarmes;
window.aplicarFiltro = aplicarFiltro;

// Tenta inicializar os alarmes quando o script for carregado
console.log('Script de alarmes carregado!');
setTimeout(inicializarAlarmes, 500); // Tenta inicializar após um pequeno atraso