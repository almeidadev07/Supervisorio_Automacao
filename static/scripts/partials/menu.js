let isMenuOpen = false;
let menu = document.getElementById('menu');

// Adiciona listener para clicks em toda a página
document.addEventListener('mousedown', function(event) {
    // Verifica se o menu está aberto e se o clique foi fora do menu
    // Garante que `menu` exista antes de acessar `contains` para evitar erro de JavaScript
    if (isMenuOpen && menu && !menu.contains(event.target) && !event.target.classList.contains('menu-btn')) {
        toggleMenu();
    }
});

// Bloqueia cliques nos botões do menu quando o menu está recolhido
// Usa captura para impedir execução dos handlers inline (onclick)
document.addEventListener('click', function(event) {
    const clickedMenuButton = event.target && event.target.closest && event.target.closest('.menu-btn');
    if (clickedMenuButton && !isMenuOpen) {
        event.preventDefault();
        event.stopPropagation();
    }
}, true);


function toggleMenu() {
    const buttons = document.querySelectorAll('.menu-btn');
    const logoBtn = document.querySelector('.logo-btn');
    
    const totalButtons = buttons.length;
    const baseOffset = 1; // Reduzido ainda mais para espremer o menu

    if (!isMenuOpen) {
        // Aplica zoom ao abrir o menu
        logoBtn.style.transform = 'scale(1.2)';
        
        // Anima botões da esquerda (limitado para não ultrapassar o ícone de desligar)
        const leftButtons = document.querySelectorAll('.menu-left .menu-btn');
        const maxLeftOffset = 30; // Reduzido para dar mais espaço ao ícone de desligar
        leftButtons.forEach((button, index) => {
            const offset = Math.min((index - leftButtons.length + 1) * baseOffset, maxLeftOffset);
            button.style.opacity = 1;
            button.style.transform = `translateX(${offset}px)`;
        });
        
        // Anima botões da direita (limitado para não ultrapassar o ícone de login)
        const rightButtons = document.querySelectorAll('.menu-right .menu-btn');
        const maxRightOffset = 30; // Reduzido para dar mais espaço ao ícone de login
        rightButtons.forEach((button, index) => {
            const offset = Math.min((index + 1) * baseOffset, maxRightOffset);
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
    
    // Remove todas as classes de seleção e zoom
    buttons.forEach(button => {
        button.classList.remove('selected', 'zoomed');
        button.style.transform = button.style.transform.replace(/scale\([^)]+\)/, '');
    });

    // Adiciona classe de seleção apenas ao botão clicado
    clickedButton.classList.add('selected');
    
    // Aplica zoom apenas ao botão clicado
    const currentTransform = clickedButton.style.transform;
    clickedButton.style.transform = currentTransform.includes('scale(1.4)') 
        ? currentTransform.replace(/scale\(1\.4\)/, '') 
        : `${currentTransform} scale(1.4)`;
    
    // Adiciona classe zoomed para controle de z-index
    if (clickedButton.style.transform.includes('scale(1.4)')) {
        clickedButton.classList.add('zoomed');
    }
}

// Função para confirmar desligamento do sistema
function confirmShutdown() {
    const confirmed = confirm('⚠️ ATENÇÃO!\n\nVocê está prestes a desligar o sistema.\n\nTem certeza que deseja continuar?');
    
    if (confirmed) {
        const doubleConfirm = confirm('🚨 CONFIRMAÇÃO FINAL!\n\nEsta ação irá desligar o computador.\n\nClique em OK para confirmar o desligamento.');
        
        if (doubleConfirm) {
            shutdownSystem();
        }
    }
}

// Função para desligar o sistema
function shutdownSystem() {
    try {
        // Mostra mensagem de desligamento
        alert('🔄 Sistema sendo desligado...\n\nO computador será desligado em 10 segundos.');
        
        // Envia comando para desligar o Windows
        // Nota: Esta funcionalidade requer permissões especiais
        // Em um ambiente real, você precisaria de uma API backend para executar comandos do sistema
        
        // Simulação de desligamento (substitua por chamada real para API)
        setTimeout(() => {
            // Em um ambiente real, aqui você faria uma chamada para o backend
            // que executaria: shutdown /s /t 10
            console.log('Comando de desligamento enviado para o sistema');
            
            // Para demonstração, apenas recarrega a página
            // Em produção, remova esta linha e implemente a chamada real para o backend
            window.location.reload();
        }, 1000);
        
    } catch (error) {
        console.error('Erro ao desligar o sistema:', error);
        alert('❌ Erro ao desligar o sistema.\n\nVerifique as permissões ou contate o administrador.');
    }
}

// Corrige obtenção do menu após DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    menu = document.getElementById('menu');
    // Mantém o comportamento original dos botões (onclick no HTML),
    // sem redirecionar para uma rota inexistente como "/alarm".
});