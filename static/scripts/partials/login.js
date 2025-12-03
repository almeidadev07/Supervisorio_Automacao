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
    
    if (currentUser.role === 'Tec') {
        // Usuário técnico: mostrar apenas menus técnicos, esconder menu operador
        if (menuOperadorLeft) menuOperadorLeft.style.display = 'none';
        if (menuOperadorRight) menuOperadorRight.style.display = 'none';
        if (menuTecnicoLeft) menuTecnicoLeft.style.display = 'flex';
        if (menuTecnicoRight) menuTecnicoRight.style.display = 'flex';
    } else {
        // Usuário operador: mostrar menu esquerdo e operador, esconder menus técnicos
        if (menuOperadorLeft) menuOperadorLeft.style.display = 'flex';
        if (menuOperadorRight) menuOperadorRight.style.display = 'flex';
        if (menuTecnicoLeft) menuTecnicoLeft.style.display = 'none';
        if (menuTecnicoRight) menuTecnicoRight.style.display = 'none';
    }
}

function isAdmin() {
    return currentUser?.role === 'Tec';
}

function showLoginModal() {
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

// Exporta funções necessárias
window.handleLogin = handleLogin;
window.showLoginModal = showLoginModal;
window.hideLoginModal = hideLoginModal;
window.isAdmin = isAdmin;
window.handleLogout = handleLogout;

// Fechar modal ao clicar fora
document.addEventListener('click', function(event) {
    const modal = document.getElementById('login-modal');
    if (event.target === modal) {
        hideLoginModal();
    }
});

// Removido: monitoramento de atividade para logout automático
