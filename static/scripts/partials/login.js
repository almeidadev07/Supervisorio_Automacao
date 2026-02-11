const users = {
    tec: {
        password: 'tec',
        role: 'Tec',
        displayName: 'Técnico'
    }
};

// Removido: logout automático por inatividade

let currentUser = {
    username: 'operator',
    role: 'Operador',
    displayName: 'Operador'
};

// Removido: função de reset de timer de inatividade

function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('username').value.toLowerCase();
    const password = document.getElementById('password').value;

    if (users[username] && users[username].password === password) {
        currentUser = {
            username,
            role: users[username].role,
            displayName: users[username].displayName
        };
        // Persiste usuário logado (inclusive Técnico) até que seja feito logout
        try {
            localStorage.setItem('supervisor_current_user', JSON.stringify(currentUser));
        } catch (e) {
            console.warn('Falha ao salvar usuário no localStorage:', e);
        }
        hideLoginModal();
        updateUIByRole();
        updateUserDisplay();

        // Se for Técnico, abre a tela de sincronismo
        if (currentUser.role === 'Tec') {
            if (typeof window.showSynchronism === 'function') {
                window.showSynchronism();
            } else {
                console.warn('Função showSynchronism não disponível.');
            }
        }
    } else {
        alert('Usuário ou senha inválidos!');
    }
}

function handleLogout() {
    currentUser = {
        username: 'operator',
        role: 'Operador',
        displayName: 'Operador'
    };
    // Remove usuário persistido ao fazer logoff
    try {
        localStorage.removeItem('supervisor_current_user');
    } catch (e) {
        console.warn('Falha ao remover usuário do localStorage:', e);
    }
    updateUIByRole();
    updateUserDisplay();
    hideLoginModal();

    // Após logoff, sempre volta para a tela inicial (grid)
    try {
        // Garante que todos os containers (incluindo viewer3d) sejam escondidos
        if (typeof window.hideAllContainers === 'function') {
            window.hideAllContainers();
        }
        // Reseta a última tela salva para grid, para futuros F5 após logout
        if (typeof window.localStorage !== 'undefined') {
            try {
                localStorage.setItem('supervisor_last_screen', 'grid');
            } catch (e) {
                console.warn('Falha ao salvar última tela como grid após logout:', e);
            }
        }
        // Mostra explicitamente o grid
        if (typeof window.showGrid === 'function') {
            window.showGrid();
        }
    } catch (e) {
        console.warn('Falha ao retornar para tela inicial após logout:', e);
    }

    console.log('Logout realizado, retornando para Operador e tela inicial');
}

function updateUserDisplay() {
    const userDisplay = document.getElementById('user-display');
    const logoutBtnModal = document.getElementById('logout-btn-modal');
    if (userDisplay) {
        userDisplay.textContent = currentUser.displayName;
        userDisplay.style.color = currentUser.role === 'Tec' ? '#22c55e' : '#111';
        // Garantir que o font-size acompanhe o padrão do "Desligar" (responsivo)
        userDisplay.style.setProperty('font-size', 'var(--login-label-size)', 'important');
        userDisplay.style.setProperty('font-weight', '700', 'important');
        userDisplay.style.setProperty('display', 'inline-block', 'important');
        userDisplay.style.setProperty('min-width', '60px', 'important');
        userDisplay.style.setProperty('text-align', 'center', 'important');
    }
    if (logoutBtnModal) {
        // Mostra o botão de logoff no modal apenas se for técnico E o modal estiver aberto
        const modal = document.getElementById('login-modal');
        if (currentUser.role === 'Tec' && modal && modal.classList.contains('show')) {
            logoutBtnModal.style.display = 'block';
        } else {
            logoutBtnModal.style.display = 'none';
        }
    }
}

function openAlarmAll() {
    try {
        window.__desiredAlarmTab = 'todas';
    } catch (_) {}
    if (typeof window.showAlarm === 'function') {
        window.showAlarm();
    }
}

function setAlarmBellActive(active) {
    const btn = document.getElementById('alarm-btn');
    if (!btn) return;
    const isActive = !!active;
    btn.classList.toggle('alarm-active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
}

function updateUIByRole() {
    // Exemplo: desabilitar botões baseado no papel do usuário
    const adminButtons = document.querySelectorAll('.admin-only');
    adminButtons.forEach(btn => {
        btn.style.display = currentUser.role === 'administrator' ? 'block' : 'none';
    });
    
    // Controlar visibilidade dos menus baseado no tipo de usuário
    const menuOperadorLeft = document.getElementById('menu-operador-left');
    const menuOperadorRight = document.getElementById('menu-operador');
    const menuTecnicoLeft = document.getElementById('menu-tecnico-left');
    const menuTecnicoRight = document.getElementById('menu-tecnico-right');
    
    // Controlar visibilidade dos botões de configuração e reset (apenas para Técnico)
    const configBtn = document.querySelector('.config-btn');
    const resetBtn = document.querySelector('.reset-btn');
    
    if (currentUser.role === 'Tec') {
        // Usuário técnico: mostrar apenas menus técnicos, esconder menu operador
        if (menuOperadorLeft) menuOperadorLeft.style.display = 'none';
        if (menuOperadorRight) menuOperadorRight.style.display = 'none';
        if (menuTecnicoLeft) menuTecnicoLeft.style.display = 'flex';
        if (menuTecnicoRight) menuTecnicoRight.style.display = 'flex';
        // Mostrar botões de configuração e reset
        if (configBtn) configBtn.style.display = 'flex';
        if (resetBtn) resetBtn.style.display = 'flex';
    } else {
        // Usuário operador: mostrar menu esquerdo e operador, esconder menus técnicos
        if (menuOperadorLeft) menuOperadorLeft.style.display = 'flex';
        if (menuOperadorRight) menuOperadorRight.style.display = 'flex';
        if (menuTecnicoLeft) menuTecnicoLeft.style.display = 'none';
        if (menuTecnicoRight) menuTecnicoRight.style.display = 'none';
        // Esconder botões de configuração e reset
        if (configBtn) configBtn.style.display = 'none';
        if (resetBtn) resetBtn.style.display = 'none';
    }
}

function isAdmin() {
    return currentUser?.role === 'Tec';
}

function showLoginModal() {
    // Recolhe o menu se estiver aberto
    if (typeof window.toggleMenu === 'function') {
        // Verifica se o menu está aberto através do elemento DOM
        const menu = document.getElementById('menu');
        const carouselWrapper = document.getElementById('menu-carousel-wrapper');
        const isMenuOpen = menu && (menu.classList.contains('open') || (carouselWrapper && carouselWrapper.classList.contains('active')));
        
        if (isMenuOpen) {
            // Fecha o menu antes de abrir o modal
            window.toggleMenu();
            // Aguarda um pouco para a animação do menu fechar antes de abrir o modal
            setTimeout(() => {
                const loginModal = document.getElementById('login-modal');
                if (loginModal) {
                    loginModal.classList.add('show');
                    updateUserDisplay();
                }
            }, 100);
            return; // Retorna para não executar o código abaixo
        }
    }
    
    document.getElementById('login-modal').classList.add('show');
    updateUserDisplay();
}

function hideLoginModal() {
    document.getElementById('login-modal').classList.remove('show');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    updateUserDisplay();
}

// Carrega usuário salvo (Operador/Técnico) do localStorage ao iniciar
function loadUserFromStorage() {
    try {
        const raw = localStorage.getItem('supervisor_current_user');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && parsed.username && parsed.role && parsed.displayName) {
            currentUser = parsed;
            updateUIByRole();
        }
    } catch (e) {
        console.warn('Falha ao carregar usuário do localStorage:', e);
    }
}

// Função para mostrar modal de configuração (máquina)
function showMachineModal() {
    // Preferir a versão completa do machine_select.js quando disponível
    if (typeof window.showMachineModalCore === 'function') {
        try {
            window.showMachineModalCore();
            return;
        } catch (error) {
            console.error('Erro ao chamar showMachineModalCore:', error);
        }
    }

    // Se houver outra função registrada e não for esta, usa-a
    if (typeof window.showMachineModal === 'function' && window.showMachineModal !== showMachineModal) {
        try {
            window.showMachineModal();
            return;
        } catch (error) {
            console.error('Erro ao chamar showMachineModal existente:', error);
        }
    }
    
    // Fallback: abre o modal diretamente e tenta carregar máquinas
    const modal = document.getElementById('machine-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('show');
        modal.style.display = 'flex';
        
        // Tenta carregar máquinas se a função existir
        if (typeof window.loadMachines === 'function') {
            window.loadMachines();
        }
    }
}

// Exporta funções necessárias
window.handleLogin = handleLogin;
window.showLoginModal = showLoginModal;
window.hideLoginModal = hideLoginModal;
window.isAdmin = isAdmin;
window.handleLogout = handleLogout;
if (typeof window.showMachineModal !== 'function') {
    window.showMachineModal = showMachineModal;
} else {
    window.showMachineModalFallback = showMachineModal;
}
window.openAlarmAll = openAlarmAll;
window.setAlarmBellActive = setAlarmBellActive;

// Fechar modal ao clicar fora
document.addEventListener('click', function(event) {
    const modal = document.getElementById('login-modal');
    if (event.target === modal) {
        hideLoginModal();
    }
});

// Função para aplicar o estilo do texto Operador
function applyUserDisplayStyle() {
    const userDisplay = document.getElementById('user-display');
    if (userDisplay) {
        // Aplica o estilo responsivo (mesmo tamanho do texto Desligar)
        userDisplay.style.setProperty('font-size', 'var(--login-label-size)', 'important');
        userDisplay.style.setProperty('font-weight', '700', 'important');
        userDisplay.style.setProperty('display', 'inline-block', 'important');
        userDisplay.style.setProperty('min-width', '60px', 'important');
        userDisplay.style.setProperty('text-align', 'center', 'important');
    }
}

// Garantir que o estilo do texto Operador seja aplicado ao carregar a página
document.addEventListener('DOMContentLoaded', function() {
    applyUserDisplayStyle();
    // Também chama updateUserDisplay para garantir
    if (typeof updateUserDisplay === 'function') {
        updateUserDisplay();
    }
    
    // Usa MutationObserver para monitorar mudanças no elemento
    const userDisplay = document.getElementById('user-display');
    if (userDisplay) {
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'attributes' && 
                    (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
                    // Reaplica o estilo se algo tentar mudá-lo
                    setTimeout(applyUserDisplayStyle, 10);
                }
            });
        });
        
        observer.observe(userDisplay, {
            attributes: true,
            attributeFilter: ['style', 'class']
        });
    }
});

// Aplica estilo também quando a página estiver totalmente carregada
window.addEventListener('load', function() {
    applyUserDisplayStyle();
    // Aplica novamente após um pequeno delay para garantir
    setTimeout(applyUserDisplayStyle, 100);
    setTimeout(applyUserDisplayStyle, 500);
});

// Removido: monitoramento de atividade para logout automático
