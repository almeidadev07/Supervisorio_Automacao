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
    updateUIByRole();
    updateUserDisplay();
    hideLoginModal();
    console.log('Logout realizado, retornando para Operador');
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

// Atualizar display do usuário na inicialização
document.addEventListener('DOMContentLoaded', function() {
    updateUserDisplay();
});
