/**
 * Sistema de Subscrições de Tags - Frontend
 * 
 * Este sistema permite que cada tela/página do supervisório
 * informe ao servidor quais tags precisa, reduzindo drasticamente
 * a carga no PLC ao ler apenas dados necessários.
 */

class SubscriptionManager {
    constructor() {
        this.clientId = this.generateClientId();
        this.subscribedTags = new Set();
        this.heartbeatInterval = null;
        this.heartbeatFrequency = 15000; // 15 segundos
        
        console.log(`[SUB] Cliente inicializado: ${this.clientId}`);
        
        // Cleanup automático quando a página é fechada
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
        
        // Inicia heartbeat
        this.startHeartbeat();
    }
    
    generateClientId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        return `client_${timestamp}_${random}`;
    }
    
    /**
     * Subscreve a uma lista de tags para esta tela
     * @param {string[]} tagNames - Lista de nomes das tags
     */
    async subscribeTo(tagNames) {
        if (!Array.isArray(tagNames)) {
            console.error('[SUB] subscribeTo expects an array of tag names');
            return false;
        }
        
        try {
            const response = await fetch('/api/subscribe_tags', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    client_id: this.clientId,
                    tags: tagNames
                })
            });
            
            const result = await response.json();
            
            if (result.ok) {
                // Atualiza conjunto local de tags subscritas
                this.subscribedTags.clear();
                tagNames.forEach(tag => this.subscribedTags.add(tag));
                
                console.log(`[SUB] ✅ Subscrito a ${result.subscribed_tags} tags`);
                return true;
            } else {
                console.error(`[SUB] ❌ Erro na subscrição: ${result.error}`);
                return false;
            }
        } catch (error) {
            console.error(`[SUB] ❌ Erro de rede na subscrição:`, error);
            return false;
        }
    }
    
    /**
     * Remove todas as subscrições deste cliente
     */
    async unsubscribe() {
        try {
            const response = await fetch('/api/unsubscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    client_id: this.clientId
                })
            });
            
            const result = await response.json();
            
            if (result.ok) {
                this.subscribedTags.clear();
                console.log(`[SUB] ✅ Subscrições removidas`);
                return true;
            } else {
                console.error(`[SUB] ❌ Erro ao remover subscrições: ${result.error}`);
                return false;
            }
        } catch (error) {
            console.error(`[SUB] ❌ Erro de rede ao remover subscrições:`, error);
            return false;
        }
    }
    
    /**
     * Envia heartbeat para manter a subscrição ativa
     */
    async sendHeartbeat() {
        try {
            const response = await fetch('/api/heartbeat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    client_id: this.clientId
                })
            });
            
            const result = await response.json();
            
            if (!result.ok) {
                console.warn(`[SUB] ⚠️ Heartbeat falhou: ${result.error}`);
            }
        } catch (error) {
            console.warn(`[SUB] ⚠️ Erro no heartbeat:`, error);
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
        
        console.log(`[SUB] Heartbeat iniciado (${this.heartbeatFrequency/1000}s)`);
    }
    
    /**
     * Para o heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
            console.log(`[SUB] Heartbeat parado`);
        }
    }
    
    /**
     * Limpeza completa - remove subscrições e para heartbeat
     */
    async cleanup() {
        this.stopHeartbeat();
        await this.unsubscribe();
        console.log(`[SUB] Cleanup completo para cliente ${this.clientId}`);
    }
    
    /**
     * Verifica status das subscrições no servidor
     */
    async getStatus() {
        try {
            const response = await fetch('/api/subscriptions');
            const result = await response.json();
            
            if (result.ok) {
                console.log(`[SUB] Status: ${result.active_clients} clientes, ${result.total_subscribed_tags} tags`);
                return result;
            }
        } catch (error) {
            console.error(`[SUB] ❌ Erro ao obter status:`, error);
        }
        return null;
    }
}

// Instância global
window.subscriptionManager = new SubscriptionManager();

/**
 * EXEMPLOS DE USO:
 * 
 * // 1. Em uma tela de alarmes
 * subscriptionManager.subscribeTo([
 *     'XLCLASS_DB1_PRINCIPAL_ALARMES_ALTO_PRINCIPAIS',
 *     'XLCLASS_DB04_PRINCIPAL_EMERG_PAINEL_PRINCIPAL',
 *     'XLCLASS_DB04_PRINCIPAL_EMERG_EST_INTELIGENTES'
 * ]);
 * 
 * // 2. Em uma tela de velocidades
 * subscriptionManager.subscribeTo([
 *     'XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_REAL',
 *     'XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG'
 * ]);
 * 
 * // 3. Quando trocar de tela
 * subscriptionManager.subscribeTo(novasTagsDaTela);
 * 
 * // 4. Verificar status
 * subscriptionManager.getStatus();
 */
