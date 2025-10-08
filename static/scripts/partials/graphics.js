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

const CLASS_NAMES = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'];

function initGraphics() {
    const container = document.getElementById('graphics-container');
    if (!container) return;
    // Evita inicializar enquanto oculto (display: none)
    if (container.style.display === 'none') return;

    const doInit = () => {
        console.log('[graphics] initGraphics: iniciando criação do gráfico');
        createChart();
        setupEventListeners();
        startDataUpdate();
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
        doInit();
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

    // Gera dados de exemplo para demonstração
    chartData.realFlow = [120, 180, 95, 210, 150, 175, 130];
    chartData.programmedFlow = [150, 200, 120, 250, 180, 200, 160];

    classesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: CLASS_NAMES,
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
                    label: 'Fluxo Programado',
                    data: chartData.programmedFlow,
                    backgroundColor: CLASS_NAMES.map(name => CLASS_COLORS[name]),
                    borderColor: CLASS_NAMES.map(name => CLASS_COLORS[name]),
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
                    text: 'Produção por Classe de Ovos',
                    font: {
                        size: 20,
                        weight: 'bold'
                    },
                    color: '#2c3e50'
                },
                legend: {
                    display: false // Usamos nossa própria legenda
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: '#fff',
                    borderWidth: 1,
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
                        color: '#2c3e50'
                    },
                    grid: {
                        display: true,
                        color: 'rgba(0, 0, 0, 0.1)'
                    },
                    ticks: {
                        color: '#2c3e50',
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
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
                        color: '#2c3e50'
                    },
                    min: 0,
                    max: 700,
                    ticks: {
                        stepSize: 100,
                        color: '#2c3e50',
                        font: {
                            size: 12
                        },
                        callback: function(value) {
                            return value;
                        }
                    },
                    grid: {
                        display: true,
                        color: 'rgba(0, 0, 0, 0.1)'
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
    console.log('[graphics] createChart: gráfico criado');
}

function setupEventListeners() {
    // Botão de atualizar
    const refreshBtn = document.getElementById('btn-refresh-graphics');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            updateChartData();
            updateLastUpdateTime();
        });
    }

    // Botão de exportar
    const exportBtn = document.getElementById('btn-export-graphics');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportChart);
    }
}

function updateChartData() {
    // Simula dados aleatórios para demonstração
    // Em produção, estes dados viriam do PLC/servidor
    chartData.realFlow = CLASS_NAMES.map(() => Math.floor(Math.random() * 500) + 50);
    chartData.programmedFlow = CLASS_NAMES.map(() => Math.floor(Math.random() * 550) + 100);
    
    if (classesChart) {
        classesChart.data.datasets[0].data = chartData.realFlow;
        classesChart.data.datasets[1].data = chartData.programmedFlow;
        classesChart.update('active');
    }
    
    updateTotalEggs();

    // Notifica outros módulos que os dados foram atualizados
    try {
        const evt = new CustomEvent('graphics-data-updated', { detail: getGraphicsSummary() });
        window.dispatchEvent(evt);
    } catch (e) {
        console.warn('[graphics] Falha ao emitir evento de atualização:', e);
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

function updateTotalEggs() {
    const totalReal = chartData.realFlow.reduce((sum, val) => sum + val, 0);
    const totalProgrammed = chartData.programmedFlow.reduce((sum, val) => sum + val, 0);
    const total = Math.max(totalReal, totalProgrammed);
    
    const totalElement = document.getElementById('total-eggs');
    if (totalElement) {
        totalElement.textContent = total.toLocaleString('pt-BR');
    }
}

function exportChart() {
    if (!classesChart) return;
    
    // Cria um link para download da imagem
    const link = document.createElement('a');
    link.download = `grafico_producao_${new Date().toISOString().split('T')[0]}.png`;
    link.href = classesChart.toBase64Image();
    link.click();
}

function startDataUpdate() {
    // Garante apenas um intervalo ativo
    if (dataUpdateIntervalId) {
        clearInterval(dataUpdateIntervalId);
    }
    // Atualiza dados a cada 5 segundos
    dataUpdateIntervalId = setInterval(() => {
        updateChartData();
        updateLastUpdateTime();
    }, 5000);
    
    // Atualização inicial
    updateChartData();
    updateLastUpdateTime();
}

// Não inicializa automaticamente; a inicialização ocorre ao abrir a tela (showGraphics)

// Exporta funções para uso global
window.initGraphics = initGraphics;
window.updateChartData = updateChartData;
window.getGraphicsSummary = function getGraphicsSummary() {
    return CLASS_NAMES.map((name, idx) => ({
        className: name,
        real: chartData.realFlow[idx] ?? 0,
        programmed: chartData.programmedFlow[idx] ?? 0,
        color: CLASS_COLORS[name]
    }));
};

// Inicia um feed de dados em background para alimentar o mini-gráfico do grid
// mesmo que a tela de gráficos não tenha sido aberta ainda.
(function startGraphicsBackgroundFeed() {
    let started = false;
    function start() {
        if (started) return;
        started = true;
        // Atualização inicial imediata
        try { updateChartData(); } catch (_) {}
        // Atualiza a cada 5 segundos
        setInterval(() => {
            try { updateChartData(); } catch (_) {}
        }, 5000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        setTimeout(start, 0);
    }
})();
