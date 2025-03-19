function inicializarBalance() {
    console.log('Inicializando Balance...');

    // Estado
    let calibrationEnabled = false;
    let selectedLine = null;
    let lines = Array.from({ length: 18 }, (_, i) => ({
        number: i + 1,
        weight: Math.floor(Math.random() * 500) + 50,
        calibrated: Math.random() > 0.3
    }));

    // Elementos DOM
    const toggleBtn = document.getElementById('toggle-calibration');
    const balanceGrid = document.querySelector('.balance-grid');
    const weightModal = document.getElementById('weight-modal');
    const confirmationModal = document.getElementById('confirmation-modal');

    // Funções auxiliares
    function updateGrid() {
        balanceGrid.innerHTML = '';
        lines.forEach(line => {
            const card = document.createElement('div');
            card.className = 'balance-card';
            card.innerHTML = `
                <h3>Linha ${line.number}</h3>
                <span>${line.weight}g</span>
                <div class="balance-status">
                    <span class="status-indicator ${line.calibrated ? 'calibrated' : 'not-calibrated'}"></span>
                    <span>${line.calibrated ? 'Calibrada' : 'Não Calibrada'}</span>
                </div>
                ${calibrationEnabled ? `
                    <button class="calibrate-btn" data-line="${line.number}">
                        Calibrar
                    </button>
                ` : ''}
            `;
            balanceGrid.appendChild(card);
        });

        // Adicionar eventos aos botões de calibração
        if (calibrationEnabled) {
            document.querySelectorAll('.calibrate-btn').forEach(btn => {
                btn.addEventListener('click', handleCalibrateClick);
            });
        }
    }

    function showWeightModal(line) {
        selectedLine = line;
        document.getElementById('modal-line-number').textContent = line.number;
        document.getElementById('modal-current-value').textContent = line.weight;
        weightModal.style.display = 'flex';
    }

    function showConfirmationModal(weightType) {
        document.getElementById('confirm-line-number').textContent = selectedLine.number;
        document.getElementById('weight-type').textContent = 
            weightType === 'min' ? 'mínimo' : 'máximo';
        confirmationModal.style.display = 'flex';
    }

    function hideModals() {
        weightModal.style.display = 'none';
        confirmationModal.style.display = 'none';
    }

    // Event Handlers
    function handleToggleCalibration() {
        calibrationEnabled = !calibrationEnabled;
        toggleBtn.textContent = calibrationEnabled ? 
            'Desabilitar Calibração' : 'Habilitar Calibração';
        toggleBtn.classList.toggle('enabled', calibrationEnabled);
        toggleBtn.classList.toggle('disabled', !calibrationEnabled);
        updateGrid();
    }

    function handleCalibrateClick(e) {
        const lineNumber = parseInt(e.target.dataset.line);
        const line = lines.find(l => l.number === lineNumber);
        if (line) {
            showWeightModal(line);
        }
    }

    function handleWeightSelection(weightType) {
        hideModals();
        showConfirmationModal(weightType);
    }

    function handleConfirmCalibration() {
        if (selectedLine) {
            const index = lines.findIndex(l => l.number === selectedLine.number);
            if (index !== -1) {
                lines[index].calibrated = true;
            }
        }
        hideModals();
        updateGrid();
    }

    // Event Listeners
    toggleBtn.addEventListener('click', handleToggleCalibration);
    
    document.getElementById('min-weight-btn')
        .addEventListener('click', () => handleWeightSelection('min'));
    
    document.getElementById('max-weight-btn')
        .addEventListener('click', () => handleWeightSelection('max'));
    
    document.getElementById('cancel-weight-btn')
        .addEventListener('click', hideModals);
    
    document.getElementById('confirm-calibration')
        .addEventListener('click', handleConfirmCalibration);
    
    document.getElementById('cancel-confirmation')
        .addEventListener('click', hideModals);

    // Inicialização
    updateGrid();
}

// Exporta função para o escopo global
window.inicializarBalance = inicializarBalance;