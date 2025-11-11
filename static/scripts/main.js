// Função para carregar scripts dinamicamente ///
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
    const containers = [
        'grid-container',
        'alarm-container',
        'weight-range-container',
        'balance-container',
        'classification-container',
        'input-container',
        'washer-container',
        'dryer-container',
        'windows-container', // Adicionar windows-container
        'diagram-container',
        'graphics-container' // Adicionar graphics-container
    ];
    containers.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

// Função para exibir o grid
function showGrid(event) {
    hideAllContainers();
    const grid = document.getElementById('grid-container');
    if (grid) grid.style.display = 'block';

    // Parar atualização de alarmes ao sair da tela de alarmes
    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    // Só marca como ativo se a origem do clique for um botão de menu
    if (event && event.currentTarget && event.currentTarget.classList && event.currentTarget.classList.contains('menu-btn')) {
        event.currentTarget.classList.add('active');
    }
    
    // Iniciar atualização de data/hora quando mostrar o grid
    if (window.startDateTimeUpdate) {
        window.startDateTimeUpdate();
    }
}

// Função para exibir gráficos
function showGraphics(event) {
    hideAllContainers();
    const graphics = document.getElementById('graphics-container');
    if (graphics) graphics.style.display = 'block';

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    // Marca ativo somente quando for clique em botão do menu
    if (event && event.currentTarget && event.currentTarget.classList && event.currentTarget.classList.contains('menu-btn')) {
        event.currentTarget.classList.add('active');
    }

    // Inicializa gráficos se necessário
    if (typeof window.initGraphics === 'function') {
        const chart = window.classesChart;
        // Evita re-inicializar se já existe um gráfico válido
        if (!chart || (chart && chart._destroyed)) {
            window.initGraphics();
        } else {
            // Tenta atualizar de forma segura após ficar visível
            try {
                if (typeof chart.update === 'function') {
                    chart.update('none');
                } else {
                    // Se não houver update, re-inicializa
                    window.initGraphics();
                }
            } catch (e) {
                console.warn('Falha ao atualizar o gráfico. Reinicializando...', e);
                window.initGraphics();
            }
        }
    } else {
        console.error('Função initGraphics não encontrada!');
    }
}

// Função para exibir o conteúdo do alarme
function showAlarm(event) {
    hideAllContainers();
    const alarm = document.getElementById('alarm-container');
    if (alarm) alarm.style.display = 'block';

    // Remove active de todos os botões do menu
    document.querySelectorAll('.menu-btn').forEach(btn => {
        if (btn && btn.classList) {
            btn.classList.remove('active');
        }
    });
    
    // Adiciona active apenas se o currentTarget for um botão do menu válido
    if (event && event.currentTarget && event.currentTarget.classList) {
        const isMenuBtn = event.currentTarget.classList.contains('menu-btn') || 
                         event.currentTarget.closest('.menu-btn');
        if (isMenuBtn) {
            const menuBtn = event.currentTarget.classList.contains('menu-btn') 
                ? event.currentTarget 
                : event.currentTarget.closest('.menu-btn');
            if (menuBtn && menuBtn.classList) {
                menuBtn.classList.add('active');
            }
        }
    }

    if (window.inicializarAlarmes) {
        window.inicializarAlarmes();
    }

    // Inicializar botões rápidos de comunicação com PLC
    if (window.inicializarBotoesRapidos) {
        window.inicializarBotoesRapidos();
    }

    // Iniciar atualização automática dos alarmes quando a tela estiver visível
    if (window.startAlarmAutoRefresh) {
        window.startAlarmAutoRefresh();
    }

    // Seleciona a aba desejada APÓS garantir que o DOM está pronto e os botões existem
    // Aguarda um pouco mais para garantir que inicializarAlarmes() terminou de configurar os botões
    const selectDesiredTab = () => {
        try {
            let desired = (window.__desiredAlarmTab || '').toLowerCase();
            if (!desired && window.location && window.location.hash && window.location.hash.startsWith('#alarms-')) {
                desired = window.location.hash.replace('#alarms-', '').toLowerCase();
            }
            if (desired && typeof window.selectAlarmTab === 'function') {
                console.log(`[SHOW_ALARM] Tentando selecionar aba: "${desired}"`);
                const ok = window.selectAlarmTab(desired);
                if (ok) {
                    window.__desiredAlarmTab = '';
                    try { if (window.location && window.location.hash) window.location.hash = ''; } catch(_) {}
                    console.log(`[SHOW_ALARM] ✅ Aba "${desired}" selecionada com sucesso`);
                    return true;
                } else {
                    console.log(`[SHOW_ALARM] ⚠️ Primeira tentativa falhou, tentando novamente...`);
                    return false;
                }
            }
        } catch(err) {
            console.error('[SHOW_ALARM] Erro ao selecionar aba:', err);
        }
        return false;
    };
    
    // Tenta selecionar após um pequeno delay para garantir que os botões estão prontos
    requestAnimationFrame(() => {
        setTimeout(() => {
            if (!selectDesiredTab()) {
                // Retry rápido se os botões ainda não estiverem prontos
                let attempts = 0;
                const maxAttempts = 50; // Aumentado para dar mais tempo
                const retry = () => {
                    attempts++;
                    if (selectDesiredTab()) {
                        return; // Sucesso, para de tentar
                    }
                    if (attempts < maxAttempts) {
                        setTimeout(retry, 30); // Aumentado para 30ms
                    } else {
                        console.warn(`[SHOW_ALARM] ⚠️ Não foi possível selecionar aba após ${maxAttempts} tentativas`);
                    }
                };
                setTimeout(retry, 50); // Delay inicial maior
            }
        }, 50); // Delay inicial aumentado
    });
}

function showWeightRange(event) {
    hideAllContainers();
    const weightContainer = document.getElementById('weight-range-container');
    if (weightContainer) weightContainer.style.display = 'block';

    // Parar atualização de alarmes ao sair da tela de alarmes
    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

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

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
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

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
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

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    if (typeof inicializarInput === 'function') {
        inicializarInput();
    }
}

// ✅ Exibe a tela da lavadora
function showWasher(event) {
    hideAllContainers();
    const washerContainer = document.getElementById('washer-container');
    if (washerContainer) {
        washerContainer.style.display = 'block';
    }

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    
    // Inicializa o washer se ainda não foi inicializado
    if (typeof window.inicializarWasher === 'function' && !window.washerInitialized) {
        console.log('🔧 Inicializando sistema Washer...');
        window.inicializarWasher();
        window.washerInitialized = true; // Evita reinicializar
    }
}

// ✅ Exibe a tela da secadora
function showDryer(event) {
    hideAllContainers();
    const dryerContainer = document.getElementById('dryer-container');
    if (dryerContainer) {
        dryerContainer.style.display = 'block';
    }

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    if (typeof window.inicializarDryer === 'function' && !window.dryerInitialized) {
        console.log('🔧 Inicializando sistema Dryer...');
        window.inicializarDryer();
        window.dryerInitialized = true;
    }
}

// Função para exibir a tela de diagramas
function showDiagram(event) {
    hideAllContainers();
    const diagramContainer = document.getElementById('diagram-container');
    if (diagramContainer) {
        diagramContainer.style.display = 'block';
    }

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    
    // A inicialização agora acontece aqui, se ainda não tiver sido feita.
    // A verificação 'typeof window.inicializarDiagrama' garante que o script já carregou.
    if (typeof window.inicializarDiagrama === 'function' && !window.diagramInitialized) {
        window.inicializarDiagrama();
        window.diagramInitialized = true; // Evita reinicializar
    }
}

// 1. Adicione esta função ao seu main.js
function showWindows(event) {
    hideAllContainers();
    const windowsContainer = document.getElementById('windows-container');
    if (windowsContainer) {
        windowsContainer.style.display = 'block';
    }

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    
    // Inicializa o sistema Windows se ainda não foi inicializado
    if (typeof window.inicializarWindows === 'function' && !window.windowsInitialized) {
        console.log('🎯 Inicializando sistema Windows...');
        window.inicializarWindows();
        window.windowsInitialized = true; // Evita reinicializar
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
    loadScript('/static/scripts/partials/washer.js'), // ✅ Script da lavadora
    loadScript('/static/scripts/partials/dryer.js'), // ✅ Script da secadora
    loadScript('/static/scripts/partials/diagram.js'), 
    loadScript('/static/scripts/partials/windows.js'),
    loadScript('/static/scripts/partials/graphics.js')

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

    // Remova ou comente esta linha:
    // if (typeof inicializarWasher === 'function') {
    //     inicializarWasher();
    // }

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
window.showDryer = showDryer;   // ✅ Exportação global da função da secadora
window.showDiagram = showDiagram;
window.showWindows = showWindows;


