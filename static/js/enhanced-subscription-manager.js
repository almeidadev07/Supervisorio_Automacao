/**
 * Sistema de Subscrições Aprimorado - Frontend
 * 
 * Este sistema integra com a nova arquitetura de controle dinâmico de tags,
 * permitindo subscrição por tela e otimização automática de leituras.
 */

class EnhancedSubscriptionManager {
    constructor() {
        this.clientId = this.generateClientId();
        this.currentScreen = null;
        this.subscribedTags = new Set();
        this.heartbeatInterval = null;
        this.heartbeatFrequency = 15000; // 15 segundos
        
        // Configurações
        this.apiBaseUrl = '/api/enhanced';
        this.retryAttempts = 3;
        this.retryDelay = 1000; // 1 segundo
        
        console.log(`[ENHANCED] Cliente inicializado: ${this.clientId}`);
        
        // Cleanup automático quando a página é fechada
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
        
        // Inicia heartbeat
        this.startHeartbeat();
        
        // Event listeners para mudanças de tela
        this.setupScreenChangeListeners();
    }
    
    generateClientId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        return `enhanced_client_${timestamp}_${random}`;
    }
    
    setupScreenChangeListeners() {
        // Escuta mudanças de rota (se usando SPA)
        if (window.history && window.history.pushState) {
            const originalPushState = history.pushState;
            const originalReplaceState = history.replaceState;
            
            history.pushState = function() {
                originalPushState.apply(history, arguments);
                this.handleRouteChange();
            }.bind(this);
            
            history.replaceState = function() {
                originalReplaceState.apply(history, arguments);
                this.handleRouteChange();
            }.bind(this);
            
            window.addEventListener('popstate', () => {
                this.handleRouteChange();
            });
        }
        
        // Escuta mudanças de hash
        window.addEventListener('hashchange', () => {
            this.handleRouteChange();
        });
    }
    
    handleRouteChange() {
        // Detecta mudança de tela baseada na URL
        const currentPath = window.location.pathname + window.location.hash;
        const screenName = this.detectScreenFromPath(currentPath);
        
        if (screenName && screenName !== this.currentScreen) {
            console.log(`[ENHANCED] 🖥️ Mudança de tela detectada: ${this.currentScreen} → ${screenName}`);
            this.subscribeToScreen(screenName);
        }
    }
    
    detectScreenFromPath(path) {
        // Mapeia caminhos para nomes de tela
        const pathToScreen = {
            '/': 'tela_principal',
            '/principal': 'tela_principal',
            '/alarmes': 'tela_alarmes',
            '/embaladoras': 'tela_embaladoras',
            '/acumuladora': 'tela_acumuladora',
            '/dosificadora': 'tela_dosificadora',
            '/escovas': 'tela_escovas',
            '/ovoscopia': 'tela_ovoscopia',
            '/classificadora': 'tela_classificadora',
            '/esteira-saida': 'tela_esteira_saida',
            '/lavadora': 'tela_lavadora',
            '/pred-branco': 'tela_pred_branco',
            '/pred-vermelho': 'tela_pred_vermelho',
            '/pesagem': 'tela_pesagem',
            '/solenoide': 'tela_solenoide',
            '/info-dispositivos': 'tela_info_dispositivos',
            '/partida-direta': 'tela_partida_direta'
        };
        
        // Tenta match exato primeiro
        if (pathToScreen[path]) {
            return pathToScreen[path];
        }
        
        // Tenta match por prefixo
        for (const [route, screen] of Object.entries(pathToScreen)) {
            if (path.startsWith(route)) {
                return screen;
            }
        }
        
        return null;
    }
    
    /**
     * Subscreve a uma tela específica
     * @param {string} screenName - Nome da tela
     */
    async subscribeToScreen(screenName) {
        if (!screenName) {
            console.error('[ENHANCED] subscribeToScreen: screenName é obrigatório');
            return false;
        }
        
        try {
            const response = await this.makeRequest('POST', '/subscribe_screen', {
                client_id: this.clientId,
                screen_name: screenName
            });
            
            if (response.ok) {
                this.currentScreen = screenName;
                console.log(`[ENHANCED] ✅ Subscrito à tela '${screenName}'`);
                
                // Notifica mudança de tela
                this.notifyScreenChange(screenName);
                
                return true;
            } else {
                console.error(`[ENHANCED] ❌ Erro na subscrição à tela: ${response.error}`);
                return false;
            }
        } catch (error) {
            console.error(`[ENHANCED] ❌ Erro de rede na subscrição à tela:`, error);
            return false;
        }
    }
    
    /**
     * Subscreve a tags específicas (modo manual)
     * @param {string[]} tagNames - Lista de nomes das tags
     */
    async subscribeToTags(tagNames) {
        if (!Array.isArray(tagNames)) {
            console.error('[ENHANCED] subscribeToTags: tagNames deve ser um array');
            return false;
        }
        
        try {
            const response = await this.makeRequest('POST', '/subscribe_tags', {
                client_id: this.clientId,
                tags: tagNames
            });
            
            if (response.ok) {
                // Atualiza conjunto local de tags subscritas
                this.subscribedTags.clear();
                tagNames.forEach(tag => this.subscribedTags.add(tag));
                
                console.log(`[ENHANCED] ✅ Subscrito a ${tagNames.length} tags (modo manual)`);
                return true;
            } else {
                console.error(`[ENHANCED] ❌ Erro na subscrição às tags: ${response.error}`);
                return false;
            }
        } catch (error) {
            console.error(`[ENHANCED] ❌ Erro de rede na subscrição às tags:`, error);
            return false;
        }
    }
    
    /**
     * Remove todas as subscrições deste cliente
     */
    async unsubscribe() {
        try {
            const response = await this.makeRequest('POST', '/unsubscribe', {
                client_id: this.clientId
            });
            
            if (response.ok) {
                this.subscribedTags.clear();
                this.currentScreen = null;
                console.log(`[ENHANCED] ✅ Subscrições removidas`);
                return true;
            } else {
                console.error(`[ENHANCED] ❌ Erro ao remover subscrições: ${response.error}`);
                return false;
            }
        } catch (error) {
            console.error(`[ENHANCED] ❌ Erro de rede ao remover subscrições:`, error);
            return false;
        }
    }
    
    /**
     * Envia heartbeat para manter a subscrição ativa
     */
    async sendHeartbeat() {
        try {
            const response = await this.makeRequest('POST', '/heartbeat', {
                client_id: this.clientId
            });
            
            if (!response.ok) {
                console.warn(`[ENHANCED] ⚠️ Heartbeat falhou: ${response.error}`);
            }
        } catch (error) {
            console.warn(`[ENHANCED] ⚠️ Erro no heartbeat:`, error);
        }
    }
    
    /**
     * Lê tags específicas
     * @param {string[]} tags - Lista de tags para ler
     */
    async readTags(tags) {
        if (!Array.isArray(tags)) {
            console.error('[ENHANCED] readTags: tags deve ser um array');
            return null;
        }
        
        try {
            const response = await this.makeRequest('POST', '/read_tags', {
                tags: tags
            });
            
            if (response.ok) {
                return response.data;
            } else {
                console.error(`[ENHANCED] ❌ Erro na leitura de tags: ${response.error}`);
                return null;
            }
        } catch (error) {
            console.error(`[ENHANCED] ❌ Erro de rede na leitura de tags:`, error);
            return null;
        }
    }
    
    /**
     * Escreve tags específicas
     * @param {Object} tagValues - Objeto com {tag: value}
     */
    async writeTags(tagValues) {
        if (!tagValues || typeof tagValues !== 'object') {
            console.error('[ENHANCED] writeTags: tagValues deve ser um objeto');
            return false;
        }
        
        try {
            const response = await this.makeRequest('POST', '/write_tags', {
                tag_values: tagValues
            });
            
            if (response.ok) {
                console.log(`[ENHANCED] ✅ Tags escritas com sucesso`);
                return true;
            } else {
                console.error(`[ENHANCED] ❌ Erro na escrita de tags: ${response.error}`);
                return false;
            }
        } catch (error) {
            console.error(`[ENHANCED] ❌ Erro de rede na escrita de tags:`, error);
            return false;
        }
    }
    
    /**
     * Obtém status do sistema
     */
    async getStatus() {
        try {
            const response = await this.makeRequest('GET', '/status');
            
            if (response.ok) {
                return response.status;
            } else {
                console.error(`[ENHANCED] ❌ Erro ao obter status: ${response.error}`);
                return null;
            }
        } catch (error) {
            console.error(`[ENHANCED] ❌ Erro de rede ao obter status:`, error);
            return null;
        }
    }
    
    /**
     * Obtém telas disponíveis
     */
    async getAvailableScreens() {
        try {
            const response = await this.makeRequest('GET', '/screens');
            
            if (response.ok) {
                return response.screens;
            } else {
                console.error(`[ENHANCED] ❌ Erro ao obter telas: ${response.error}`);
                return null;
            }
        } catch (error) {
            console.error(`[ENHANCED] ❌ Erro de rede ao obter telas:`, error);
            return null;
        }
    }
    
    /**
     * Obtém informações de uma tela específica
     * @param {string} screenName - Nome da tela
     */
    async getScreenInfo(screenName) {
        try {
            const response = await this.makeRequest('GET', `/screen/${screenName}`);
            
            if (response.ok) {
                return response.screen;
            } else {
                console.error(`[ENHANCED] ❌ Erro ao obter tela: ${response.error}`);
                return null;
            }
        } catch (error) {
            console.error(`[ENHANCED] ❌ Erro de rede ao obter tela:`, error);
            return null;
        }
    }
    
    /**
     * Força reconexão de PLCs
     * @param {string} group - Grupo específico (opcional)
     */
    async forceReconnect(group = null) {
        try {
            const response = await this.makeRequest('POST', '/force_reconnect', {
                group: group
            });
            
            if (response.ok) {
                console.log(`[ENHANCED] ✅ Reconexão forçada: ${response.message}`);
                return true;
            } else {
                console.error(`[ENHANCED] ❌ Erro na reconexão: ${response.error}`);
                return false;
            }
        } catch (error) {
            console.error(`[ENHANCED] ❌ Erro de rede na reconexão:`, error);
            return false;
        }
    }
    
    /**
     * Inicia o heartbeat automático
     */
    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, this.heartbeatFrequency);
        
        console.log(`[ENHANCED] Heartbeat iniciado (${this.heartbeatFrequency/1000}s)`);
    }
    
    /**
     * Para o heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
            console.log(`[ENHANCED] Heartbeat parado`);
        }
    }
    
    /**
     * Notifica mudança de tela
     * @param {string} screenName - Nome da nova tela
     */
    notifyScreenChange(screenName) {
        // Dispara evento customizado
        const event = new CustomEvent('screenChanged', {
            detail: {
                screen: screenName,
                clientId: this.clientId,
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
    }
    
    /**
     * Faz requisição HTTP com retry automático
     * @param {string} method - Método HTTP
     * @param {string} endpoint - Endpoint da API
     * @param {Object} data - Dados para enviar
     */
    async makeRequest(method, endpoint, data = null) {
        let lastError = null;
        
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                const url = `${this.apiBaseUrl}${endpoint}`;
                const options = {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                    }
                };
                
                if (data && (method === 'POST' || method === 'PUT')) {
                    options.body = JSON.stringify(data);
                }
                
                const response = await fetch(url, options);
                const result = await response.json();
                
                if (response.ok) {
                    return result;
                } else {
                    lastError = new Error(result.error || `HTTP ${response.status}`);
                }
                
            } catch (error) {
                lastError = error;
                console.warn(`[ENHANCED] ⚠️ Tentativa ${attempt}/${this.retryAttempts} falhou:`, error.message);
                
                if (attempt < this.retryAttempts) {
                    await this.delay(this.retryDelay * attempt);
                }
            }
        }
        
        throw lastError;
    }
    
    /**
     * Delay helper
     * @param {number} ms - Milissegundos para aguardar
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Limpeza completa - remove subscrições e para heartbeat
     */
    async cleanup() {
        this.stopHeartbeat();
        await this.unsubscribe();
        console.log(`[ENHANCED] Cleanup completo para cliente ${this.clientId}`);
    }
    
    /**
     * Obtém informações do cliente atual
     */
    getClientInfo() {
        return {
            clientId: this.clientId,
            currentScreen: this.currentScreen,
            subscribedTagsCount: this.subscribedTags.size,
            heartbeatActive: this.heartbeatInterval !== null
        };
    }
}

// Instância global
window.enhancedSubscriptionManager = new EnhancedSubscriptionManager();

/**
 * EXEMPLOS DE USO:
 * 
 * // 1. Subscrever a uma tela
 * enhancedSubscriptionManager.subscribeToScreen('tela_alarmes');
 * 
 * // 2. Subscrever a tags específicas
 * enhancedSubscriptionManager.subscribeToTags([
 *     'XLCLASS_DB1_PRINCIPAL_ALARMES_ALTO_PRINCIPAIS',
 *     'XLCLASS_DB04_PRINCIPAL_EMERG_PAINEL_PRINCIPAL'
 * ]);
 * 
 * // 3. Ler tags
 * const data = await enhancedSubscriptionManager.readTags(['TAG1', 'TAG2']);
 * 
 * // 4. Escrever tags
 * await enhancedSubscriptionManager.writeTags({
 *     'TAG1': 100,
 *     'TAG2': true
 * });
 * 
 * // 5. Obter status
 * const status = await enhancedSubscriptionManager.getStatus();
 * 
 * // 6. Escutar mudanças de tela
 * window.addEventListener('screenChanged', (event) => {
 *     console.log('Tela mudou para:', event.detail.screen);
 * });
 */
