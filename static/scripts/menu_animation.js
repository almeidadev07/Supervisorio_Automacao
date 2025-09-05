/**
 * Script para controlar a animação do menu que se expande do centro para os cantos
 * 
 * Como usar:
 * 1. Adicione as classes CSS ao elemento #menu
 * 2. Use as funções para controlar a animação
 */

class MenuAnimationController {
    constructor(menuElement) {
        this.menu = menuElement;
        this.isOpen = false;
        this.isTransitioning = false;
    }

    /**
     * Abre o menu com animação de expansão do centro para os cantos
     */
    openMenu() {
        if (this.isTransitioning) return;
        
        this.isTransitioning = true;
        this.isOpen = true;
        
        // Remove classes anteriores
        this.menu.classList.remove('closed', 'closing');
        
        // Adiciona classe de transição
        this.menu.classList.add('transitioning');
        
        // Após um pequeno delay, inicia a animação de expansão
        setTimeout(() => {
            this.menu.classList.add('expanding', 'open');
            this.menu.classList.remove('transitioning');
            
            // Remove a classe expanding após a animação
            setTimeout(() => {
                this.menu.classList.remove('expanding');
                this.isTransitioning = false;
            }, 1000); // Duração da animação + 200ms de buffer
        }, 50);
    }

    /**
     * Fecha o menu com animação de retorno ao centro
     */
    closeMenu() {
        if (this.isTransitioning) return;
        
        this.isTransitioning = true;
        this.isOpen = false;
        
        // Remove classes anteriores
        this.menu.classList.remove('open', 'expanding');
        
        // Adiciona classe de fechamento
        this.menu.classList.add('closing', 'transitioning');
        
        // Após a animação de fechamento, volta ao estado fechado
        setTimeout(() => {
            this.menu.classList.remove('closing', 'transitioning');
            this.menu.classList.add('closed');
            this.isTransitioning = false;
        }, 500); // Duração da animação de fechamento
    }

    /**
     * Alterna o estado do menu
     */
    toggleMenu() {
        if (this.isOpen) {
            this.closeMenu();
        } else {
            this.openMenu();
        }
    }

    /**
     * Adiciona efeito de clique no logo
     */
    clickLogo() {
        const logoBtn = this.menu.querySelector('.logo-btn');
        if (logoBtn) {
            logoBtn.classList.add('clicked');
            setTimeout(() => {
                logoBtn.classList.remove('clicked');
            }, 300);
        }
    }
}

// Exemplo de uso:
document.addEventListener('DOMContentLoaded', function() {
    const menuElement = document.getElementById('menu');
    if (menuElement) {
        const menuController = new MenuAnimationController(menuElement);
        
        // Inicializa o menu fechado
        menuElement.classList.add('closed');
        
        // Adiciona evento de clique no logo para abrir/fechar
        const logoBtn = menuElement.querySelector('.logo-btn');
        if (logoBtn) {
            logoBtn.addEventListener('click', function(e) {
                e.preventDefault();
                menuController.clickLogo();
                menuController.toggleMenu();
            });
        }
        
        // Adiciona eventos de clique nos botões do menu
        const menuBtns = menuElement.querySelectorAll('.menu-btn');
        menuBtns.forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                // Aqui você pode adicionar a lógica para cada botão
                console.log('Botão clicado:', this.dataset.action || 'sem ação definida');
            });
        });
        
        // Exemplo: abrir menu automaticamente após 2 segundos
        // setTimeout(() => {
        //     menuController.openMenu();
        // }, 2000);
    }
});

// Exportar para uso em outros scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MenuAnimationController;
}
