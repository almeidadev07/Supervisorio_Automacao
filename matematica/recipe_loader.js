/**
 * Carregador de Receitas para Sistema de Classificação
 * Integra com o sistema existente para carregar receitas e gravar no PLC
 * Baseado no mapeamento fornecido pelo usuário
 */

class RecipeLoader {
    constructor() {
        // Mapeamento de classes para P's (conforme especificado)
        this.classToP = {
            'C1': 'P1',
            'C2': 'P2', 
            'C3': 'P3',
            'C4': 'P4',
            'C5': 'P5',
            'C6': 'P6',
            'C7': 'P7',
            'CRACK': 'P9',
            'VISIO': 'P10'
        };
        
        // Mapeamento de embaladoras para posições (conforme especificado)
        this.embaladorasOrder = ['IND'] + Array.from({length: 24}, (_, i) => `E${String(i + 1).padStart(2, '0')}`) + ['SPJ'];
        
        // Mapeamento de classes para bits no SPJ (conforme especificado)
        this.spjClassToBit = {
            'VISIO': 0,
            'CRACK': 15
        };
        // C1..C7 => bits 8..14
        for (let i = 1; i <= 7; i++) {
            this.spjClassToBit[`C${i}`] = 7 + i;
        }
    }

    /**
     * Retorna (index, bit) para uma embaladora
     * IND..E15 => [1], bits 0..15
     * E16..SPJ => [0], bits reiniciam em 0
     */
    getEmbaladoraBitAndIndex(embId) {
        try {
            const pos = this.embaladorasOrder.indexOf(embId);
            if (pos <= 15) {
                return [1, pos]; // [1], bits 0..15
            } else {
                return [0, pos - 16]; // [0], bits reiniciam em 0
            }
        } catch (error) {
            return null;
        }
    }

    /**
     * Define um bit específico em uma palavra
     */
    setBit(word, bitIndex, value) {
        const w = Number(word) >>> 0;
        const b = Number(bitIndex) >>> 0;
        return value ? (w | (1 << b)) : (w & ~(1 << b));
    }

    /**
     * Processa embaladora SPJ (classes a ignorar)
     */
    processSPJ(payload, embaladora) {
        let whiteWord = 0;
        let redWord = 0;
        
        for (const classe of embaladora.classes) {
            const bit = this.spjClassToBit[classe.id];
            if (bit === undefined) continue;
                
            const isCrackVisio = ['CRACK', 'VISIO'].includes(classe.id);
            
            if (isCrackVisio) {
                // CRACK/VISIO no SPJ só usa DB200 (misto)
                if (classe.tipo === 'misto') {
                    whiteWord = this.setBit(whiteWord, bit, true);
                    redWord = this.setBit(redWord, bit, false);
                } else {
                    whiteWord = this.setBit(whiteWord, bit, false);
                    redWord = this.setBit(redWord, bit, false);
                }
            } else {
                // Classes normais C1-C7
                if (classe.tipo === 'branco') {
                    whiteWord = this.setBit(whiteWord, bit, true);
                    redWord = this.setBit(redWord, bit, false);
                } else if (classe.tipo === 'vermelho') {
                    whiteWord = this.setBit(whiteWord, bit, false);
                    redWord = this.setBit(redWord, bit, true);
                } else if (classe.tipo === 'misto') {
                    whiteWord = this.setBit(whiteWord, bit, true);
                    redWord = this.setBit(redWord, bit, true);
                } else {
                    whiteWord = this.setBit(whiteWord, bit, false);
                    redWord = this.setBit(redWord, bit, false);
                }
            }
        }
        
        payload['XLCLASS_DB200_CLASSIFICACAO_CLASSES_A_IGNORAR'] = whiteWord;
        payload['XLCLASS_DB201_CLASSIFICACAO_CLASSES_A_IGNORAR'] = redWord;
    }

    /**
     * Processa embaladora normal (IND, E01-E24)
     */
    processEmbaladoraNormal(payload, embaladora) {
        const mapping = this.getEmbaladoraBitAndIndex(embaladora.id);
        if (!mapping) return;
            
        const [index, bit] = mapping;
        
        // Inicializa palavras para todas as classes
        const classWords = {};
        for (const classId of Object.keys(this.classToP)) {
            classWords[classId] = { white: 0, red: 0 };
        }
        
        // Processa classes da embaladora
        for (const classe of embaladora.classes) {
            if (!(classe.id in this.classToP)) continue;
                
            const p = this.classToP[classe.id];
            
            if (classe.tipo === 'branco') {
                classWords[classe.id].white = this.setBit(classWords[classe.id].white, bit, true);
                classWords[classe.id].red = this.setBit(classWords[classe.id].red, bit, false);
            } else if (classe.tipo === 'vermelho') {
                classWords[classe.id].white = this.setBit(classWords[classe.id].white, bit, false);
                classWords[classe.id].red = this.setBit(classWords[classe.id].red, bit, true);
            } else if (classe.tipo === 'misto') {
                classWords[classe.id].white = this.setBit(classWords[classe.id].white, bit, true);
                classWords[classe.id].red = this.setBit(classWords[classe.id].red, bit, true);
            } else {
                classWords[classe.id].white = this.setBit(classWords[classe.id].white, bit, false);
                classWords[classe.id].red = this.setBit(classWords[classe.id].red, bit, false);
            }
        }
        
        // Adiciona tags ao payload
        for (const [classId, words] of Object.entries(classWords)) {
            const p = this.classToP[classId];
            payload[`XLCLASS_DB200_CLASSIFICACAO_${p}[${index}]`] = words.white;
            payload[`XLCLASS_DB201_CLASSIFICACAO_${p}[${index}]`] = words.red;
        }
    }

    /**
     * Gera o mapeamento de tags PLC para uma receita
     * Retorna dicionário com {tag: valor} para escrita no PLC
     */
    generatePLCTagsForRecipe(recipe) {
        const payload = {};
        
        // Processa cada embaladora da receita
        for (const embaladora of recipe.configuracao) {
            if (embaladora.id === 'SPJ') {
                // SPJ usa tags especiais de classes a ignorar
                this.processSPJ(payload, embaladora);
            } else {
                // Embaladoras normais usam tags XLCLASS_DB200/DB201
                this.processEmbaladoraNormal(payload, embaladora);
            }
        }
        
        return payload;
    }

    /**
     * Carrega uma receita e grava no PLC
     * Integra com o sistema existente de classificação
     */
    async loadRecipeToPLC(recipe, writeWordsFunction) {
        try {
            console.log(`=== CARREGANDO RECEITA: ${recipe.nome} ===`);
            
            // Gera tags para o PLC
            const tagsPLC = this.generatePLCTagsForRecipe(recipe);
            
            console.log(`Tags geradas: ${Object.keys(tagsPLC).length} tags`);
            console.log('Payload gerado:', tagsPLC);
            
            // Grava no PLC usando a função existente
            const sucesso = await writeWordsFunction(tagsPLC);
            
            if (sucesso) {
                console.log(`✅ Receita '${recipe.nome}' carregada com sucesso no PLC`);
                return true;
            } else {
                console.error(`❌ Falha ao carregar receita '${recipe.nome}' no PLC`);
                return false;
            }
            
        } catch (error) {
            console.error(`❌ Erro ao carregar receita: ${error}`);
            return false;
        }
    }

    /**
     * Valida uma receita e retorna lista de erros
     */
    validateRecipe(recipe) {
        const erros = [];
        
        // Valida estrutura básica
        if (!recipe.nome || !recipe.nome.trim()) {
            erros.push("Nome da receita não pode estar vazio");
        }
        
        if (!recipe.configuracao || recipe.configuracao.length === 0) {
            erros.push("Receita deve ter pelo menos uma embaladora configurada");
        }
        
        // Valida embaladoras
        for (const embaladora of recipe.configuracao) {
            if (!this.embaladorasOrder.includes(embaladora.id)) {
                erros.push(`Embaladora '${embaladora.id}' não é válida`);
            }
            
            // Valida classes
            for (const classe of embaladora.classes) {
                if (!(classe.id in this.classToP) && !(classe.id in this.spjClassToBit)) {
                    erros.push(`Classe '${classe.id}' não é válida`);
                }
                
                if (!['branco', 'vermelho', 'misto'].includes(classe.tipo)) {
                    erros.push(`Tipo '${classe.tipo}' não é válido para classe '${classe.id}'`);
                }
            }
        }
        
        return erros;
    }

    /**
     * Cria uma receita de exemplo para teste
     */
    createExampleRecipe() {
        return {
            "id": Date.now(),
            "nome": "Receita Exemplo",
            "configuracao": [
                {
                    "id": "E01",
                    "nome": "E01",
                    "classes": [
                        {
                            "id": "C1",
                            "nome": "C1",
                            "cor": "#FF3399",
                            "tipo": "branco"
                        },
                        {
                            "id": "C2",
                            "nome": "C2", 
                            "cor": "#FFFF00",
                            "tipo": "vermelho"
                        }
                    ]
                },
                {
                    "id": "E02",
                    "nome": "E02",
                    "classes": [
                        {
                            "id": "C3",
                            "nome": "C3",
                            "cor": "#0000FF",
                            "tipo": "misto"
                        }
                    ]
                },
                {
                    "id": "SPJ",
                    "nome": "SPJ",
                    "classes": [
                        {
                            "id": "CRACK",
                            "nome": "CRACK",
                            "cor": "#999999",
                            "tipo": "misto"
                        }
                    ]
                }
            ],
            "dataCriacao": new Date().toISOString()
        };
    }
}

// Exporta para uso global
window.RecipeLoader = RecipeLoader;
