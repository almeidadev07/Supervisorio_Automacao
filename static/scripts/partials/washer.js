document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM carregado, configurando washer...');
    
    const slider = document.getElementById('slider1');
    const gauge = document.getElementById('gauge1');
    const valueText = document.getElementById('gaugeVal1');
    const limiteText = document.getElementById('limite1');

    if (!slider || !gauge || !valueText || !limiteText) {
        console.error('Elementos não encontrados');
        return;
    }

    function updateGauge() {
        const value = slider.value;
        console.log('Novo valor:', value);
        
        // Atualiza textos
        valueText.textContent = `${value}%`;
        limiteText.textContent = `${value}%`;
        
        // Atualiza gradiente
        gauge.style.background = `conic-gradient(
            #00cc66 ${value * 3.6}deg,
            #eee ${value * 3.6}deg
        )`;
    }

    // Adiciona eventos
    slider.addEventListener('input', updateGauge);
    slider.addEventListener('change', updateGauge);
    
    // Inicialização
    updateGauge();
});