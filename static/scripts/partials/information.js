/**
 * information.js - Tela de Informações do Sistema
 * Gerencia informações de software, sistema, idioma e máquina
 */

(function() {
    'use strict';
    
    // ============================================
    // GERENCIAMENTO DE RECURSOS
    // ============================================
    let informationEventListeners = [];
    let informationIntervals = [];
    let dateTimeInterval = null;
    
    /**
     * Registra um event listener para cleanup posterior
     */
    function registerInfoEventListener(element, event, handler) {
        if (element) {
            element.addEventListener(event, handler);
            informationEventListeners.push({ element, event, handler });
        }
    }
    
    /**
     * Registra um interval para cleanup posterior
     */
    function registerInfoInterval(intervalId) {
        informationIntervals.push(intervalId);
        return intervalId;
    }
    
    /**
     * Cleanup de todos os recursos
     */
    function cleanupInformation() {
        console.log('[INFORMATION] 🧹 Iniciando cleanup...');
        
        // Remove event listeners
        informationEventListeners.forEach(({ element, event, handler }) => {
            if (element) {
                element.removeEventListener(event, handler);
            }
        });
        informationEventListeners = [];
        
        // Limpa intervals
        informationIntervals.forEach(id => {
            if (id) clearInterval(id);
        });
        informationIntervals = [];
        
        // Limpa interval de data/hora específico
        if (dateTimeInterval) {
            clearInterval(dateTimeInterval);
            dateTimeInterval = null;
        }
        
        console.log('[INFORMATION] ✅ Cleanup concluído');
    }
    
    // ============================================
    // INICIALIZAÇÃO
    // ============================================
    
    /**
     * Inicializa a tela de informações
     */
    function inicializarInformation() {
        console.log('[INFORMATION] 🚀 Inicializando tela de informações...');
        
        // Cleanup antes de reinicializar
        cleanupInformation();
        
        // Carrega informações iniciais
        loadSoftwareInfo();
        loadSystemInfo();
        loadCurrentLanguage();
        
        // Inicia atualização de data/hora
        startDateTimeUpdate();
        
        // Adiciona listener para mudança de idioma
        const languageHandler = (e) => {
            console.log('[INFORMATION] Idioma alterado para:', e.detail.language);
            loadCurrentLanguage();
        };
        window.addEventListener('languageChanged', languageHandler);
        informationEventListeners.push({ 
            element: window, 
            event: 'languageChanged', 
            handler: languageHandler 
        });
        
        console.log('[INFORMATION] ✅ Tela inicializada com sucesso');
    }
    
    // ============================================
    // INFORMAÇÕES DE SOFTWARE
    // ============================================
    
    /**
     * Carrega informações de software
     */
    function loadSoftwareInfo() {
        const clienteEl = document.getElementById('info-cliente');
        const backupEl = document.getElementById('info-backup');
        
        if (clienteEl) {
            clienteEl.textContent = 'Plasson do Brasil Ltda';
        }
        
        if (backupEl) {
            // Busca versão do backup do servidor
            fetch('/api/system/backup-version')
                .then(response => response.json())
                .then(data => {
                    backupEl.textContent = data.version || 'v1.0.0';
                })
                .catch(() => {
                    // Versão padrão se não conseguir buscar
                    backupEl.textContent = 'v1.0.0';
                });
        }
    }
    
    // ============================================
    // INFORMAÇÕES DE SISTEMA
    // ============================================
    
    /**
     * Carrega informações do sistema
     */
    function loadSystemInfo() {
        updateDateTime();
        loadIPAddress();
    }
    
    /**
     * Atualiza data e hora
     */
    function updateDateTime() {
        const datetimeEl = document.getElementById('info-datetime');
        if (!datetimeEl) return;
        
        const now = new Date();
        const options = {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        };
        
        datetimeEl.textContent = now.toLocaleDateString('pt-BR', options);
    }
    
    /**
     * Inicia atualização automática de data/hora
     */
    function startDateTimeUpdate() {
        // Atualiza imediatamente
        updateDateTime();
        
        // Atualiza a cada segundo
        dateTimeInterval = setInterval(updateDateTime, 1000);
        registerInfoInterval(dateTimeInterval);
    }
    
    /**
     * Carrega endereço IP da máquina
     */
    function loadIPAddress() {
        const ipEl = document.getElementById('info-ip');
        if (!ipEl) return;
        
        // Tenta buscar do servidor
        fetch('/api/system/ip')
            .then(response => response.json())
            .then(data => {
                ipEl.textContent = data.ip || 'Não disponível';
            })
            .catch(() => {
                // Fallback: usa a URL atual
                ipEl.textContent = window.location.hostname || 'localhost';
            });
    }
    
    // ============================================
    // SELEÇÃO DE IDIOMA
    // ============================================
    
    /**
     * Carrega e destaca o idioma atual
     */
    function loadCurrentLanguage() {
        const currentLang = window.Translations ? 
            window.Translations.getCurrentLanguage() : 'pt';
        
        // Remove active de todos os botões
        const langButtons = document.querySelectorAll('.language-btn');
        langButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-lang') === currentLang) {
                btn.classList.add('active');
            }
        });
    }
    
    /**
     * Seleciona um idioma
     * @param {string} lang Código do idioma
     */
    function selectLanguage(lang) {
        console.log('[INFORMATION] 🌐 Selecionando idioma:', lang);
        
        // Atualiza visual
        const langButtons = document.querySelectorAll('.language-btn');
        langButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-lang') === lang) {
                btn.classList.add('active');
            }
        });
        
        // Aplica a tradução
        if (window.Translations) {
            window.Translations.setLanguage(lang);
        } else if (window.setLanguage) {
            window.setLanguage(lang);
        } else {
            console.warn('[INFORMATION] Sistema de traduções não disponível');
            // Salva pelo menos no localStorage
            localStorage.setItem('supervisor_language', lang);
        }
        
        // Notifica o usuário
        showLanguageNotification(lang);
    }
    
    /**
     * Mostra notificação de mudança de idioma
     * @param {string} lang Código do idioma
     */
    function showLanguageNotification(lang) {
        const langNames = {
            'pt': 'Português',
            'en': 'English',
            'es': 'Español',
            'zh': '中文',
            'ja': '日本語'
        };
        
        const notification = document.createElement('div');
        notification.className = 'info-notification';
        notification.innerHTML = `
            <span class="notification-icon">🌐</span>
            <span class="notification-text">Idioma alterado para: ${langNames[lang] || lang}</span>
        `;
        
        // Estilos inline para a notificação
        notification.style.cssText = `
            position: fixed;
            top: 30px;
            right: 30px;
            background: linear-gradient(135deg, #28a745 0%, #1e7e34 100%);
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow: 0 6px 20px rgba(0,0,0,0.3);
            z-index: 10001;
            display: flex;
            align-items: center;
            gap: 12px;
            font-weight: 600;
            font-size: 15px;
            transform: translateX(120%);
            transition: transform 0.4s ease-out;
        `;
        
        document.body.appendChild(notification);
        
        // Animação de entrada
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 50);
        
        // Remove após 3 segundos
        setTimeout(() => {
            notification.style.transform = 'translateX(120%)';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 400);
        }, 3000);
    }
    
    // ============================================
    // CONFIGURAÇÕES DE MÁQUINA
    // ============================================
    
    /**
     * Abre o modal de configurações da máquina
     */
    function openMachineSettings() {
        console.log('[INFORMATION] 🔧 Abrindo configurações da máquina...');
        
        // Usa o modal existente do sistema
        if (typeof window.showMachineModal === 'function') {
            window.showMachineModal();
        } else {
            // Fallback: tenta abrir o modal diretamente
            const modal = document.getElementById('machine-modal');
            if (modal) {
                modal.classList.remove('hidden');
                modal.classList.add('show');
                modal.style.display = 'flex';
            } else {
                console.warn('[INFORMATION] Modal de máquina não encontrado');
            }
        }
    }
    
    // ============================================
    // EXPORTAÇÃO GLOBAL
    // ============================================
    
    window.inicializarInformation = inicializarInformation;
    window.cleanupInformation = cleanupInformation;
    window.selectLanguage = selectLanguage;
    window.openMachineSettings = openMachineSettings;
    
    console.log('[INFORMATION] 📋 Script de informações carregado');
    
})();
