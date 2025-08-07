// washer.js - Versão Corrigida baseada no input.js funcional

function setupGauge(sliderId, gaugeId, textId, limiteId) {
    const slider = document.getElementById(sliderId);
    const gauge = document.getElementById(gaugeId);
    const valueText = document.getElementById(textId);
    const limiteText = document.getElementById(limiteId);
    
    if (!slider || !gauge || !valueText || !limiteText) {
        console.error('❌ Elementos não encontrados para:', {
            sliderId, gaugeId, textId, limiteId
        });
        return;
    }
    
    console.log('✅ Configurando gauge:', sliderId);
    
    slider.addEventListener("input", () => {
        const val = slider.value;
        console.log(`📊 Atualizando ${sliderId} para: ${val}%`);
        
        valueText.textContent = `${val}%`;
        limiteText.textContent = `${val}%`;
        
        // Esta é a sintaxe correta que funciona no input.js
        gauge.style.background = `conic-gradient(#00cc66 0% ${val}%, #eee ${val}% 100%)`;
    });
    
    // Inicializa com valor 0
    const initialVal = slider.value;
    valueText.textContent = `${initialVal}%`;
    limiteText.textContent = `${initialVal}%`;
    gauge.style.background = `conic-gradient(#00cc66 0% ${initialVal}%, #eee ${initialVal}% 100%)`;
}

function inicializarWasher() {
    console.log('🚀 Sistema de Washer Inicializado - Versão Corrigida');
    
    // Configura o gauge principal (mesmo padrão do input.js)
    setupGauge("slider1", "gauge1", "gaugeVal1", "limite1");
    
    // Configuração dos botões dos motores
    setupMotorButtons();
    
    // Configuração do switch Jog
    setupJogSwitch();
    
    console.log('✅ Washer configurado com sucesso!');
}

function setupMotorButtons() {
    const buttons = document.querySelectorAll('.btn');
    
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            // Toggle da classe active
            this.classList.toggle('active');
            
            // Log para debug
            const motorUnit = this.closest('.motor-unit');
            const motorName = motorUnit ? motorUnit.querySelector('h3').textContent : 'Desconhecido';
            const buttonType = this.className.includes('hand') ? 'Manual' : 
                              this.className.includes('power') ? 'Power' : 
                              this.className.includes('timer') ? 'Timer' : 'Outro';
            
            console.log(`🔘 Botão ${buttonType} do motor "${motorName}" ${this.classList.contains('active') ? 'ativado' : 'desativado'}`);
        });
    });
}

function setupJogSwitch() {
    const jogSwitch = document.getElementById('jog1');
    
    if (jogSwitch) {
        jogSwitch.addEventListener('change', function() {
            console.log('🔄 Jog switch:', this.checked ? 'ON' : 'OFF');
        });
    }
}

// Exporta a função para o escopo global
window.inicializarWasher = inicializarWasher;

