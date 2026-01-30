// Frontend Secadora - apenas UI. Lógica PLC será adicionada depois.

// ============================================
// GERENCIAMENTO DE EVENT LISTENERS
// ============================================
let dryerEventListeners = [];

function registerDryerEventListener(element, event, handler) {
    if (element) {
        element.addEventListener(event, handler);
        dryerEventListeners.push({ element, event, handler });
    }
}

// Função de cleanup
function cleanupDryer() {
    console.log('[DRYER] 🧹 Iniciando cleanup...');
    
    // Remove todos os event listeners registrados
    dryerEventListeners.forEach(({ element, event, handler }) => {
        if (element) {
            element.removeEventListener(event, handler);
        }
    });
    dryerEventListeners = [];
    
    console.log('[DRYER] ✅ Cleanup concluído');
}

window.cleanupDryer = cleanupDryer;

function inicializarDryer() {
  console.log('🚀 Tela Secadora Inicializada');
  
  // CRÍTICO: Limpa listeners anteriores para evitar duplicação
  cleanupDryer();
  
  // Apenas revela os controles para evitar flash
  document.querySelectorAll('.dryer-layout .controls-row, .dryer-layout .direction-row')
    .forEach(el => { el.style.visibility = 'visible'; });

  // Placeholders de handlers (sem PLC ainda)
  document.querySelectorAll('.dryer-layout .power-toggle').forEach(el => {
    const powerClickHandler = () => {
      console.log('Clique power (placeholder)');
      // Toggle visual dos botões sobrepostos
      const powerOn = el.querySelector('.power-on');
      const powerOff = el.querySelector('.power-off');
      if (powerOn && powerOff) {
        const isOn = powerOn.style.display === 'block';
        powerOn.style.display = isOn ? 'none' : 'block';
        powerOff.style.display = isOn ? 'block' : 'none';
      }
    };
    registerDryerEventListener(el, 'click', powerClickHandler);
  });
  
  document.querySelectorAll('.dryer-layout .direction-toggle').forEach(el => {
    const directionClickHandler = (ev) => {
      const img = el.querySelector('.direction');
      if (!img) return;
      const anti = img.getAttribute('data-src-anti');
      const hor = img.getAttribute('data-src-horario');
      img.src = (img.src.includes('horario')) ? anti : hor;
    };
    registerDryerEventListener(el, 'click', directionClickHandler);
  });
}

window.inicializarDryer = inicializarDryer;


