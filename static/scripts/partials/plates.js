// plates.js - Tela de Placas
// =========================

let platesInitialized = false;
let platesEventListeners = [];

function registerPlatesEventListener(element, event, handler, options) {
    if (!element) return;
    element.addEventListener(event, handler, options);
    platesEventListeners.push({ element, event, handler, options });
}

function cleanupPlates() {
    platesEventListeners.forEach(({ element, event, handler, options }) => {
        try {
            element.removeEventListener(event, handler, options);
        } catch (e) {
            console.warn('[PLATES] Erro ao remover listener:', e);
        }
    });
    platesEventListeners = [];
    platesInitialized = false;
    window.platesInitialized = false;
}

function inicializarPlates() {
    if (platesInitialized) {
        return;
    }

    cleanupPlates();
    platesInitialized = true;
    window.platesInitialized = true;

    setupPlatesTabs();
}

function setupPlatesTabs() {
    const tabs = Array.from(document.querySelectorAll('.plates-tab'));
    const panels = Array.from(document.querySelectorAll('.plates-panel'));

    if (!tabs.length || !panels.length) {
        return;
    }

    const activateTab = (target) => {
        const targetKey = target?.getAttribute('data-tab');
        tabs.forEach(tab => tab.classList.toggle('active', tab === target));
        panels.forEach(panel => {
            const isInputs = panel.classList.contains('plates-panel-inputs');
            const isOutputs = panel.classList.contains('plates-panel-outputs');
            const shouldShow = (targetKey === 'inputs' && isInputs) || (targetKey === 'outputs' && isOutputs);
            panel.classList.toggle('active', shouldShow);
        });
    };

    tabs.forEach(tab => {
        registerPlatesEventListener(tab, 'click', () => activateTab(tab));
    });

    const defaultTab = tabs.find(tab => tab.classList.contains('active')) || tabs[0];
    activateTab(defaultTab);
}

window.inicializarPlates = inicializarPlates;
window.cleanupPlates = cleanupPlates;
window.platesInitialized = platesInitialized;
