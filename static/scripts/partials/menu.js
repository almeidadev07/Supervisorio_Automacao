let isMenuOpen = false;
let menu = document.getElementById('menu');

function toggleMenu() {
    const buttons = document.querySelectorAll('.menu-btn');
    console.log("Botões encontrados:", buttons.length);
    
    if (buttons.length === 0) {
        console.error("Nenhum botão encontrado com a classe .menu-btn");
        return;
    }
    
    const totalButtons = buttons.length;
    const baseOffset = 20;

    buttons.forEach((button, index) => {
        if (!isMenuOpen) {
            const offset = (index - Math.floor(totalButtons / 2)) * baseOffset;
            button.style.opacity = 1;
            button.style.transform = `translateX(${offset}px)`;
        } else {
            button.style.opacity = 0;
            button.style.setProperty('--delay', `${index * 0.03}s`);
            button.style.transform = 'translateX(0)';
        }
    });
    
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

// Adicionar navegação para a tela de alarmes
document.querySelector('.menu-btn[onclick*="Alarme"]').addEventListener('click', () => {
    window.location.href = '/alarm';
});