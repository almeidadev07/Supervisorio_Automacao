const users = {
    tec: {
        password: 'tec',
        role: 'Tec',
        displayName: 'Técnico'
    }
};

let inactivityTimeout;
const TIMEOUT_DURATION = 5000; // 5 segundos

let currentUser = {
    username: 'operator',
    role: 'Operador',
    displayName: 'Operador'
};

function resetInactivityTimer() {
    clearTimeout(inactivityTimeout);
    inactivityTimeout = setTimeout(handleLogout, TIMEOUT_DURATION);
}

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
        resetInactivityTimer();
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

// Inicializar monitoramento de atividade
document.addEventListener('mousemove', resetInactivityTimer);
document.addEventListener('keypress', resetInactivityTimer);
document.addEventListener('click', resetInactivityTimer);

// Atualizar display do usuário na inicialização
document.addEventListener('DOMContentLoaded', function() {
    updateUserDisplay();
});
