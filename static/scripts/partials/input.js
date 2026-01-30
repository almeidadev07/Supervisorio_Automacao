// ============================================
// GERENCIAMENTO DE EVENT LISTENERS
// ============================================
let inputEventListeners = [];

function registerInputEventListener(element, event, handler) {
    if (element) {
        element.addEventListener(event, handler);
        inputEventListeners.push({ element, event, handler });
    }
}

// Função de cleanup
function cleanupInput() {
    console.log('[INPUT] 🧹 Iniciando cleanup...');
    
    // Remove todos os event listeners registrados
    inputEventListeners.forEach(({ element, event, handler }) => {
        if (element) {
            element.removeEventListener(event, handler);
        }
    });
    inputEventListeners = [];
    
    console.log('[INPUT] ✅ Cleanup concluído');
}

window.cleanupInput = cleanupInput;

function setupGauge(sliderId, gaugeId, textId, limiteId) {
  const slider = document.getElementById(sliderId);
  const gauge = document.getElementById(gaugeId);
  const valueText = document.getElementById(textId);
  const limiteText = document.getElementById(limiteId);
  
  if (!slider || !gauge || !valueText || !limiteText) {
    console.warn(`[INPUT] Elementos não encontrados para: ${sliderId}`);
    return;
  }
  
  const inputHandler = () => {
    const val = slider.value;
    valueText.textContent = `${val}%`;
    limiteText.textContent = `${val}%`;
    gauge.style.background = `conic-gradient(#00cc66 0% ${val}%, #eee ${val}% 100%)`;
  };
  registerInputEventListener(slider, "input", inputHandler);
}

function inicializarInput() {
  console.log('[INPUT] 🚀 Inicializando tela de entrada...');
  
  // CRÍTICO: Limpa listeners anteriores para evitar duplicação
  cleanupInput();
  
  setupGauge("slider1", "gauge1", "gaugeVal1", "limite1");
  setupGauge("slider2", "gauge2", "gaugeVal2", "limite2");
  
  console.log('[INPUT] ✅ Inicialização concluída');
}

window.inicializarInput = inicializarInput;

// Auto-inicialização (para compatibilidade retroativa)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Apenas configura os gauges, não chama inicializarInput diretamente
    // para evitar duplicação quando main.js chamar
  });
}