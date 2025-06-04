let isMenuOpen = false;
let menu = document.getElementById('menu');

// Adiciona listener para clicks em toda a página
document.addEventListener('mousedown', function(event) {
    // Verifica se o menu está aberto e se o clique foi fora do menu
    if (isMenuOpen && !menu.contains(event.target) && !event.target.classList.contains('menu-btn')) {
        toggleMenu();
    }
});


function toggleMenu() {
    const buttons = document.querySelectorAll('.menu-btn');
    const logoBtn = document.querySelector('.logo-btn');
    
    const totalButtons = buttons.length;
    const baseOffset = 20;

    if (!isMenuOpen) {
        // Aplica zoom ao abrir o menu
        logoBtn.style.transform = 'scale(1.2)';
        buttons.forEach((button, index) => {
            const offset = (index - Math.floor(totalButtons / 2)) * baseOffset;
            button.style.opacity = 1;
            button.style.transform = `translateX(${offset}px)`;
        });
    } else {
        // Remove zoom ao fechar o menu
        logoBtn.style.transform = 'scale(1)';
        buttons.forEach((button, index) => {
            button.style.opacity = 0;
            button.style.setProperty('--delay', `${index * 0.03}s`);
            button.style.transform = 'translateX(0)';
        });
    }
    
    isMenuOpen = !isMenuOpen;
}

function zoomButton(clickedButton) {
    const buttons = document.querySelectorAll('.menu-btn');
    
    buttons.forEach(button => {
        if (button !== clickedButton) {
            button.style.transform = button.style.transform.replace(/scale\([^)]+\)/, '');
        }
    });

    const currentTransform = clickedButton.style.transform;
    clickedButton.style.transform = currentTransform.includes('scale(1.4)') 
        ? currentTransform.replace(/scale\(1\.4\)/, '') 
        : `${currentTransform} scale(1.4)`;
}

// Corrige obtenção do menu após DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    menu = document.getElementById('menu');

    // Adicionar navegação para a tela de alarmes
    const alarmBtn = document.querySelector('.menu-btn[onclick*="Alarme"]');
    if (alarmBtn) {
        alarmBtn.addEventListener('click', () => {
            window.location.href = '/alarm';
        });
    }
});