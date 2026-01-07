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
        // Remove o bloqueio de transição para evitar cliques ignorados
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
            }, 600); // Reduzido para resposta mais rápida
        }, 30);
    }

    /**
     * Fecha o menu com animação de retorno ao centro
     */
    closeMenu() {
        // Remove o bloqueio de transição para evitar cliques ignorados
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
        }, 400); // Reduzido para resposta mais rápida
    }

    /**
     * Alterna o estado do menu
     */
    toggleMenu() {
        // Cancela transição pendente se houver e força toggle imediato
        if (this.isTransitioning) {
            // Limpa estado e força toggle
            this.isTransitioning = false;
        }
        
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

// Nota: O controle principal do menu é feito pelo menu.js
// Este arquivo fornece apenas a classe auxiliar MenuAnimationController
// para uso opcional em animações mais complexas.
// O evento de clique no logo é gerenciado pelo menu.js para evitar conflitos.

// Exportar para uso em outros scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MenuAnimationController;
}
