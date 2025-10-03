// Frontend Secadora - apenas UI. Lógica PLC será adicionada depois.

function inicializarDryer() {
  console.log('🚀 Tela Secadora Inicializada');
  // Apenas revela os controles para evitar flash
  document.querySelectorAll('.dryer-layout .controls-row, .dryer-layout .direction-row')
    .forEach(el => { el.style.visibility = 'visible'; });

  // Placeholders de handlers (sem PLC ainda)
  document.querySelectorAll('.dryer-layout .power-toggle').forEach(el => {
    el.addEventListener('click', () => {
      console.log('Clique power (placeholder)');
      // Toggle visual dos botões sobrepostos
      const powerOn = el.querySelector('.power-on');
      const powerOff = el.querySelector('.power-off');
      if (powerOn && powerOff) {
        const isOn = powerOn.style.display === 'block';
        powerOn.style.display = isOn ? 'none' : 'block';
        powerOff.style.display = isOn ? 'block' : 'none';
      }
    });
  });
  document.querySelectorAll('.dryer-layout .direction-toggle').forEach(el => {
    el.addEventListener('click', (ev) => {
      const img = el.querySelector('.direction');
      if (!img) return;
      const anti = img.getAttribute('data-src-anti');
      const hor = img.getAttribute('data-src-horario');
      img.src = (img.src.includes('horario')) ? anti : hor;
    });
  });
}

window.inicializarDryer = inicializarDryer;


