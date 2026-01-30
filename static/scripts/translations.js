/**
 * Sistema de Tradução Multi-Idioma
 * Gerencia traduções para todo o sistema supervisório
 * Idiomas suportados: Português (pt), Inglês (en), Espanhol (es), Chinês (zh), Japonês (ja)
 */

(function() {
    'use strict';
    
    // ============================================
    // CONFIGURAÇÃO E ESTADO
    // ============================================
    const TRANSLATIONS_URL = '/static/data/translations.json';
    const LANGUAGE_STORAGE_KEY = 'supervisor_language';
    const DEFAULT_LANGUAGE = 'pt';
    
    let translationsData = null;
    let currentLanguage = DEFAULT_LANGUAGE;
    let isLoaded = false;
    
    // ============================================
    // FUNÇÕES PRINCIPAIS
    // ============================================
    
    /**
     * Carrega o arquivo de traduções do servidor
     * @returns {Promise<boolean>} Sucesso do carregamento
     */
    async function loadTranslations() {
        if (isLoaded && translationsData) {
            console.log('[TRANSLATIONS] ✅ Traduções já carregadas');
            return true;
        }
        
        try {
            console.log('[TRANSLATIONS] 📥 Carregando arquivo de traduções...');
            const response = await fetch(TRANSLATIONS_URL + '?t=' + Date.now());
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            translationsData = await response.json();
            isLoaded = true;
            
            // Carrega idioma salvo do localStorage
            const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
            if (savedLanguage && isValidLanguage(savedLanguage)) {
                currentLanguage = savedLanguage;
            }
            
            console.log('[TRANSLATIONS] ✅ Traduções carregadas. Idioma atual:', currentLanguage);
            return true;
        } catch (error) {
            console.error('[TRANSLATIONS] ❌ Erro ao carregar traduções:', error);
            return false;
        }
    }
    
    /**
     * Verifica se um idioma é válido
     * @param {string} lang Código do idioma
     * @returns {boolean}
     */
    function isValidLanguage(lang) {
        if (!translationsData || !translationsData._meta) return false;
        return translationsData._meta.languages.includes(lang);
    }
    
    /**
     * Obtém a tradução de uma chave
     * @param {string} section Seção da tradução (ex: 'menu', 'grid', 'alarm')
     * @param {string} key Chave da tradução
     * @param {string} [lang] Idioma (usa o atual se não especificado)
     * @returns {string} Texto traduzido ou chave original se não encontrado
     */
    function getTranslation(section, key, lang = null) {
        const targetLang = lang || currentLanguage;
        
        if (!translationsData || !translationsData.translations) {
            console.warn('[TRANSLATIONS] Traduções não carregadas');
            return key;
        }
        
        const sectionData = translationsData.translations[section];
        if (!sectionData) {
            console.warn(`[TRANSLATIONS] Seção não encontrada: ${section}`);
            return key;
        }
        
        const keyData = sectionData[key];
        if (!keyData) {
            console.warn(`[TRANSLATIONS] Chave não encontrada: ${section}.${key}`);
            return key;
        }
        
        // Se a tradução no idioma alvo está vazia, usa o português como fallback
        let translation = keyData[targetLang];
        if (!translation || translation.trim() === '') {
            translation = keyData[DEFAULT_LANGUAGE] || key;
        }
        
        return translation;
    }
    
    /**
     * Alias para getTranslation - formato mais curto
     * @param {string} path Caminho da tradução no formato "section.key"
     * @param {string} [lang] Idioma opcional
     * @returns {string} Texto traduzido
     */
    function t(path, lang = null) {
        const parts = path.split('.');
        if (parts.length !== 2) {
            console.warn('[TRANSLATIONS] Formato inválido. Use: "section.key"');
            return path;
        }
        return getTranslation(parts[0], parts[1], lang);
    }
    
    /**
     * Define o idioma atual
     * @param {string} lang Código do idioma
     * @returns {boolean} Sucesso da operação
     */
    function setLanguage(lang) {
        if (!isValidLanguage(lang)) {
            console.error('[TRANSLATIONS] Idioma inválido:', lang);
            return false;
        }
        
        currentLanguage = lang;
        localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
        
        console.log('[TRANSLATIONS] 🌐 Idioma alterado para:', lang);
        
        // Dispara evento para notificar componentes
        window.dispatchEvent(new CustomEvent('languageChanged', { 
            detail: { language: lang } 
        }));
        
        // Aplica traduções em todos os elementos com data-i18n
        applyTranslationsToDOM();
        
        return true;
    }
    
    /**
     * Obtém o idioma atual
     * @returns {string} Código do idioma atual
     */
    function getCurrentLanguage() {
        return currentLanguage;
    }
    
    /**
     * Obtém a lista de idiomas disponíveis
     * @returns {Array<{code: string, name: string}>}
     */
    function getAvailableLanguages() {
        if (!translationsData || !translationsData._meta) {
            return [{ code: 'pt', name: 'Português' }];
        }
        
        return translationsData._meta.languages.map(code => ({
            code: code,
            name: translationsData._meta.languageNames[code] || code
        }));
    }
    
    /**
     * Obtém o nome do idioma pelo código
     * @param {string} code Código do idioma
     * @returns {string} Nome do idioma
     */
    function getLanguageName(code) {
        if (!translationsData || !translationsData._meta) {
            return code;
        }
        return translationsData._meta.languageNames[code] || code;
    }
    
    // ============================================
    // APLICAÇÃO AUTOMÁTICA NO DOM
    // ============================================
    
    /**
     * Aplica traduções em todos os elementos com atributo data-i18n
     * Formato: data-i18n="section.key"
     */
    function applyTranslationsToDOM() {
        if (!isLoaded) {
            console.warn('[TRANSLATIONS] Traduções não carregadas ainda');
            return;
        }
        
        console.log('[TRANSLATIONS] 🔄 Aplicando traduções no DOM...');
        
        // Seleciona todos os elementos com data-i18n
        const elements = document.querySelectorAll('[data-i18n]');
        
        elements.forEach(element => {
            const path = element.getAttribute('data-i18n');
            const translation = t(path);
            
            // Verifica se deve aplicar em atributo específico
            const targetAttr = element.getAttribute('data-i18n-attr');
            
            if (targetAttr) {
                // Aplica em atributo (ex: placeholder, title, alt)
                element.setAttribute(targetAttr, translation);
            } else {
                // Aplica no conteúdo de texto
                element.textContent = translation;
            }
        });
        
        // Atualiza textos específicos do menu
        updateMenuTexts();
        
        console.log(`[TRANSLATIONS] ✅ ${elements.length} elementos traduzidos`);
    }
    
    /**
     * Atualiza textos do menu
     */
    function updateMenuTexts() {
        // Mapeamento de seletores para chaves de tradução
        const menuMappings = [
            { selector: '.menu-text', parentSelector: '[onclick*="showGrid"]', key: 'menu.inicio' },
            { selector: '.menu-text', parentSelector: '[onclick*="showAlarm"]', key: 'menu.alarmes' },
            { selector: '.menu-text', parentSelector: '[onclick*="showWeightRange"]', key: 'menu.faixa_peso' },
            { selector: '.menu-text', parentSelector: '[onclick*="showBalance"]', key: 'menu.balanca' },
            { selector: '.menu-text', parentSelector: '[onclick*="showClassification"]', key: 'menu.classificacao' },
            { selector: '.menu-text', parentSelector: '[onclick*="showGraphics"]', key: 'menu.graficos' },
            { selector: '.menu-text', parentSelector: '[onclick*="showWasher"]', key: 'menu.lavadora' },
            { selector: '.menu-text', parentSelector: '[onclick*="showDryer"]', key: 'menu.secadora' },
            { selector: '.menu-text', parentSelector: '[onclick*="showSamples"]', key: 'menu.amostras' },
            { selector: '.menu-text', parentSelector: '[onclick*="showDiagram"]', key: 'menu.diagramas' },
            { selector: '.menu-text', parentSelector: '[onclick*="showSynchronism"]', key: 'menu.sincronismo' },
            { selector: '.menu-text', parentSelector: '[onclick*="showWindows"]', key: 'menu.janelas' },
            { selector: '.menu-text', parentSelector: '[onclick*="showSolenoids"]', key: 'menu.solenoides' },
            { selector: '.menu-text', parentSelector: '[onclick*="showPanels"]', key: 'menu.paineis' },
            { selector: '.menu-text', parentSelector: '[onclick*="showInformation"]', key: 'menu.informacoes' }
        ];
        
        menuMappings.forEach(mapping => {
            const parent = document.querySelector(mapping.parentSelector);
            if (parent) {
                const textElement = parent.querySelector(mapping.selector);
                if (textElement) {
                    textElement.textContent = t(mapping.key);
                }
            }
        });
    }
    
    // ============================================
    // UTILITÁRIOS PARA SINCRONIZAÇÃO
    // ============================================
    
    /**
     * Adiciona uma nova chave de tradução (apenas em memória)
     * Para salvar permanentemente, use o endpoint do servidor
     * @param {string} section Seção
     * @param {string} key Chave
     * @param {string} ptText Texto em português
     */
    function addTranslationKey(section, key, ptText) {
        if (!translationsData || !translationsData.translations) {
            console.error('[TRANSLATIONS] Traduções não carregadas');
            return;
        }
        
        if (!translationsData.translations[section]) {
            translationsData.translations[section] = {};
        }
        
        if (!translationsData.translations[section][key]) {
            translationsData.translations[section][key] = {
                pt: ptText,
                en: '',
                es: '',
                zh: '',
                ja: ''
            };
            console.log(`[TRANSLATIONS] ➕ Nova chave adicionada: ${section}.${key}`);
        }
    }
    
    /**
     * Exporta todas as traduções (para backup/edição)
     * @returns {object} Dados de tradução
     */
    function exportTranslations() {
        return translationsData;
    }
    
    /**
     * Recarrega as traduções do servidor
     * @returns {Promise<boolean>}
     */
    async function reloadTranslations() {
        isLoaded = false;
        translationsData = null;
        return await loadTranslations();
    }
    
    // ============================================
    // INICIALIZAÇÃO
    // ============================================
    
    // Carrega traduções automaticamente quando o DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', async () => {
            await loadTranslations();
            applyTranslationsToDOM();
        });
    } else {
        // DOM já carregado
        loadTranslations().then(() => {
            applyTranslationsToDOM();
        });
    }
    
    // ============================================
    // EXPORTAÇÃO GLOBAL
    // ============================================
    
    window.Translations = {
        load: loadTranslations,
        get: getTranslation,
        t: t,
        setLanguage: setLanguage,
        getCurrentLanguage: getCurrentLanguage,
        getAvailableLanguages: getAvailableLanguages,
        getLanguageName: getLanguageName,
        applyToDOM: applyTranslationsToDOM,
        addKey: addTranslationKey,
        export: exportTranslations,
        reload: reloadTranslations
    };
    
    // Alias global para acesso rápido
    window.t = t;
    window.setLanguage = setLanguage;
    
    console.log('[TRANSLATIONS] 📚 Sistema de traduções inicializado');
    
})();
