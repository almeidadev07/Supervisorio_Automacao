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

    // Atualiza a visualização da grid com as linhas
    function updateGrid() {
        balanceGrid.innerHTML = '';
        lines.forEach(line => {
            const card = document.createElement('div');
            card.className = 'balance-card';
            card.innerHTML = `
                <h3>Linha ${line.number}</h3>
                <span class="weight-value">${line.weight}g</span>
                <div class="balance-status">
                    <span class="status-indicator ${line.calibrated ? 'calibrated' : 'not-calibrated'}"></span>
                    <span>${line.calibrated ? 'Calibrado' : 'Pendente'}</span>
                </div>
                ${calibrationEnabled ? `
                    <button class="calibrate-btn" data-line="${line.number}">
                        Calibrar
                    </button>
                ` : ''}
            `;
            balanceGrid.appendChild(card);
        });

        // Adiciona evento aos botões de calibrar *somente* se calibração estiver habilitada
        if (calibrationEnabled) {
            document.querySelectorAll('.calibrate-btn').forEach(btn => {
                btn.addEventListener('click', handleCalibrateClick);
            });
        }
    }

    // Abre modal para escolher peso (mínimo ou máximo)
    function showWeightModal(line) {
        selectedLine = line;
        document.getElementById('modal-line-number').textContent = line.number;
        document.getElementById('modal-current-value').textContent = line.weight;
        weightModal.style.display = 'flex';
    }

    // Abre modal de confirmação para o peso escolhido (mín ou máx)
    function showConfirmationModal(weightType) {
        document.getElementById('confirm-line-number').textContent = selectedLine.number;
        document.getElementById('weight-type').textContent =
            weightType === 'min' ? 'mínimo' : 'máximo';
        confirmationModal.style.display = 'flex';
    }

    // Fecha todos os modais abertos
    function hideModals() {
        weightModal.style.display = 'none';
        confirmationModal.style.display = 'none';
    }

    // Alterna o estado da calibração (ativa/desativa)
    function handleToggleCalibration() {
        calibrationEnabled = !calibrationEnabled;
        toggleBtn.textContent = calibrationEnabled ?
            'Desabilitar Calibração' : 'Habilitar Calibração';
        toggleBtn.classList.toggle('enabled', calibrationEnabled);
        toggleBtn.classList.toggle('disabled', !calibrationEnabled);
        updateGrid();
    }

    // Evento ao clicar no botão "Calibrar"
    function handleCalibrateClick(e) {
        const lineNumber = parseInt(e.target.dataset.line, 10);
        const line = lines.find(l => l.number === lineNumber);
        if (line) {
            showWeightModal(line);
        }
    }

    // Quando usuário escolhe peso mínimo ou máximo
    function handleWeightSelection(weightType) {
        hideModals();
        showConfirmationModal(weightType);
    }

    // Confirma a calibração da linha selecionada
    function handleConfirmCalibration() {
        if (selectedLine) {
            const index = lines.findIndex(l => l.number === selectedLine.number);
            if (index !== -1) {
                lines[index].calibrated = true;
                // Se quiser, atualize o peso conforme o tipo de calibração aqui
                // Exemplo:
                // lines[index].weight = newWeightValue;
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

    // Inicialização inicial da grid
    updateGrid();
}

// Torna a função disponível globalmente para ser chamada depois do DOM carregar
window.inicializarBalance = inicializarBalance;
