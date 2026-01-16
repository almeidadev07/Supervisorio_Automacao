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

// =========================
// Persistência da última tela aberta
// =========================
const LAST_SCREEN_KEY = 'supervisor_last_screen';

function setLastScreen(screenName) {
    try {
        localStorage.setItem(LAST_SCREEN_KEY, screenName);
    } catch (e) {
        console.warn('Não foi possível salvar última tela no localStorage:', e);
    }
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
        'graphics-container', // Adicionar graphics-container
        'viewer3d-container', // Adicionar viewer3d-container
        'samples-container', // Adicionar samples-container
        'panels-container', // Adicionar panels-container
        'solenoids-container' // Adicionar solenoids-container
    ];
    containers.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'none';
            el.style.visibility = 'hidden';
        }
    });
    
    // ✅ CRÍTICO: Cleanup de TODAS as telas quando sair (evita vazamento de memória)
    // Cleanup da tela de balança
    if (typeof window.cleanupBalance === 'function') {
        try {
            window.cleanupBalance();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de balança:', e);
        }
    }
    
    // Cleanup da tela de classificação
    if (typeof window.cleanupClassification === 'function') {
        try {
            window.cleanupClassification();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de classificação:', e);
        }
    }
    
    // Cleanup da tela de gráficos
    if (typeof window.cleanupGraphics === 'function') {
        try {
            window.cleanupGraphics();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de gráficos:', e);
        }
    }
    
    // Cleanup da tela de entrada
    if (typeof window.cleanupInput === 'function') {
        try {
            window.cleanupInput();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de entrada:', e);
        }
    }
    
    // Cleanup da tela de lavadora
    if (typeof window.cleanupWasher === 'function') {
        try {
            window.cleanupWasher();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de lavadora:', e);
        }
    }
    
    // Cleanup da tela de secadora
    if (typeof window.cleanupDryer === 'function') {
        try {
            window.cleanupDryer();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de secadora:', e);
        }
    }
    
    // Cleanup da tela de diagrama
    if (typeof window.cleanupDiagram === 'function') {
        try {
            window.cleanupDiagram();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de diagrama:', e);
        }
    }
    
    // Cleanup da tela de janelas
    if (typeof window.cleanupWindows === 'function') {
        try {
            window.cleanupWindows();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de janelas:', e);
        }
    }
    
    // Cleanup da tela de visualizador 3D
    if (typeof window.cleanupViewer3D === 'function') {
        try {
            window.cleanupViewer3D();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de visualizador 3D:', e);
        }
    }
    
    // Cleanup da tela de faixa de peso
    if (typeof window.cleanupWeightRange === 'function') {
        try {
            window.cleanupWeightRange();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de faixa de peso:', e);
        }
    }
    
    // Cleanup da tela de alarmes
    if (typeof window.cleanupAlarm === 'function') {
        try {
            window.cleanupAlarm();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de alarmes:', e);
        }
    }
    
    // Cleanup da tela de amostras
    if (typeof window.cleanupSamples === 'function') {
        try {
            window.cleanupSamples();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de amostras:', e);
        }
    }
    
    // Cleanup da tela de solenoides
    if (typeof window.cleanupSolenoids === 'function') {
        try {
            window.cleanupSolenoids();
        } catch (e) {
            console.warn('Erro ao fazer cleanup da tela de solenoides:', e);
        }
    }
    
    // ✅ NOTA: NÃO resetamos as flags de inicialização aqui
    // As telas técnicas (washer, dryer, etc) verificam suas flags para evitar re-inicialização
    // Os intervalos são limpos pelo cleanup, mas os event listeners permanecem ativos
}

// Função para exibir o grid
function showGrid(event) {
    setLastScreen('grid');
    hideAllContainers();
    const grid = document.getElementById('grid-container');
    if (grid) {
        grid.style.display = 'block';
        grid.style.visibility = 'visible';
    }

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
    
    // ✅ Garante que subscription seja ativada quando tela inicial (grid) for aberta
    // O grid também tem um mini-gráfico que precisa dos dados
    if (typeof window.checkGraphicsSubscription === 'function') {
        setTimeout(() => window.checkGraphicsSubscription(), 100);
    }
}

// Função para exibir gráficos
function showGraphics(event) {
    setLastScreen('graphics');
    hideAllContainers();
    const graphics = document.getElementById('graphics-container');
    if (graphics) {
        graphics.style.display = 'block';
        graphics.style.visibility = 'visible';
    }

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
    
    // ✅ Garante que subscription seja ativada quando tela de gráficos for aberta
    if (typeof window.checkGraphicsSubscription === 'function') {
        setTimeout(() => window.checkGraphicsSubscription(), 100);
    }
}

// Função para exibir o conteúdo do alarme
function showAlarm(event) {
    setLastScreen('alarm');
    hideAllContainers();
    const alarm = document.getElementById('alarm-container');
    if (alarm) {
        alarm.style.display = 'block';
        alarm.style.visibility = 'visible';
    }

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
    setLastScreen('weight');
    hideAllContainers();
    const weightContainer = document.getElementById('weight-range-container');
    if (weightContainer) {
        weightContainer.style.display = 'block';
        weightContainer.style.visibility = 'visible';
    }

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
    setLastScreen('balance');
    hideAllContainers();
    const balanceContainer = document.getElementById('balance-container');
    if (balanceContainer) {
        balanceContainer.style.display = 'block';
        balanceContainer.style.visibility = 'visible';
    }

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
    setLastScreen('classification');
    hideAllContainers();
    const classificationContainer = document.getElementById('classification-container');
    if (classificationContainer) {
        classificationContainer.style.display = 'block';
        classificationContainer.style.visibility = 'visible';
        classificationContainer.style.zIndex = '1';
    }

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    // ✅ CRÍTICO: Evita múltiplas inicializações (causa vazamento de memória)
    // Só inicializa se ainda não foi inicializada ou se foi limpa
    if (typeof inicializarClassification === 'function') {
        // Verifica se já foi inicializada (flag global)
        if (!window._classificationInitialized) {
            inicializarClassification();
            window._classificationInitialized = true;
        } else {
            // Se já foi inicializada, apenas reativa (sem criar novos timers/listeners)
            console.log('[MAIN] Tela de classificação já inicializada, pulando re-inicialização');
        }
    }
}

function showInput(event) {
    setLastScreen('input');
    hideAllContainers();
    const inputContainer = document.getElementById('input-container');
    if (inputContainer) {
        inputContainer.style.display = 'block';
        inputContainer.style.visibility = 'visible';
    }

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
    setLastScreen('washer');
    hideAllContainers();
    const washerContainer = document.getElementById('washer-container');
    if (washerContainer) {
        washerContainer.style.display = 'block';
        washerContainer.style.visibility = 'visible';
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
    setLastScreen('dryer');
    hideAllContainers();
    const dryerContainer = document.getElementById('dryer-container');
    if (dryerContainer) {
        dryerContainer.style.display = 'block';
        dryerContainer.style.visibility = 'visible';
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
    setLastScreen('diagram');
    hideAllContainers();
    const diagramContainer = document.getElementById('diagram-container');
    if (diagramContainer) {
        diagramContainer.style.display = 'block';
        diagramContainer.style.visibility = 'visible';
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
    setLastScreen('windows');
    hideAllContainers();
    const windowsContainer = document.getElementById('windows-container');
    if (windowsContainer) {
        windowsContainer.style.display = 'flex';
        windowsContainer.style.visibility = 'visible';
    }

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    
    // Inicializa / reconfigura sempre o sistema Windows ao entrar na tela
    if (typeof window.inicializarWindows === 'function') {
        console.log('🎯 (Re)inicializando sistema Windows...');
        window.inicializarWindows();
        window.windowsInitialized = true;
    }
}

// ✅ Exibe a tela de painéis de conexão
function showPanels(event) {
    setLastScreen('panels');
    hideAllContainers();
    const panelsContainer = document.getElementById('panels-container');
    if (panelsContainer) {
        panelsContainer.style.display = 'flex';
        panelsContainer.style.visibility = 'visible';
    }

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    
    // Inicializa os painéis se ainda não foi inicializado
    if (typeof window.inicializarPanels === 'function' && !window.panelsInitialized) {
        console.log('🔌 Inicializando sistema de Painéis...');
        window.inicializarPanels();
        window.panelsInitialized = true; // Evita reinicializar
    }
}

// ✅ Exibe a tela de solenoides
function showSolenoids(event) {
    setLastScreen('solenoids');
    hideAllContainers();
    const solenoidsContainer = document.getElementById('solenoids-container');
    if (solenoidsContainer) {
        solenoidsContainer.style.display = 'flex';
        solenoidsContainer.style.visibility = 'visible';
    }

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    
    // Inicializa os solenoides se ainda não foi inicializado
    if (typeof window.inicializarSolenoids === 'function' && !window.solenoidsInitialized) {
        console.log('🔧 Inicializando sistema de Solenoides...');
        window.inicializarSolenoids();
        window.solenoidsInitialized = true; // Evita reinicializar
    }
}

// Função para exibir a tela do visualizador 3D
function showViewer3D(event) {
    setLastScreen('viewer3d');
    hideAllContainers();
    const viewer3dContainer = document.getElementById('viewer3d-container');
    if (viewer3dContainer) {
        viewer3dContainer.style.display = 'block';
        viewer3dContainer.style.visibility = 'visible';
    }

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    
    // Inicializa o visualizador 3D quando a tela for exibida
    // Usa um pequeno delay para garantir que o DOM está pronto
    setTimeout(() => {
        if (typeof window.initViewer3D === 'function') {
            console.log('🎯 Inicializando visualizador 3D...');
            window.initViewer3D();
            window.viewer3dInitialized = true;
        }
    }, 100);
}

// Função para exibir a tela de amostras
function showSamples(event) {
    setLastScreen('samples');
    hideAllContainers();
    const samplesContainer = document.getElementById('samples-container');
    if (samplesContainer) {
        samplesContainer.style.display = 'block';
        samplesContainer.style.visibility = 'visible';
    }

    if (window.stopAlarmAutoRefresh) {
        window.stopAlarmAutoRefresh();
    }

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (event?.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    
    // Inicializa a tela de amostras sempre que a tela for exibida
    // Usa um pequeno delay para garantir que o DOM está pronto
    setTimeout(() => {
        if (typeof window.inicializarSamples === 'function') {
            console.log('🔧 Inicializando sistema de Amostras...');
            // Limpa estado anterior se existir
            if (window.cleanupSamples) {
                window.cleanupSamples();
            }
            // Reinicializa
            window.inicializarSamples();
        }
    }, 100);
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
    loadScript('/static/scripts/partials/graphics.js'),
    loadScript('/static/scripts/partials/viewer3d.js'),
    loadScript('/static/scripts/partials/samples.js') // ✅ Script de amostras

])
.then(() => {
    console.log('Todos os scripts carregados com sucesso!');

    // Restaura usuário salvo (mantém menu técnico após F5 até logoff)
    try {
        if (typeof loadUserFromStorage === 'function') {
            loadUserFromStorage();
        }
        if (typeof updateUserDisplay === 'function') {
            updateUserDisplay();
        }
    } catch (e) {
        console.warn('Falha ao restaurar usuário salvo:', e);
    }
    
    // Verificar se a função do velocímetro existe antes de chamá-la
    if (typeof inicializarVelocimetro === 'function') {
        inicializarVelocimetro();
    } else {
        console.warn('Função inicializarVelocimetro não encontrada!');
    }
    
    // ✅ CRÍTICO - CORREÇÃO DE VAZAMENTO DE MEMÓRIA:
    // NÃO inicializa telas automaticamente ao carregar a página!
    // Cada tela será inicializada apenas quando o usuário abri-la.
    // Isso evita que múltiplos intervalos sejam criados desnecessariamente.
    
    // REMOVIDO: inicializarAlarmes() - será chamado apenas quando showAlarm() for executado
    // REMOVIDO: inicializarWeightRange() - será chamado apenas quando showWeightRange() for executado
    // REMOVIDO: inicializarBalance() - será chamado apenas quando showBalance() for executado
    // REMOVIDO: inicializarClassification() - será chamado apenas quando showClassification() for executado
    // REMOVIDO: inicializarInput() - será chamado apenas quando showInput() for executado
    
    console.log('[MAIN] ✅ Scripts carregados - telas serão inicializadas sob demanda');

})
.catch(error => console.error('Erro ao carregar scripts:', error));


document.addEventListener('DOMContentLoaded', function() {
    // Detecta se é um recarregamento (F5) ou uma navegação inicial/aba nova
    let isReload = false;
    try {
        if (performance && typeof performance.getEntriesByType === 'function') {
            const navEntries = performance.getEntriesByType('navigation');
            if (navEntries && navEntries[0]) {
                isReload = navEntries[0].type === 'reload';
            }
        } else if (performance && performance.navigation) {
            // API antiga (fallback)
            isReload = performance.navigation.type === 1; // 1 = reload
        }
    } catch (e) {
        console.warn('Não foi possível determinar o tipo de navegação:', e);
    }

    // Mapa de telas
    const screenMap = {
        grid: showGrid,
        alarm: showAlarm,
        graphics: showGraphics,
        weight: showWeightRange,
        balance: showBalance,
        classification: showClassification,
        input: showInput,
        washer: showWasher,
        dryer: showDryer,
        diagram: showDiagram,
        windows: showWindows,
        viewer3d: showViewer3D,
        samples: showSamples,
        panels: showPanels,
        solenoids: showSolenoids
    };

    // Regra:
    // - Primeira carga / navegação normal: sempre abre na tela inicial (grid)
    // - Recarregamento (F5): tenta voltar para a última tela salva
    if (!isReload) {
        // Primeira vez após iniciar servidor ou abrir nova aba → sempre grid
        showGrid();
    } else {
        let lastScreen = null;
        try {
            lastScreen = localStorage.getItem(LAST_SCREEN_KEY);
        } catch (e) {
            console.warn('Não foi possível ler última tela do localStorage:', e);
        }
        const fn = screenMap[lastScreen] || showGrid;
        fn();
    }
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
window.showViewer3D = showViewer3D; // ✅ Exportação global da função do visualizador 3D
window.showSamples = showSamples; // ✅ Exportação global da função de amostras
window.showPanels = showPanels; // ✅ Exportação global da função de painéis
window.showSolenoids = showSolenoids; // ✅ Exportação global da função de solenoides


