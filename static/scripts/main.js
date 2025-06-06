// Função para carregar scripts dinamicamente
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
            console.log(`Script ${src} carregado com sucesso!`);
            resolve();
        };
        script.onerror = () => reject(new Error(`Erro ao carregar ${src}`));
        document.head.appendChild(script);
    });
}

function showWeightRange() {
    console.log('Mostrando tela de faixa de peso...'); // Debug
    
    // Oculta outros containers
    document.getElementById('grid-container').style.display = 'none';
    document.getElementById('alarm-container').style.display = 'none';
    
    // Mostra o container de faixa de peso
    const weightContainer = document.getElementById('weight-range-container');
    if (weightContainer) {
        weightContainer.style.display = 'block';
    } else {
        console.error('Container weight-range-container não encontrado!');
    }
    
    // Atualiza botão ativo no menu
    document.querySelectorAll('.menu-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    // Inicializa se necessário
    if (typeof inicializarWeightRange === 'function') {
        inicializarWeightRange();
    } else {
        console.error('Função inicializarWeightRange não encontrada!');
    }
}



function hideAllContainers() {
    // Hide all main containers
    const containers = [
        'grid-container',
        'alarm-container',
        'weight-range-container',
        'balance-container',
        'classification-container',
        'input-container',
        'washer-container' // Adicionado para garantir ocultação da lavadora

    ];
    containers.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Hide all modals
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.style.display = 'none';
        modal.classList.remove('show');
    });

    // Reset any active states
    document.querySelectorAll('.active').forEach(element => {
        element.classList.remove('active');
    });
}

// Função para exibir o grid
function showGrid(event) {
    hideAllContainers();
    const grid = document.getElementById('grid-container');
    if (grid) grid.style.display = 'block';

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }
}

// Função para exibir o conteúdo do alarme
function showAlarm(event) {
    hideAllContainers();
    const alarm = document.getElementById('alarm-container');
    if (alarm) alarm.style.display = 'block';

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    if (window.inicializarAlarmes) {
        window.inicializarAlarmes();
    }
}

function showWeightRange(event) {
    hideAllContainers();
    const weightContainer = document.getElementById('weight-range-container');
    if (weightContainer) weightContainer.style.display = 'block';

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    if (typeof inicializarWeightRange === 'function') {
        inicializarWeightRange();
    }
}

function showBalance(event) {
    hideAllContainers();
    const balanceContainer = document.getElementById('balance-container');
    if (balanceContainer) balanceContainer.style.display = 'block';

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
        zoomButton(event.currentTarget);
    }

    if (typeof inicializarBalance === 'function') {
        inicializarBalance();
    }
}

function showClassification(event) {
    hideAllContainers();
    const classificationContainer = document.getElementById('classification-container');
    if (classificationContainer) {
        classificationContainer.style.display = 'block';
        classificationContainer.style.zIndex = '1';
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    if (typeof inicializarClassification === 'function') {
        inicializarClassification();
    }
}

function showInput(event) {
    hideAllContainers();
    const inputContainer = document.getElementById('input-container');
    if (inputContainer) inputContainer.style.display = 'block';

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
        zoomButton(event.currentTarget);
    }

    if (typeof inicializarInput === 'function') {
        inicializarInput();
    }
}

// ✅ Exibe a tela da lavadora
function showWasher(event) {
    hideAllContainers();
    const washerContainer = document.getElementById('washer-container');
    if (washerContainer) washerContainer.style.display = 'block';

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    if (typeof inicializarWasher === 'function') {
        inicializarWasher();
    }
}


// Carregar os scripts de forma assíncrona
Promise.all([
    loadScript('/static/scripts/partials/menu.js'),
    loadScript('/static/scripts/partials/grid.js'),
    loadScript('/static/scripts/partials/alarm.js'),
    loadScript('/static/scripts/partials/weight_range.js'),
    loadScript('/static/scripts/partials/balance.js'),
    loadScript('/static/scripts/partials/classification.js'),
    loadScript('/static/scripts/partials/login.js'),  // Caminho atualizado para partials
    loadScript('/static/scripts/partials/input.js'),  // Caminho atualizado para partials
    loadScript('/static/scripts/partials/washer.js') // ✅ Script da lavadora


])
.then(() => {
    console.log('Todos os scripts carregados com sucesso!');
    
    // Verificar se a função do velocímetro existe antes de chamá-la
    if (typeof inicializarVelocimetro === 'function') {
        inicializarVelocimetro();
    } else {
        console.warn('Função inicializarVelocimetro não encontrada!');
    }
    
    // Inicializar alarmes se a função existir
    if (typeof window.inicializarAlarmes === 'function') {
        console.log('Inicializando alarmes após carregamento de scripts');
        window.inicializarAlarmes();
    } else {
        console.error('Função inicializarAlarmes não disponível após carregamento!');
    }

    // Initialize weight range if function exists
    if (typeof inicializarWeightRange === 'function') {
        inicializarWeightRange();
    }

    // Initialize inicializarBalance if function exists
    if (typeof inicializarBalance === 'function') {
        inicializarBalance();
    }

    // Initialize inicializarBalance if function exists
    if (typeof inicializarBalance === 'function') {
        inicializarClassification();
    }

    if (typeof inicializarInput === 'function') {
        inicializarInput();
    }

    if (typeof inicializarWasher === 'function') {
        inicializarWasher();
    }

})
.catch(error => console.error('Erro ao carregar scripts:', error));


document.addEventListener('DOMContentLoaded', function() {
    showGrid(); // Ensure the grid is displayed correctly on initial load
});
// Exporta funções para o escopo global
window.showGrid = showGrid;
window.showAlarm = showAlarm;
window.showWeightRange = showWeightRange;
window.showBalance = showBalance;
window.showClassification = showClassification;
window.showInput = showInput;
window.showWasher = showWasher; // ✅ Exportação global da função da lavadora
