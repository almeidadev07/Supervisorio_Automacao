/**
 * Tela de Gráficos - Sistema de Classificação
 * Gráfico de barras para classes C1-C7 com fluxo real e programado
 */

let classesChart = null;
let dataUpdateIntervalId = null;
let chartData = {
    realFlow: [0, 0, 0, 0, 0, 0, 0], // Fluxo real para C1-C7
    programmedFlow: [0, 0, 0, 0, 0, 0, 0] // Fluxo programado para C1-C7
};

function getCssVar(name, fallback) {
    try {
        const value = getComputedStyle(document.documentElement).getPropertyValue(name);
        return value ? value.trim() : (fallback || '');
    } catch (_) {
        return fallback || '';
    }
}

function applyChartTheme() {
    if (!classesChart || !classesChart.options) return;
    const textColor = getCssVar('--text-primary', '#2c3e50');
    const gridColor = getCssVar('--chart-grid', 'rgba(0, 0, 0, 0.1)');
    const opts = classesChart.options;

    if (opts.plugins && opts.plugins.title) {
        opts.plugins.title.color = textColor;
    }
    if (opts.scales && opts.scales.x) {
        if (opts.scales.x.title) opts.scales.x.title.color = textColor;
        if (opts.scales.x.ticks) opts.scales.x.ticks.color = textColor;
        if (opts.scales.x.grid) opts.scales.x.grid.color = gridColor;
    }
    if (opts.scales && opts.scales.y) {
        if (opts.scales.y.title) opts.scales.y.title.color = textColor;
        if (opts.scales.y.ticks) opts.scales.y.ticks.color = textColor;
        if (opts.scales.y.grid) opts.scales.y.grid.color = gridColor;
    }

    classesChart.update('none');
}

// Estados dos símbolos + e - para cada classe
let classSymbols = {
    plus: [false, false, false, false, false, false, false],  // Símbolo + para C1-C7
    minus: [false, false, false, false, false, false, false]   // Símbolo - para C1-C7
};

// Mapeamento de tags de fluxo por classe
// Ordem: C1 (Industrial), C2 (Médio), C3 (Grande), C4 (Extra), C5 (Jumbo), C6 (Super Jumbo), C7
const FLUXO_TAGS = {
    real: [
        'XLCLASS_DB03_CONTROLE_DE_VELOCIDADE_DINAMICA_FLUXO_REAL_IND',      // C1 - Industrial
        'XLCLASS_DB03_CONTROLE_DE_VELOCIDADE_DINAMICA_FLUXO_REAL_PQ',      // C2 - Médio
        'XLCLASS_DB03_CONTROLE_DE_VELOCIDADE_DINAMICA_FLUXO_REAL_MED',     // C3 - Grande
        'XLCLASS_DB03_CONTROLE_DE_VELOCIDADE_DINAMICA_FLUXO_REAL_GRD',     // C4 - Extra
        'XLCLASS_DB03_CONTROLE_DE_VELOCIDADE_DINAMICA_FLUXO_REAL_EXG',     // C5 - Jumbo
        'XLCLASS_DB03_CONTROLE_DE_VELOCIDADE_DINAMICA_FLUXO_REAL_JUM',     // C6 - Super Jumbo
        'XLCLASS_DB03_CONTROLE_DE_VELOCIDADE_DINAMICA_FLUXO_REAL_SPJ'      // C7
    ],
    max: [
        'XLCLASS_DB03_CONTROLE_DE_VELOCIDADE_DINAMICA_FLUXO_MAX_PERMITIDO_IND',  // C1 - Industrial
        'XLCLASS_DB03_CONTROLE_DE_VELOCIDADE_DINAMICA_FLUXO_MAX_PERMITIDO_PQ',   // C2 - Médio
        'XLCLASS_DB03_CONTROLE_DE_VELOCIDADE_DINAMICA_FLUXO_MAX_PERMITIDO_MED',  // C3 - Grande
        'XLCLASS_DB03_CONTROLE_DE_VELOCIDADE_DINAMICA_FLUXO_MAX_PERMITIDO_GRD',  // C4 - Extra
        'XLCLASS_DB03_CONTROLE_DE_VELOCIDADE_DINAMICA_FLUXO_MAX_PERMITIDO_EXG',  // C5 - Jumbo
        'XLCLASS_DB03_CONTROLE_DE_VELOCIDADE_DINAMICA_FLUXO_MAX_PERMITIDO_JUM',  // C6 - Super Jumbo
        'XLCLASS_DB03_CONTROLE_DE_VELOCIDADE_DINAMICA_FLUXO_MAX_PERMITIDO_SPJ'   // C7
    ]
};

// Tag de habilitação de controle (WORD - 16 bits)
const HAB_CONTROLE_TAG = 'XLCLASS_DB03_CONTROLE_DE_VELOCIDADE_DINAMICA_HAB_CONTROLE';
// Mapeamento de bits por classe: C1=bit8, C2=bit9, C3=bit10, C4=bit11, C5=bit12, C6=bit13, C7=bit14
const HAB_CONTROLE_BITS = [8, 9, 10, 11, 12, 13, 14];

// Sistema de subscription
let graphicsClientId = null;
let graphicsHeartbeatTimer = null;
let graphicsSocket = null;
let graphicsTelemetryHandler = null; // Handler do Socket.IO para cleanup
let isGraphicsScreenVisible = false;
let isGridScreenVisible = false;
let graphicsEventListeners = [];
let graphicsNameUpdateInFlight = false;
let graphicsHeartbeatInFlight = false;
let graphicsSubscriptionInFlight = false;

function registerGraphicsEventListener(element, event, handler, options) {
    if (element) {
        element.addEventListener(event, handler, options);
        graphicsEventListeners.push({ element, event, handler, options });
    }
}

// ✅ IDs dos intervalos para poder limpar depois (CRÍTICO para evitar vazamento de memória)
let graphicsSubscriptionCheckInterval = null;
let graphicsNameUpdateInterval = null;
let graphicsBackgroundStarted = false;

// Cores das classes (conforme definido na tela de classificação)
const CLASS_COLORS = {
    'C1': '#FF3399',
    'C2': '#FFFF00', 
    'C3': '#0000FF',
    'C4': '#33CC33',
    'C5': '#FF6600',
    'C6': '#33CCFF',
    'C7': '#00FF99'
};

let CLASS_NAMES = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'];

// ============================================================================
// API para buscar nomes das classes do PLC via DataHub
// ============================================================================
const graphicsApi = {
    /**
     * Verifica conexão PLC ↔ DataHub
     * @returns {Promise<boolean>} true se conectado
     */
    async checkPLCConnection() {
        try {
            const res = await fetch('http://localhost:8000/api/status', { cache: 'no-store' });
            if (!res.ok) return false;
            const data = await res.json();
            return data.connected === true;
        } catch (e) {
            console.error('[GRAPHICS] Erro ao verificar conexão PLC:', e);
            return false;
        }
    },
    /**
     * Busca os nomes dinâmicos das classes C1-C7 do PLC via DataHub
     * @returns {Promise<string[]>} Array com os nomes das 7 classes
     */
async getClassLabels() {
        try {
            const tagNames = Array.from({ length: 7 }, (_, i) => `XLCLASS_DB202_NOME_DINAMICO[${i}]`).join(',');
            const url = `/api/read_tags?names=${encodeURIComponent(tagNames)}`;
            const response = await fetch(url, { cache: 'no-store' });
            
            if (!response.ok) {
                console.warn('[graphics] Falha ao buscar nomes das classes:', response.status);
                return null;
            }
            
            const data = await response.json();
            if (!data || !data.ok || !data.values) {
                console.warn('[graphics] Resposta inválida da API de tags');
                return null;
            }
            
            const values = data.values;
            const labels = Array.from({ length: 7 }, (_, i) => {
                const key = `XLCLASS_DB202_NOME_DINAMICO[${i}]`;
                const value = values[key];
                // Se o valor for nulo, undefined ou vazio, usa o nome padrão Cx
                if (value === null || typeof value === 'undefined' || String(value).trim() === '') {
                    return `C${i + 1}`;
                }
                return String(value).trim();
            });
            
            console.log('[graphics] Nomes das classes carregados do PLC:', labels);
            return labels;
        } catch (error) {
            console.error('[graphics] Erro ao buscar nomes das classes:', error);
            return null;
        }
    }
};

/**
 * Atualiza os nomes das classes buscando do PLC
 * @returns {Promise<boolean>} true se atualizou com sucesso
 */
async function refreshClassLabelsFromPLC() {
    try {
        const labels = await graphicsApi.getClassLabels();
        if (labels && labels.length === 7) {
            CLASS_NAMES = labels;
            
            // Atualiza o gráfico se existir
            if (classesChart && classesChart.data) {
                // Atualiza labels com símbolos
                classesChart.data.labels = generateFormattedLabels();
                classesChart.update('none');
            }
            
            // Atualiza a legenda
            try { 
                renderClassesLegend(); 
                renderSymbolsLegend();
            } catch(_) {}
            
            // Também atualiza window.classificationLabels para compatibilidade
            try {
                window.classificationLabels = CLASS_NAMES.map((name, i) => ({
                    id: `C${i + 1}`,
                    name: name,
                    color: CLASS_COLORS[`C${i + 1}`]
                }));
                window.dispatchEvent(new CustomEvent('classification-labels-updated', { 
                    detail: window.classificationLabels 
                }));
            } catch(_) {}
            
            return true;
        }
        return false;
    } catch (error) {
        console.error('[graphics] Erro ao atualizar nomes das classes:', error);
        return false;
    }
}

async function initGraphics() {
    const container = document.getElementById('graphics-container');
    if (!container) return;
    // Evita inicializar enquanto oculto (display: none)
    if (container.style.display === 'none') return;

    const doInit = async () => {
        console.log('[graphics] initGraphics: iniciando criação do gráfico');
        
        // ✅ Busca os nomes das classes do PLC via DataHub ANTES de criar o gráfico
        await refreshClassLabelsFromPLC();
        
        createChart();
        setupEventListeners();
        
        // ✅ Inicializa subscription e Socket.IO para dados em tempo real
        initGraphicsSubscription();
        initGraphicsSocketIO();
        
        // Remove o intervalo antigo que gerava dados aleatórios
        if (dataUpdateIntervalId) {
            clearInterval(dataUpdateIntervalId);
            dataUpdateIntervalId = null;
        }
        
        // Garante render após ficar visível
        setTimeout(() => {
            try {
                classesChart && classesChart.resize();
                classesChart && classesChart.update('none');
                console.log('[graphics] initGraphics: resize/update após visível');
            } catch (e) {
                console.warn('Falha ao ajustar gráfico visível:', e);
            }
        }, 0);
    };

    // Carrega Chart.js se necessário
    if (typeof Chart === 'undefined') {
        loadChartJS().then(doInit).catch(err => console.error('Erro ao carregar Chart.js', err));
    } else {
        await doInit();
    }
}

function loadChartJS() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        // Usa a build UMD para evitar erro de ESM ("Cannot use import statement outside a module")
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
        script.onload = () => {
            if (typeof window !== 'undefined' && typeof window.Chart !== 'undefined') {
                resolve();
            } else {
                reject(new Error('Chart.js carregado mas Chart não está disponível'));
            }
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function createChart() {
    const canvas = document.getElementById('classesChart');
    if (!canvas) {
        console.error('Canvas classesChart não encontrado');
        return;
    }
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) {
        console.error('Contexto 2D do canvas não disponível');
        return;
    }

    // Garante altura utilizável do container ao criar o gráfico
    const chartContainer = canvas.closest('.chart-container');
    if (chartContainer) {
        const containerHeight = chartContainer.clientHeight;
        if (!containerHeight || containerHeight < 100) {
            chartContainer.style.minHeight = '300px';
        }
    }

    // Destrói gráfico existente se houver
    if (classesChart) {
        classesChart.destroy();
    }

    const textColor = getCssVar('--text-primary', '#2c3e50');
    const gridColor = getCssVar('--chart-grid', 'rgba(0, 0, 0, 0.1)');

    // Os nomes das classes já devem ter sido carregados do PLC via refreshClassLabelsFromPLC()
    // Fallback para window.classificationLabels se disponível
    try {
        if (CLASS_NAMES.every((n, i) => n === `C${i+1}`)) {
            // Se ainda são os nomes padrão, tenta usar classificationLabels como fallback
            if (Array.isArray(window.classificationLabels) && window.classificationLabels.length >= 7) {
                CLASS_NAMES = window.classificationLabels
                    .filter(l => /^C[1-7]$/.test(l.id))
                    .sort((a,b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))
                    .map(l => l.name || l.id);
            }
        }
    } catch(_) {}

    // Gera dados de exemplo para demonstração
    chartData.realFlow = [120, 180, 95, 210, 150, 175, 130];
    chartData.programmedFlow = [150, 200, 120, 250, 180, 200, 160];

    // Gera labels iniciais
    const initialLabels = generateFormattedLabels();
    
    // Registra plugin customizado se Chart.js suportar
    try {
        if (typeof Chart !== 'undefined' && Chart.register) {
            // Tenta registrar o plugin (Chart.js v4+)
            if (!Chart.registry || !Chart.registry.getPlugin || !Chart.registry.getPlugin('chartSymbolsPlugin')) {
                Chart.register(chartSymbolsPlugin);
            }
        }
    } catch (e) {
        console.warn('[graphics] Não foi possível registrar plugin de símbolos:', e);
    }
    
    classesChart = new Chart(ctx, {
        type: 'bar',
        plugins: [chartSymbolsPlugin],
        data: {
            labels: initialLabels,
            datasets: [
                {
                    label: 'Fluxo Real',
                    data: chartData.realFlow,
                    backgroundColor: '#6c757d',
                    borderColor: '#495057',
                    borderWidth: 2,
                    borderRadius: 8,
                    borderSkipped: false,
                },
                {
                    label: 'Fluxo Máximo Permitido',
                    data: chartData.programmedFlow,
                    backgroundColor: CLASS_NAMES.map((name, i) => {
                        const key = 'C' + (i+1);
                        return CLASS_COLORS[key] || '#4ecdc4';
                    }),
                    borderColor: CLASS_NAMES.map((name, i) => {
                        const key = 'C' + (i+1);
                        return CLASS_COLORS[key] || '#4ecdc4';
                    }),
                    borderWidth: 2,
                    borderRadius: 8,
                    borderSkipped: false,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            aspectRatio: 1.5,
            plugins: {
                title: {
                    display: true,
                    text: 'Gráfico de fluxo',
                    font: {
                        size: 20,
                        weight: 'bold'
                    },
                    color: textColor
                },
                legend: {
                    display: false // Usamos nossa própria legenda
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.88)',
                    titleColor: '#fff',
                    titleFont: { size: 24, weight: 'bold' },
                    bodyColor: '#fff',
                    bodyFont: { size: 22, weight: 'bold' },
                    borderColor: '#fff',
                    borderWidth: 1,
                    padding: 22,
                    cornerRadius: 10,
                    callbacks: {
                        title: function(context) {
                            return `Classe ${context[0].label}`;
                        },
                        label: function(context) {
                            const datasetLabel = context.dataset.label;
                            const value = context.parsed.y;
                            return `${datasetLabel}: ${value} ovos`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Classes de Ovos',
                        font: {
                            size: 14,
                            weight: 'bold'
                        },
                        color: textColor
                    },
                    grid: {
                        display: true,
                        color: gridColor
                    },
                    ticks: {
                        color: textColor,
                        font: {
                            size: 12,
                            weight: 'bold'
                        },
                        maxRotation: 0,
                        minRotation: 0,
                        // Aumenta padding para dar espaço aos símbolos (evitar sobreposição)
                        padding: 45
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Produção de Caixa Hora',
                        font: {
                            size: 14,
                            weight: 'bold'
                        },
                        color: textColor
                    },
                    min: 0,
                    max: 700,
                    ticks: {
                        stepSize: 100,
                        color: textColor,
                        font: {
                            size: 12
                        },
                        callback: function(value) {
                            return value;
                        }
                    },
                    grid: {
                        display: true,
                        color: gridColor
                    }
                }
            },
            animation: {
                duration: 1000,
                easing: 'easeInOutQuart'
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
    // Expõe referência global para outros scripts
    if (typeof window !== 'undefined') {
        window.classesChart = classesChart;
    }
    applyChartTheme();
    console.log('[graphics] createChart: gráfico criado');
    try { 
        renderClassesLegend(); 
        renderSymbolsLegend();
    } catch(_) {}
}

function setupEventListeners() {
    // Botão de atualizar
    const refreshBtn = document.getElementById('btn-refresh-graphics');
    if (refreshBtn) {
        registerGraphicsEventListener(refreshBtn, 'click', () => {
            updateChartData();
            updateLastUpdateTime();
            renderClassesLegend();
            renderSymbolsLegend();
        });
    }

    // Botão de exportar
    const exportBtn = document.getElementById('btn-export-graphics');
    if (exportBtn) {
        registerGraphicsEventListener(exportBtn, 'click', exportChart);
    }

    // Abas de gráficos
    const tabFlow = document.getElementById('tab-flow');
    const tabWeight = document.getElementById('tab-weight');
    const tabSpeed = document.getElementById('tab-speed');
    const tabs = [tabFlow, tabWeight, tabSpeed].filter(Boolean);
    const setActive = (btn) => {
        tabs.forEach(t => t && t.classList.remove('active'));
        btn && btn.classList.add('active');
    };
    if (tabFlow) registerGraphicsEventListener(tabFlow, 'click', () => {
        setActive(tabFlow);
        try {
            classesChart.options.plugins.title.text = 'Gráfico de fluxo';
            classesChart.config.type = 'bar';
            classesChart.update('none');
        } catch(_) {}
    });
    if (tabWeight) registerGraphicsEventListener(tabWeight, 'click', () => {
        setActive(tabWeight);
        try {
            classesChart.options.plugins.title.text = 'Gráfico de peso';
            classesChart.config.type = 'line';
            classesChart.update('none');
        } catch(_) {}
    });
    if (tabSpeed) registerGraphicsEventListener(tabSpeed, 'click', () => {
        setActive(tabSpeed);
        try {
            classesChart.options.plugins.title.text = 'Gráfico de velocidade';
            classesChart.config.type = 'line';
            classesChart.update('none');
        } catch(_) {}
    });
}

function renderClassesLegend() {
    const legendRoot = document.getElementById('classes-legend');
    if (!legendRoot) return;
    
    // Usa CLASS_NAMES que foi carregado do PLC via DataHub
    const items = CLASS_NAMES.map((name, i) => {
        const key = 'C' + (i + 1);
        const color = CLASS_COLORS[key] || '#999';
        // Mostra o nome do PLC, ou o ID padrão se o nome for igual ao ID
        const displayName = (name && name !== key) ? name : key;
        return `<span class="legend-chip">
            <i class="legend-dot" style="background:${color};"></i>
            <b class="legend-label">${displayName}</b>
        </span>`;
    }).join('');
    legendRoot.innerHTML = items;
}

/**
 * Renderiza a legenda dos símbolos + e - com "Embaladoras"
 */
function renderSymbolsLegend() {
    const legendRoot = document.getElementById('symbols-legend');
    if (!legendRoot) return;
    
    const plusColor = '#39FF14'; // Verde neon
    const minusColor = '#FF0000'; // Vermelho
    const symbolFontSize = 56;
    
    const items = `
        <span class="symbol-legend-item">
            <span class="symbol-legend-symbol" style="color:${plusColor}; font-size:${symbolFontSize}px; font-weight:bold;">+</span>
            <span class="symbol-legend-text">Embaladoras</span>
        </span>
        <span class="symbol-legend-item">
            <span class="symbol-legend-symbol" style="color:${minusColor}; font-size:${symbolFontSize}px; font-weight:bold;">-</span>
            <span class="symbol-legend-text">Embaladoras</span>
        </span>
    `;
    legendRoot.innerHTML = items;
}

/**
 * Verifica se um bit específico está ativo em um valor WORD (16 bits)
 * @param {number} value - Valor WORD (0-65535)
 * @param {number} bitIndex - Índice do bit (0-15)
 * @returns {boolean} true se o bit está ativo
 */
function isBitSet(value, bitIndex) {
    if (value === null || value === undefined || isNaN(value)) return false;
    const numValue = parseInt(value);
    return (numValue & (1 << bitIndex)) !== 0;
}

/**
 * Atualiza os estados dos símbolos + e - baseado nos dados do PLC
 * @param {Object} telemetryData - Dados recebidos via Socket.IO
 */
function updateClassSymbols(telemetryData) {
    if (!telemetryData) return;
    
    let symbolsChanged = false;
    
    // Processa tag HAB_CONTROLE para símbolo +
    const habControleValue = telemetryData[HAB_CONTROLE_TAG];
    if (habControleValue !== null && habControleValue !== undefined) {
        for (let i = 0; i < HAB_CONTROLE_BITS.length; i++) {
            const bitIndex = HAB_CONTROLE_BITS[i];
            const shouldShowPlus = isBitSet(habControleValue, bitIndex);
            if (classSymbols.plus[i] !== shouldShowPlus) {
                classSymbols.plus[i] = shouldShowPlus;
                symbolsChanged = true;
            }
        }
    }
    
    // Processa condições para símbolo -
    for (let i = 0; i < FLUXO_TAGS.real.length; i++) {
        const realFlowTag = FLUXO_TAGS.real[i];
        const maxFlowTag = FLUXO_TAGS.max[i];
        
        const realFlow = telemetryData[realFlowTag];
        const maxFlow = telemetryData[maxFlowTag];
        
        if (realFlow !== null && realFlow !== undefined && 
            maxFlow !== null && maxFlow !== undefined) {
            const realValue = parseFloat(realFlow);
            const maxValue = parseFloat(maxFlow);
            
            // Condição: (FLUXO_MAX / 2) >= FLUXO_REAL E FLUXO_REAL <> 0
            const shouldShowMinus = (maxValue / 2) >= realValue && realValue !== 0;
            
            if (classSymbols.minus[i] !== shouldShowMinus) {
                classSymbols.minus[i] = shouldShowMinus;
                symbolsChanged = true;
            }
        }
    }
    
    return symbolsChanged;
}

/**
 * Gera labels formatados (apenas nomes, símbolos são renderizados pelo plugin)
 * @returns {Array<string>} Array de labels formatados
 */
function generateFormattedLabels() {
    return CLASS_NAMES.map((name, index) => {
        // Retorna apenas o nome, os símbolos serão renderizados pelo plugin customizado
        return name;
    });
}

/**
 * Plugin customizado do Chart.js para renderizar símbolos + e - abaixo dos labels
 */
const chartSymbolsPlugin = {
    id: 'chartSymbolsPlugin',
    afterDraw: function(chart) {
        const ctx = chart.ctx;
        const xAxis = chart.scales.x;
        const yAxis = chart.scales.y;
        
        if (!xAxis || !yAxis) return;
        
        // Cores dos símbolos
        const plusColor = '#39FF14'; // Verde neon
        const minusColor = '#FF0000'; // Vermelho
        
        // Tamanho da fonte dos símbolos (aumentado)
        const symbolFontSize = 76; // Tamanho aumentado para melhor visibilidade
        
        ctx.save();
        ctx.font = `bold ${symbolFontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        
        // Obtém os dois datasets (Real e Máximo Permitido)
        const meta1 = chart.getDatasetMeta(0); // Primeira coluna (Real)
        const meta2 = chart.getDatasetMeta(1); // Segunda coluna (Máximo Permitido)
        
        if (!meta1 || !meta1.data || !meta2 || !meta2.data) return;
        
        // Itera sobre cada classe
        meta1.data.forEach((bar1, index) => {
            if (index < CLASS_NAMES.length && index < classSymbols.plus.length) {
                const bar2 = meta2.data[index];
                if (!bar2) return;
                
                // Calcula a posição X central entre as duas barras
                const x1 = bar1.x; // Posição X da primeira barra (Real)
                const x2 = bar2.x; // Posição X da segunda barra (Máximo Permitido)
                const centerX = (x1 + x2) / 2; // Ponto médio entre as duas colunas
                
                // Posição Y mais próxima das colunas (subiu um pouco)
                const y = yAxis.bottom - 5; // Subiu os símbolos para mais próximo das colunas
                
                // Verifica quais símbolos devem aparecer
                const hasPlus = classSymbols.plus[index];
                const hasMinus = classSymbols.minus[index];
                
                // Desenha símbolos sobrepostos na mesma posição
                if (hasPlus) {
                    ctx.fillStyle = plusColor;
                    ctx.fillText('+', centerX, y);
                }
                
                if (hasMinus) {
                    ctx.fillStyle = minusColor;
                    ctx.fillText('-', centerX, y); // Mesma posição X, sobreposto
                }
            }
        });
        
        ctx.restore();
    }
};

/**
 * Atualiza os dados do gráfico a partir dos valores recebidos do PLC
 * @param {Object} telemetryData - Dados recebidos via Socket.IO
 */
function updateChartDataFromPLC(telemetryData) {
    if (!telemetryData) return;
    
    let hasChanges = false;
    
    // Atualiza fluxo real
    for (let i = 0; i < FLUXO_TAGS.real.length; i++) {
        const tagName = FLUXO_TAGS.real[i];
        const value = telemetryData[tagName];
        if (value !== null && value !== undefined && !isNaN(value)) {
            const numValue = parseFloat(value);
            if (chartData.realFlow[i] !== numValue) {
                chartData.realFlow[i] = numValue;
                hasChanges = true;
            }
        }
    }
    
    // Atualiza fluxo máximo permitido
    for (let i = 0; i < FLUXO_TAGS.max.length; i++) {
        const tagName = FLUXO_TAGS.max[i];
        const value = telemetryData[tagName];
        if (value !== null && value !== undefined && !isNaN(value)) {
            const numValue = parseFloat(value);
            if (chartData.programmedFlow[i] !== numValue) {
                chartData.programmedFlow[i] = numValue;
                hasChanges = true;
            }
        }
    }
    
    // Atualiza símbolos + e -
    const symbolsChanged = updateClassSymbols(telemetryData);
    
    // Só atualiza o gráfico se houver mudanças
    if (hasChanges || symbolsChanged) {
        if (classesChart) {
            classesChart.data.datasets[0].data = chartData.realFlow;
            classesChart.data.datasets[1].data = chartData.programmedFlow;
            
            // Atualiza labels com símbolos
            classesChart.data.labels = generateFormattedLabels();
            
            classesChart.update('active');
            updateLastUpdateTime();
        }
        
        // Notifica outros módulos que os dados foram atualizados
        try {
            const evt = new CustomEvent('graphics-data-updated', { detail: getGraphicsSummary() });
            window.dispatchEvent(evt);
        } catch (e) {
            console.warn('[graphics] Falha ao emitir evento de atualização:', e);
        }
    }
}

function updateChartData() {
    // Função mantida para compatibilidade, mas agora os dados vêm do PLC via Socket.IO
    // Esta função pode ser chamada manualmente para forçar atualização
    if (classesChart) {
        classesChart.data.datasets[0].data = chartData.realFlow;
        classesChart.data.datasets[1].data = chartData.programmedFlow;
        
        // Atualiza labels com símbolos
        classesChart.data.labels = generateFormattedLabels();
        
        classesChart.update('active');
        updateLastUpdateTime();
        updateTotalEggs();
        
        // Notifica outros módulos que os dados foram atualizados
        try {
            const evt = new CustomEvent('graphics-data-updated', { detail: getGraphicsSummary() });
            window.dispatchEvent(evt);
        } catch (e) {
            console.warn('[graphics] Falha ao emitir evento de atualização:', e);
        }
    }
}

function updateLastUpdateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('pt-BR');
    const timeElement = document.getElementById('last-update');
    if (timeElement) {
        timeElement.textContent = timeString;
    }
}

// Função removida - Total de ovos não é mais exibido

function exportChart() {
    if (!classesChart) return;
    
    // Cria um link para download da imagem
    const link = document.createElement('a');
    link.download = `grafico_producao_${new Date().toISOString().split('T')[0]}.png`;
    link.href = classesChart.toBase64Image();
    link.click();
}

function startDataUpdate() {
    // Função mantida para compatibilidade, mas dados agora vêm via Socket.IO em tempo real
    // Não precisa mais de polling, mas mantemos para garantir atualização inicial
    updateChartData();
    updateLastUpdateTime();
}

// ============================================================================
// Sistema de Subscription para tags de fluxo
// ============================================================================

/**
 * Constrói lista de tags para subscription
 */
function buildGraphicsSubscribedTags() {
    const tags = [];
    // Adiciona todas as tags de fluxo real e máximo permitido
    tags.push(...FLUXO_TAGS.real);
    tags.push(...FLUXO_TAGS.max);
    // Adiciona tag de habilitação de controle
    tags.push(HAB_CONTROLE_TAG);
    return tags;
}

/**
 * Faz subscription das tags de fluxo
 */
async function subscribeGraphicsScreen() {
    if (graphicsSubscriptionInFlight) return;
    graphicsSubscriptionInFlight = true;
    if (!graphicsClientId) {
        graphicsClientId = `graphics-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    
    try {
        const tags = buildGraphicsSubscribedTags();
        const res = await fetch('/api/subscribe_tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                client_id: graphicsClientId, 
                tags: tags, 
                screen_name: 'tela_graficos' 
            })
        });
        await res.json().catch(() => ({}));
        startGraphicsHeartbeat();
        console.log('[GRAPHICS] ✅ Subscrição de tags ativada para tela de gráficos');
    } catch (error) {
        console.error('[GRAPHICS] ❌ Erro ao ativar subscrição de tags:', error);
    } finally {
        graphicsSubscriptionInFlight = false;
    }
}

/**
 * Remove subscription das tags de fluxo
 */
async function unsubscribeGraphicsScreen() {
    if (graphicsSubscriptionInFlight) return;
    graphicsSubscriptionInFlight = true;
    try {
        stopGraphicsHeartbeat();
        if (graphicsClientId) {
            await fetch('/api/unsubscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_id: graphicsClientId })
            });
            console.log('[GRAPHICS] ✅ Subscrição de tags desativada para tela de gráficos');
        }
    } catch (error) {
        console.error('[GRAPHICS] ❌ Erro ao desativar subscrição de tags:', error);
    } finally {
        graphicsClientId = null;
        graphicsSubscriptionInFlight = false;
    }
}

/**
 * Envia heartbeat para manter subscription ativa
 */
async function heartbeatGraphicsScreen() {
    if (graphicsHeartbeatInFlight) return;
    graphicsHeartbeatInFlight = true;
    try {
        if (graphicsClientId) {
            await fetch('/api/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_id: graphicsClientId })
            });
        }
    } catch (error) {
        console.error('[GRAPHICS] ❌ Erro no heartbeat:', error);
    } finally {
        graphicsHeartbeatInFlight = false;
    }
}

/**
 * Inicia heartbeat periódico
 */
function startGraphicsHeartbeat() {
    if (graphicsHeartbeatTimer) clearInterval(graphicsHeartbeatTimer);
    graphicsHeartbeatTimer = setInterval(heartbeatGraphicsScreen, 15000); // 15 segundos
}

/**
 * Para heartbeat
 */
function stopGraphicsHeartbeat() {
    if (graphicsHeartbeatTimer) {
        clearInterval(graphicsHeartbeatTimer);
        graphicsHeartbeatTimer = null;
    }
}

/**
 * Inicializa sistema de subscription
 */
function initGraphicsSubscription() {
    // Verifica se deve fazer subscription (tela de gráficos aberta OU tela inicial)
    const graphicsContainer = document.getElementById('graphics-container');
    const gridContainer = document.getElementById('grid-container');
    
    isGraphicsScreenVisible = graphicsContainer && graphicsContainer.style.display !== 'none';
    isGridScreenVisible = gridContainer && gridContainer.style.display !== 'none';
    
    if (isGraphicsScreenVisible || isGridScreenVisible) {
        subscribeGraphicsScreen();
    }
}

/**
 * Inicializa Socket.IO para receber dados em tempo real
 */
function initGraphicsSocketIO() {
    try {
        // Reutiliza socket global se disponível (mesmo padrão do grid.js)
        if (typeof io !== 'undefined') {
            // Usa socket global se já existir, senão cria um novo
            graphicsSocket = window.supervisorSocket || (
                window.supervisorSocket = io({
                    reconnection: true,
                    reconnectionAttempts: Infinity,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    timeout: 20000,
                    forceNew: false,
                    transports: ['polling', 'websocket'],
                    upgrade: true,
                    rememberUpgrade: false
                })
            );
            
            // ✅ CRÍTICO: Remove listener antigo antes de adicionar novo (evita duplicação)
            if (graphicsTelemetryHandler) {
                graphicsSocket.off('telemetry', graphicsTelemetryHandler);
            }
            
            // Escuta evento telemetry para atualizar gráfico em tempo real (armazena handler para cleanup)
            graphicsTelemetryHandler = (data) => {
                if (!data) return;
                
                // Atualiza gráfico com dados recebidos
                updateChartDataFromPLC(data);
            };
            graphicsSocket.on('telemetry', graphicsTelemetryHandler);
            
            console.log('[GRAPHICS] ✅ Socket.IO configurado para gráficos');
        } else {
            console.warn('[GRAPHICS] Socket.IO não disponível');
        }
    } catch (error) {
        console.error('[GRAPHICS] Erro ao inicializar Socket.IO:', error);
    }
}

/**
 * Verifica se deve manter subscription ativa
 * Subscription deve estar ativa quando:
 * - Tela de gráficos estiver aberta OU
 * - Tela inicial (grid) estiver aberta
 */
function checkGraphicsSubscription() {
    const graphicsContainer = document.getElementById('graphics-container');
    const gridContainer = document.getElementById('grid-container');
    
    const wasGraphicsVisible = isGraphicsScreenVisible;
    const wasGridVisible = isGridScreenVisible;
    
    isGraphicsScreenVisible = graphicsContainer && graphicsContainer.style.display !== 'none';
    isGridScreenVisible = gridContainer && gridContainer.style.display !== 'none';
    
    const shouldSubscribe = isGraphicsScreenVisible || isGridScreenVisible;
    const isSubscribed = graphicsClientId !== null;
    
    // Se precisa estar subscrito e não está, faz subscription
    if (shouldSubscribe && !isSubscribed) {
        subscribeGraphicsScreen();
    }
    // Se não precisa estar subscrito mas está, faz unsubscribe
    else if (!shouldSubscribe && isSubscribed) {
        unsubscribeGraphicsScreen();
    }
}

// Não inicializa automaticamente; a inicialização ocorre ao abrir a tela (showGraphics)

/**
 * ✅ CRÍTICO: Função de cleanup para evitar vazamento de memória
 * Limpa todos os intervalos, timers e subscriptions
 */
function cleanupGraphics() {
    console.log('[GRAPHICS] 🧹 Executando cleanup de gráficos...');
    
    // ✅ CRÍTICO: Para o background feed
    stopGraphicsBackgroundFeed();
    
    // Para o heartbeat
    stopGraphicsHeartbeat();
    graphicsHeartbeatInFlight = false;
    
    // Limpa intervalo de atualização de dados
    if (dataUpdateIntervalId) {
        clearInterval(dataUpdateIntervalId);
        dataUpdateIntervalId = null;
    }
    
    // Limpa intervalo de verificação de subscription (redundante mas seguro)
    if (graphicsSubscriptionCheckInterval) {
        clearInterval(graphicsSubscriptionCheckInterval);
        graphicsSubscriptionCheckInterval = null;
    }
    
    // Limpa intervalo de atualização de nomes (redundante mas seguro)
    if (graphicsNameUpdateInterval) {
        clearInterval(graphicsNameUpdateInterval);
        graphicsNameUpdateInterval = null;
    }
    graphicsNameUpdateInFlight = false;
    
    // ✅ CRÍTICO: Remove listeners do Socket.IO usando handler armazenado
    if (graphicsSocket && graphicsTelemetryHandler) {
        try {
            graphicsSocket.off('telemetry', graphicsTelemetryHandler);
            graphicsTelemetryHandler = null;
        } catch (_) {}
    }

    // Remove event listeners registrados
    if (graphicsEventListeners.length) {
        graphicsEventListeners.forEach(({ element, event, handler, options }) => {
            if (element) {
                element.removeEventListener(event, handler, options);
            }
        });
        graphicsEventListeners = [];
    }
    
    // Faz unsubscribe das tags
    try {
        unsubscribeGraphicsScreen();
    } catch (_) {}

    // Libera o gráfico e memória associada
    if (classesChart) {
        try {
            classesChart.destroy();
        } catch (_) {}
        classesChart = null;
    }
    
    console.log('[GRAPHICS] ✅ Cleanup concluído');
}

// Exporta funções para uso global
window.initGraphics = initGraphics;

document.addEventListener('themeChanged', () => {
    applyChartTheme();
});
window.updateChartData = updateChartData;
window.checkGraphicsSubscription = checkGraphicsSubscription;
window.cleanupGraphics = cleanupGraphics; // ✅ CRÍTICO: Exporta cleanup
window.getGraphicsSummary = function getGraphicsSummary() {
    return CLASS_NAMES.map((name, idx) => {
        const key = 'C' + (idx + 1);
        return {
            className: name,
            real: chartData.realFlow[idx] ?? 0,
            programmed: chartData.programmedFlow[idx] ?? 0,
            color: CLASS_COLORS[key]
        };
    });
};

// ✅ CRÍTICO: Função para iniciar background feed sob demanda
// Só inicia quando grid ou graphics estão visíveis
function startGraphicsBackgroundFeed() {
    // ✅ CRÍTICO: Evita iniciar múltiplas vezes
    if (graphicsBackgroundStarted) {
        console.log('[GRAPHICS] Background feed já está rodando');
        return;
    }
    graphicsBackgroundStarted = true;
    console.log('[GRAPHICS] 🚀 Iniciando background feed...');
    
    // ✅ Busca os nomes das classes diretamente do PLC via DataHub
    (async () => {
        try {
            await refreshClassLabelsFromPLC();
        } catch(_) {
            // Fallback: tenta usar classificationLabels se disponível
            try {
                if (Array.isArray(window.classificationLabels) && window.classificationLabels.length >= 7) {
                    CLASS_NAMES = window.classificationLabels
                        .filter(l => /^C[1-7]$/.test(l.id))
                        .sort((a,b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))
                        .map(l => l.name || l.id);
                }
            } catch(_) {}
        }
    })();
    
    // ✅ Inicializa subscription e Socket.IO para dados em tempo real
    // Subscription será ativada se grid estiver visível
    initGraphicsSubscription();
    initGraphicsSocketIO();
    
    // ✅ CORRIGIDO: Armazena ID do intervalo para poder limpar depois
    // Monitora mudanças de visibilidade das telas para gerenciar subscription
    if (graphicsSubscriptionCheckInterval) {
        clearInterval(graphicsSubscriptionCheckInterval);
    }
    graphicsSubscriptionCheckInterval = setInterval(() => {
        checkGraphicsSubscription();
    }, 5000); // ✅ Aumentado para 5 segundos (era 2) - reduz uso de CPU
    
    // ✅ CORRIGIDO: Armazena ID do intervalo para poder limpar depois
    // Atualiza os nomes a cada 60s (era 30s) + monitora conexão PLC ↔ DataHub
    let plcConnected = true;
    let consecutiveFailures = 0;
    
    if (graphicsNameUpdateInterval) {
        clearInterval(graphicsNameUpdateInterval);
    }
    graphicsNameUpdateInterval = setInterval(async () => {
        if (graphicsNameUpdateInFlight) return;
        graphicsNameUpdateInFlight = true;
        try {
            // ✅ VERIFICA STATUS DA CONEXÃO PLC ↔ DataHub
            const isConnected = await graphicsApi.checkPLCConnection();
            
            // ✅ Detecta DESCONEXÃO (PLC ↔ DataHub)
            if (!isConnected) {
                consecutiveFailures++;
                if (consecutiveFailures >= 2) {
                    if (plcConnected) {
                        console.log('[GRAPHICS] ❌ Conexão PLC perdida');
                        plcConnected = false;
                        
                        // Volta para nomes padrão C1-C7
                        CLASS_NAMES = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'];
                        if (classesChart && classesChart.data) {
                            classesChart.data.labels = CLASS_NAMES;
                            classesChart.update('none');
                        }
                        try { 
                            renderClassesLegend(); 
                            renderSymbolsLegend();
                        } catch(_) {}
                    }
                }
                return;
            }
            
            // ✅ Detecta RECONEXÃO (PLC ↔ DataHub)
            if (!plcConnected && isConnected) {
                console.log('[GRAPHICS] 🔄 Conexão PLC restaurada - recarregando nomes');
                plcConnected = true;
                consecutiveFailures = 0;
                
                // Força atualização dos dados do gráfico
                try { 
                    await refreshClassLabelsFromPLC();
                    updateChartData(); 
                } catch (_) {}
            } else {
                // Conexão OK - atualiza normalmente
                consecutiveFailures = 0;
                plcConnected = true;
                try { await refreshClassLabelsFromPLC(); } catch (_) {}
            }
        } catch (_) {
            consecutiveFailures++;
            if (consecutiveFailures >= 2) {
                if (plcConnected) {
                    plcConnected = false;
                    CLASS_NAMES = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'];
                    if (classesChart && classesChart.data) {
                        classesChart.data.labels = CLASS_NAMES;
                        classesChart.update('none');
                    }
                }
            }
        } finally {
            graphicsNameUpdateInFlight = false;
        }
    }, 60000); // ✅ Aumentado para 60 segundos (era 30) - reduz uso de CPU/memória
    
    console.log('[GRAPHICS] ✅ Background feed iniciado com intervalos controlados');
}

// ✅ CRÍTICO: Função para parar background feed quando não é necessário
function stopGraphicsBackgroundFeed() {
    if (!graphicsBackgroundStarted) {
        console.log('[GRAPHICS] Background feed já está parado');
        return;
    }
    
    console.log('[GRAPHICS] 🛑 Parando background feed...');
    
    // Limpa intervalo de verificação de subscription
    if (graphicsSubscriptionCheckInterval) {
        clearInterval(graphicsSubscriptionCheckInterval);
        graphicsSubscriptionCheckInterval = null;
    }
    
    // Limpa intervalo de atualização de nomes
    if (graphicsNameUpdateInterval) {
        clearInterval(graphicsNameUpdateInterval);
        graphicsNameUpdateInterval = null;
    }
    
    // ✅ CRÍTICO: Reseta a flag para permitir reiniciar quando necessário
    graphicsBackgroundStarted = false;
    
    console.log('[GRAPHICS] ✅ Background feed parado');
}

// Exporta funções de controle do background feed
window.startGraphicsBackgroundFeed = startGraphicsBackgroundFeed;
window.stopGraphicsBackgroundFeed = stopGraphicsBackgroundFeed;




// ? Bootstrap: se a tela de gr�ficos j� estiver vis�vel (ex: F5), inicializa ap�s o script carregar
(function bootstrapGraphicsOnLoad() {
    try {
        const container = document.getElementById('graphics-container');
        if (!container || container.style.display === 'none') return;

        try { if (typeof startGraphicsBackgroundFeed === 'function') startGraphicsBackgroundFeed(); } catch (_) {}

        try {
            const chart = classesChart;
            if (!chart || chart._destroyed) {
                initGraphics();
            } else if (chart && typeof chart.update === 'function') {
                chart.update('none');
            }
        } catch (_) {}

        try { if (typeof checkGraphicsSubscription === 'function') checkGraphicsSubscription(); } catch (_) {}
    } catch (e) {
        console.warn('[GRAPHICS] Falha ao inicializar gr�ficos p�s-carregamento:', e);
    }
})();







