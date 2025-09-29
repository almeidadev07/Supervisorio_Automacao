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
                <span class=\"weight-value\">${line.weight}g</span>
                <div class=\"balance-status\">
                    <span class=\"status-indicator ${line.calibrated ? 'calibrated' : 'not-calibrated'}\"></span>
                    <span>${line.calibrated ? 'Calibrado' : 'Pendente'}</span>
                </div>
                ${calibrationEnabled ? `
                    <div class=\"calibrate-actions\">
                        <button class=\"calibrate-btn\" data-line=\"${line.number}\">
                            <img src=\"/static/images/pages/icons/comandos/01%20-%20Bot%C3%A3o_Calibrar.png\" alt=\"Calibrar\" />
                        </button>
                    </div>
                ` : ''}
            `;
            balanceGrid.appendChild(card);
        });

        // Adiciona evento aos botões de calibrar *somente* se calibração estiver habilitada
        if (calibrationEnabled) {
            document.querySelectorAll('.calibrate-btn').forEach(btn => {
                btn.removeEventListener('click', handleCalibrateClick);
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

        // Quando habilitar calibração, exibe o carregamento com a barra do centro
        if (calibrationEnabled) {
            try {
                simulateLoading();
            } catch (e) {
                console.warn('Falha ao iniciar simulação de carregamento:', e);
            }
        }
        updateGrid();
    }

    // Evento ao clicar no botão "Calibrar"
    function handleCalibrateClick(e) {
        const datasetSource = e.currentTarget || e.target.closest('.calibrate-btn') || e.target;
        const lineNumber = parseInt(datasetSource.dataset.line, 10);
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

    // X para fechar nos modais
    document.querySelectorAll('.modal .modal-close').forEach(btn => {
        btn.addEventListener('click', hideModals);
    });

    document.getElementById('confirm-calibration')
        .addEventListener('click', handleConfirmCalibration);

    document.getElementById('cancel-calibration')
        .addEventListener('click', hideModals);


    // ========== Modal de Carregamento ==========
    const loadingModal = document.getElementById('loading-modal');
    const progressLeft = document.getElementById('loading-progress-left');
    const progressRight = document.getElementById('loading-progress-right');
    const progressText = document.getElementById('loading-progress-text');

    // Função para mostrar/ocultar modal de carregamento
    function toggleLoadingModal(show) {
        if (show) {
            loadingModal.style.display = 'flex';
        } else {
            loadingModal.style.display = 'none';
        }
    }

    // Função para atualizar progresso (0-10)
    function updateProgress(value) {
        const percentage = (value / 10) * 100; // 0..100
        const halfWidth = Math.max(0, Math.min(50, percentage / 2)); // 0..50
        console.log('Atualizando progresso:', value, '->', percentage + '%');

        if (progressLeft && progressRight) {
            progressLeft.style.width = halfWidth + '%';
            progressRight.style.width = halfWidth + '%';
        }

        if (progressText) {
            progressText.textContent = Math.round(percentage) + '%';
        }
    }

    // Função para simular carregamento (para teste)
    function simulateLoading() {
        console.log('Iniciando simulação de carregamento...');
        toggleLoadingModal(true);
        
        // Aguardar o modal aparecer
        setTimeout(() => {
            const progressLeft = document.getElementById('loading-progress-left');
            const progressRight = document.getElementById('loading-progress-right');
            const progressText = document.getElementById('loading-progress-text');
            const progressBar = document.querySelector('.progress-bar');
            
            console.log('Elementos encontrados:', {
                progressFill: !!progressFill,
                progressText: !!progressText,
                progressBar: !!progressBar
            });
            
            if (progressLeft && progressRight) {
                progressLeft.style.width = '0%';
                progressRight.style.width = '0%';
            }
            
            if (progressText) {
                progressText.textContent = '0%';
                console.log('Texto de progresso inicializado');
            }
            
            if (progressBar) {
                progressBar.style.opacity = '1';
                progressBar.style.visibility = 'visible';
                progressBar.style.display = 'block';
                console.log('Container da barra inicializado');
            }
        }, 200);
        
        let progress = 0;
        const interval = setInterval(() => {
            progress += 0.5;
            updateProgress(progress);
            console.log('Progresso:', progress);
            
            if (progress >= 10) {
                clearInterval(interval);
                setTimeout(() => {
                    toggleLoadingModal(false);
                }, 500);
            }
        }, 300);
    }

    // ========== Integração com PLC ==========
    // Função para conectar com tags do PLC
    function connectToPLC() {
        // Aqui você deve conectar com o sistema de tags do PLC
        // Exemplo de como seria a integração:
        
        // Tag de controle (boolean) - quando true, mostra o loading
        // Tag de progresso (0-10) - valor do progresso
        
        // Exemplo de uso:
        // setInterval(() => {
        //     const loadingActive = getPLCTag('loading_active'); // Tag boolean
        //     const progressValue = getPLCTag('loading_progress'); // Tag 0-10
        //     
        //     if (loadingActive) {
        //         toggleLoadingModal(true);
        //         updateProgress(progressValue);
        //     } else {
        //         toggleLoadingModal(false);
        //     }
        // }, 100);
    }

    // ========== Função de Teste ==========
    // Adiciona botão de teste temporário (remover em produção)
    function addTestButton() {
        // Removido botão de teste em produção
    }

    // Inicialização inicial da grid
    updateGrid();
    
    // Botão de teste removido
    
    // Conectar com PLC
    connectToPLC();
}

// Torna a função disponível globalmente para ser chamada depois do DOM carregar
window.inicializarBalance = inicializarBalance;
