let isMenuOpen = false;
let menu = document.getElementById('menu');
let isMobileView = false;
let carouselInitialized = false;

// Variáveis para controle de touch/drag
let isDragging = false;
let startX = 0;
let currentTrack = null;
let scrollLeftStart = 0;

// Detecta se é mobile baseado na largura da tela
function checkMobileView() {
    const wasMobile = isMobileView;
    isMobileView = window.innerWidth <= 768;
    
    // Se mudou o estado, atualiza a interface
    if (wasMobile !== isMobileView) {
        updateMenuForViewport();
    }
    
    return isMobileView;
}

// Atualiza o menu para o viewport atual
function updateMenuForViewport() {
    const carouselWrapper = document.getElementById('menu-carousel-wrapper');
    const menuElement = document.getElementById('menu');
    
    if (isMobileView) {
        // Em mobile, inicializa o carrossel se necessário
        if (!carouselInitialized) {
            initCarousel();
            carouselInitialized = true;
        }
        
        // Se o menu estava aberto, mostra o carrossel
        if (isMenuOpen && carouselWrapper) {
            carouselWrapper.classList.add('active');
            if (menuElement) menuElement.classList.add('closed');
        }
    } else {
        // Em desktop, esconde o carrossel
        if (carouselWrapper) {
            carouselWrapper.classList.remove('active');
        }
        
        // Restaura o menu normal
        if (menuElement && isMenuOpen) {
            menuElement.classList.remove('closed');
            menuElement.classList.add('open');
        }
    }
}

// Inicializa o carrossel com logo fixo no centro
function initCarousel() {
    const leftContainer = document.getElementById('carousel-left-buttons');
    const rightContainer = document.getElementById('carousel-right-buttons');
    
    if (!leftContainer || !rightContainer) return;
    
    // Limpa os containers
    leftContainer.innerHTML = '';
    rightContainer.innerHTML = '';
    
    // Obtém todos os botões do menu operador
    const menuLeftOperador = document.getElementById('menu-operador-left');
    const menuRightOperador = document.getElementById('menu-operador');
    
    if (!menuLeftOperador || !menuRightOperador) return;
    
    // Clona os botões da esquerda
    const leftButtons = menuLeftOperador.querySelectorAll('.menu-btn');
    leftButtons.forEach(btn => {
        const clone = btn.cloneNode(true);
        clone.style.opacity = '1';
        clone.style.transform = 'scale(1)';
        leftContainer.appendChild(clone);
    });
    
    // Clona os botões da direita
    const rightButtons = menuRightOperador.querySelectorAll('.menu-btn');
    rightButtons.forEach(btn => {
        const clone = btn.cloneNode(true);
        clone.style.opacity = '1';
        clone.style.transform = 'scale(1)';
        rightContainer.appendChild(clone);
    });
    
    // Configura touch/drag para ambos os tracks
    const trackLeft = document.getElementById('carousel-track-left');
    const trackRight = document.getElementById('carousel-track-right');
    
    if (trackLeft) setupTouchDrag(trackLeft);
    if (trackRight) setupTouchDrag(trackRight);
}

// Configura touch e drag para scroll fluido
function setupTouchDrag(track) {
    // Touch events
    track.addEventListener('touchstart', handleTouchStart, { passive: true });
    track.addEventListener('touchmove', handleTouchMove, { passive: false });
    track.addEventListener('touchend', handleTouchEnd, { passive: true });
    
    // Mouse events para teste em desktop
    track.addEventListener('mousedown', handleMouseDown);
    track.addEventListener('mousemove', handleMouseMove);
    track.addEventListener('mouseup', handleMouseUp);
    track.addEventListener('mouseleave', handleMouseUp);
}

function handleTouchStart(e) {
    isDragging = true;
    currentTrack = e.currentTarget;
    startX = e.touches[0].clientX;
    scrollLeftStart = currentTrack.scrollLeft;
    currentTrack.style.scrollBehavior = 'auto';
}

function handleTouchMove(e) {
    if (!isDragging || !currentTrack) return;
    
    const x = e.touches[0].clientX;
    const delta = startX - x;
    
    // Aplica o scroll com multiplicador para mais fluidez
    currentTrack.scrollLeft = scrollLeftStart + delta * 1.5;
}

function handleTouchEnd() {
    if (currentTrack) {
        currentTrack.style.scrollBehavior = 'smooth';
    }
    isDragging = false;
    currentTrack = null;
}

function handleMouseDown(e) {
    isDragging = true;
    currentTrack = e.currentTarget;
    startX = e.clientX;
    scrollLeftStart = currentTrack.scrollLeft;
    currentTrack.style.cursor = 'grabbing';
    currentTrack.style.scrollBehavior = 'auto';
    e.preventDefault();
}

function handleMouseMove(e) {
    if (!isDragging || !currentTrack) return;
    
    const x = e.clientX;
    const delta = startX - x;
    
    currentTrack.scrollLeft = scrollLeftStart + delta * 1.5;
}

function handleMouseUp() {
    if (currentTrack) {
        currentTrack.style.cursor = 'grab';
        currentTrack.style.scrollBehavior = 'smooth';
    }
    isDragging = false;
    currentTrack = null;
}

// Scroll do carrossel com setas - esquerda
function scrollCarouselLeft() {
    const trackLeft = document.getElementById('carousel-track-left');
    const trackRight = document.getElementById('carousel-track-right');
    const scrollAmount = 120;
    
    if (trackLeft) {
        // RTL: invert o sinal para mover visivelmente à esquerda
        trackLeft.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
    if (trackRight) {
        trackRight.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    }
}

// Scroll do carrossel com setas - direita
function scrollCarouselRight() {
    const trackLeft = document.getElementById('carousel-track-left');
    const trackRight = document.getElementById('carousel-track-right');
    const scrollAmount = 120;
    
    if (trackLeft) {
        // RTL: invert o sinal para mover visivelmente à direita
        trackLeft.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    }
    if (trackRight) {
        trackRight.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
}

// Adiciona listener para clicks em toda a página
document.addEventListener('mousedown', function(event) {
    const carouselWrapper = document.getElementById('menu-carousel-wrapper');
    const isClickOnCarousel = carouselWrapper && carouselWrapper.contains(event.target);
    const menuToggleBtn = document.querySelector('.menu-toggle');
    const logoBtn = document.querySelector('.logo-btn');
    
    // Ignora cliques no botão de toggle do menu ou logo
    if (menuToggleBtn && menuToggleBtn.contains(event.target)) return;
    if (logoBtn && logoBtn.contains(event.target)) return;
    
    // Verifica se o menu está aberto e se o clique foi fora do menu e do carrossel
    if (isMenuOpen && menu && !menu.contains(event.target) && !event.target.classList.contains('menu-btn') && !isClickOnCarousel) {
        // Em mobile, fecha o carrossel
        if (isMobileView && carouselWrapper) {
            carouselWrapper.classList.remove('active');
        }
        toggleMenu();
    }
});

// Bloqueia cliques nos botões do menu quando o menu está recolhido
document.addEventListener('click', function(event) {
    const clickedMenuButton = event.target && event.target.closest && event.target.closest('.menu-btn');
    
    // Se estamos em mobile e o carrossel está ativo, permite o clique
    if (isMobileView) {
        const carouselWrapper = document.getElementById('menu-carousel-wrapper');
        if (carouselWrapper && carouselWrapper.classList.contains('active')) {
            return; // Permite o clique no carrossel
        }
    }
    
    if (clickedMenuButton && !isMenuOpen) {
        event.preventDefault();
        event.stopPropagation();
    }
}, true);


function toggleMenu() {
    const buttons = document.querySelectorAll('#menu .menu-btn');
    const logoBtn = document.querySelector('#menu .logo-btn');
    const carouselWrapper = document.getElementById('menu-carousel-wrapper');
    
    const baseOffset = 1;

    if (!isMenuOpen) {
        // Abrindo o menu
        if (isMobileView && carouselWrapper) {
            // Em mobile, mostra o carrossel
            if (!carouselInitialized) {
                initCarousel();
                carouselInitialized = true;
            }
            carouselWrapper.classList.add('active');
            if (menu) {
                menu.classList.add('closed');
                menu.classList.remove('open');
            }
        } else {
            // Em desktop, anima os botões
            if (logoBtn) logoBtn.style.transform = 'scale(1.2)';
            
            // Adiciona classes de estado
            if (menu) {
                menu.classList.remove('closed');
                menu.classList.add('open', 'expanding');
            }
            
            // Remove a classe expanding após a animação
            setTimeout(() => {
                if (menu) menu.classList.remove('expanding');
            }, 1000);
            
            // Anima botões da esquerda
            const leftButtons = document.querySelectorAll('#menu .menu-left .menu-btn');
            const maxLeftOffset = 30;
            leftButtons.forEach((button, index) => {
                const offset = Math.min((index - leftButtons.length + 1) * baseOffset, maxLeftOffset);
                button.style.opacity = 1;
                button.style.transform = `translateX(${offset}px)`;
            });
            
            // Anima botões da direita
            const rightButtons = document.querySelectorAll('#menu .menu-right .menu-btn');
            const maxRightOffset = 30;
            rightButtons.forEach((button, index) => {
                const offset = Math.min((index + 1) * baseOffset, maxRightOffset);
                button.style.opacity = 1;
                button.style.transform = `translateX(${offset}px)`;
            });
        }
    } else {
        // Fechando o menu
        if (isMobileView && carouselWrapper) {
            carouselWrapper.classList.remove('active');
        }
        
        if (logoBtn) logoBtn.style.transform = 'scale(1)';
        
        if (menu) {
            menu.classList.remove('open');
            menu.classList.add('closing');
        }
        
        buttons.forEach((button, index) => {
            button.style.opacity = 0;
            button.style.setProperty('--delay', `${index * 0.03}s`);
            button.style.transform = 'translateX(0)';
        });
        
        // Remove a classe closing após a animação
        setTimeout(() => {
            if (menu) {
                menu.classList.remove('closing');
                menu.classList.add('closed');
            }
        }, 600);
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
    const currentTransform = clickedButton.style.transform || '';
    clickedButton.style.transform = currentTransform.includes('scale(1.4)') 
        ? currentTransform.replace(/scale\(1\.4\)/, '') 
        : `${currentTransform} scale(1.4)`;
    
    // Adiciona classe zoomed para controle de z-index
    if (clickedButton.style.transform.includes('scale(1.4)')) {
        clickedButton.classList.add('zoomed');
    }
    
    // Em mobile, fecha o carrossel após selecionar
    if (isMobileView) {
        const carouselWrapper = document.getElementById('menu-carousel-wrapper');
        if (carouselWrapper) {
            setTimeout(() => {
                carouselWrapper.classList.remove('active');
                isMenuOpen = false;
                if (menu) {
                    menu.classList.remove('open');
                    menu.classList.add('closed');
                }
            }, 150);
        }
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
        alert('🔄 Sistema sendo desligado...\n\nO computador será desligado em 10 segundos.');
        
        setTimeout(() => {
            console.log('Comando de desligamento enviado para o sistema');
            window.location.reload();
        }, 1000);
        
    } catch (error) {
        console.error('Erro ao desligar o sistema:', error);
        alert('❌ Erro ao desligar o sistema.\n\nVerifique as permissões ou contate o administrador.');
    }
}

// Inicialização após DOM estar pronto
document.addEventListener('DOMContentLoaded', function() {
    menu = document.getElementById('menu');
    
    // Verifica o viewport inicial
    checkMobileView();
    
    // Inicializa o menu como fechado
    if (menu) {
        menu.classList.add('closed');
    }
    
    // Esconde o carrossel inicialmente
    const carouselWrapper = document.getElementById('menu-carousel-wrapper');
    if (carouselWrapper) {
        carouselWrapper.classList.remove('active');
    }
    
    // Pré-inicializa o carrossel em mobile
    if (isMobileView) {
        initCarousel();
        carouselInitialized = true;
    }
});

// Adiciona listener para redimensionamento da janela
window.addEventListener('resize', function() {
    checkMobileView();
    
    // Reinicializa o carrossel se mudar para mobile
    if (isMobileView && !carouselInitialized) {
        initCarousel();
        carouselInitialized = true;
    }
});

// Exporta funções para uso global
window.toggleMenu = toggleMenu;
window.zoomButton = zoomButton;
window.confirmShutdown = confirmShutdown;
window.scrollCarouselLeft = scrollCarouselLeft;
window.scrollCarouselRight = scrollCarouselRight;
