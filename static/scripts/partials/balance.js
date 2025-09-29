function inicializarBalance() {
    console.log('Inicializando Balance...');

    // Estado
    let calibrationEnabled = false;
    let selectedLine = null;
    let lastToggleTime = 0; // Timestamp do último toggle manual
    let isToggling = false; // Flag para evitar múltiplos cliques
    let pollingInterval = null; // Referência do intervalo de polling
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

    // Garante que o botão ocupe espaço fixo no layout
    if (toggleBtn) toggleBtn.style.display = 'inline-flex';

    // Atualiza a visualização da grid com as linhas
    function updateGrid() {
        balanceGrid.innerHTML = '';
        lines.forEach(line => {
            const card = document.createElement('div');
            card.className = 'balance-card';
            card.innerHTML = `
                <h3>Linha ${line.number}</h3>
                <span class="weight-value">${line.weight}g</span>
                <div class="calibrate-actions" style="height: 90px;">
                    <button class="calibrate-btn" data-line="${line.number}" style="visibility:${calibrationEnabled ? 'visible' : 'hidden'};" ${calibrationEnabled ? '' : 'tabindex="-1" aria-hidden="true"'}>
                        <img src="/static/images/pages/icons/comandos/01%20-%20Bot%C3%A3o_Calibrar.png" alt="Calibrar" />
                    </button>
                    <div class="status-icons" data-line="${line.number}" style="visibility:${!calibrationEnabled ? 'visible' : 'hidden'};">
                        <img class="status-check" src="/static/images/pages/icons/status/00_Check_Laranja_2.png" alt="Calibrado" style="display: none;" />
                        <img class="status-error" src="/static/images/pages/icons/status/00_Erro.png" alt="Erro" style="display: none;" />
                    </div>
                </div>
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
        
        // Atualiza ícones de status após criar a grid
        if (!calibrationEnabled && lastStatusValues.pendente01 !== null && lastStatusValues.pendente02 !== null) {
            updateStatusIcons(lastStatusValues.pendente01, lastStatusValues.pendente02);
        }
        
        // Debug: verifica se os elementos foram criados
        console.log('Grid criada. Elementos .status-icons:', document.querySelectorAll('.status-icons').length);
        console.log('Elementos .status-check:', document.querySelectorAll('.status-check').length);
        console.log('Elementos .status-error:', document.querySelectorAll('.status-error').length);
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
    async function handleToggleCalibration() {
        // Previne múltiplos cliques simultâneos
        if (isToggling) {
            console.log('Toggle já em andamento, ignorando clique');
            return;
        }
        
        isToggling = true;
        console.log('Toggle calibração clicado. Estado atual:', calibrationEnabled);
        
        // Atualiza estado local IMEDIATAMENTE (sem esperar PLC)
        calibrationEnabled = !calibrationEnabled;
        toggleBtn.textContent = calibrationEnabled ? 'Desabilitar Calibração' : 'Habilitar Calibração';
        toggleBtn.classList.toggle('enabled', calibrationEnabled);
        toggleBtn.classList.toggle('disabled', !calibrationEnabled);
        
        // Atualiza grid imediatamente
        updateGrid();
        
        // Se habilitando, mostra loading
        if (calibrationEnabled) {
            try { 
                simulateLoading(); 
            } catch (e) { 
                console.warn('Falha ao iniciar simulação de carregamento:', e); 
            }
        }
        
        // Escreve no PLC em background (não bloqueia a UI)
        setTimeout(async () => {
            try {
                const tagName = 'XLCLASS_DB229_PESAGEM_COMANDO_STATUS';
                const res = await fetch(`/api/read_tags?names=${encodeURIComponent(tagName)}`, { cache: 'no-store' }).then(r=>r.json()).catch(()=>null);
                let current = res && res.values ? Number(res.values[tagName] || 0) : 0;
                if (!Number.isFinite(current)) current = 0;
                
                // Alterna bit 8 (0-based)
                const toggled = (current ^ (1 << 8)) >>> 0;
                console.log('Escrevendo no PLC:', { current, toggled });
                
                await fetch('/api/write_tags', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ [tagName]: toggled })
                });
                
                console.log('Escrita no PLC concluída');
            } catch(e) {
                console.error('Erro ao escrever no PLC:', e);
            } finally {
                isToggling = false;
            }
        }, 100); // Pequeno delay para não bloquear a UI
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

    // Cache para evitar piscar (desabilitado temporariamente para debug)
    let lastStatusValues = { pendente01: null, pendente02: null };
    
    // Função para atualizar ícones de status das linhas
    function updateStatusIcons(pendente01, pendente02) {
        console.log('Atualizando ícones com valores:', { pendente01, pendente02 });
        
        // Atualiza ícones para cada linha
        for (let lineNum = 1; lineNum <= 18; lineNum++) {
            const statusIcons = document.querySelector(`.status-icons[data-line="${lineNum}"]`);
            if (!statusIcons) continue;
            
            const checkIcon = statusIcons.querySelector('.status-check');
            const errorIcon = statusIcons.querySelector('.status-error');
            if (!checkIcon || !errorIcon) continue;
            
            let bitValue;
            let bitIndex;
            if (lineNum <= 16) {
                // Linhas 1-16: usa PENDENTE_01
                if (lineNum <= 8) {
                    bitIndex = lineNum + 7; // 1->8, 2->9, ..., 8->15
                } else {
                    bitIndex = lineNum - 9; // 9->0, 10->1, ..., 16->7
                }
                bitValue = ((pendente01 >> bitIndex) & 1) === 1;
            } else {
                // Linhas 17-18: usa PENDENTE_02
                bitIndex = lineNum - 9; // 17 -> 8, 18 -> 9
                bitValue = ((pendente02 >> bitIndex) & 1) === 1;
            }
            
            console.log(`Linha ${lineNum}: bit ${bitIndex} = ${bitValue}, mostra ${!bitValue ? 'CHECK' : 'ERRO'}`);
            
            // Mostra check se bit = 0, erro se bit = 1
            if (!bitValue) {
                checkIcon.style.setProperty('display', 'block', 'important');
                errorIcon.style.setProperty('display', 'none', 'important');
            } else {
                checkIcon.style.setProperty('display', 'none', 'important');
                errorIcon.style.setProperty('display', 'block', 'important');
            }
        }
    }
    

    // Função para iniciar polling do PLC
    function startPolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
        }
        
        pollingInterval = setInterval(refreshFromPLC, 2000); // 2 segundos
        console.log('Polling iniciado');
    }

    // Função para parar polling do PLC
    function stopPolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
            console.log('Polling parado');
        }
    }

    // Função de refresh do PLC
    async function refreshFromPLC() {
        // Não atualiza se estiver fazendo toggle manual
        if (isToggling) {
            return;
        }
        
        try {
            // Lê tags principais e de status em uma única chamada
            const SPEED_TAG = 'XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_REAL';
            const CMD_TAG = 'XLCLASS_DB229_PESAGEM_COMANDO_STATUS';
            const PENDENTE_01 = 'XLCLASS_DB229_PESAGEM_CAL_PENDENTE_01';
            const PENDENTE_02 = 'XLCLASS_DB229_PESAGEM_CAL_PENDENTE_02';
            const names = `${SPEED_TAG},${CMD_TAG},${PENDENTE_01},${PENDENTE_02}`;
            const res = await fetch(`/api/read_tags?names=${encodeURIComponent(names)}`, { cache: 'no-store' }).then(r=>r.json());
            if (!res || !res.ok || !res.values) throw new Error('bad');
            
            const vReal = Number(res.values[SPEED_TAG] || 0);
            const cmd = Number(res.values[CMD_TAG] || 0) >>> 0;
            const bit8 = ((cmd >> 8) & 1) === 1;
            const pendente01 = Number(res.values[PENDENTE_01] || 0) >>> 0;
            const pendente02 = Number(res.values[PENDENTE_02] || 0) >>> 0;

            // Mostra ou oculta o botão conforme velocidade
            const machineStopped = !(Number.isFinite(vReal) && vReal > 0);
            if (toggleBtn) {
                // Mantém espaço no layout: oculta apenas com visibility
                toggleBtn.style.visibility = machineStopped ? 'visible' : 'hidden';
                // Só atualiza cor do botão, NÃO o estado
                toggleBtn.classList.toggle('danger', bit8);
            }
            
            // NUNCA atualiza o estado da calibração via polling - apenas via clique do usuário
            // O estado é controlado 100% pelo usuário
            
            // Atualiza ícones apenas se calibração desativada
            if (!calibrationEnabled) {
                updateStatusIcons(pendente01, pendente02);
            }
            
        } catch(e) {
            console.error('Erro na leitura do PLC:', e);
            // Em falha, oculta visualmente mantendo o espaço
            if (toggleBtn) toggleBtn.style.visibility = 'hidden';
        }
    }

    // ========== Integração com PLC ==========
    async function connectToPLC() {
        // Primeira leitura imediata
        refreshFromPLC();
        
        // Inicia polling
        startPolling();
    }

    // ========== Função de Teste ==========
    // Adiciona botão de teste temporário (remover em produção)
    function addTestButton() {
        // Cria botão de teste para forçar leitura do PLC
        const testBtn = document.createElement('button');
        testBtn.textContent = 'TESTE PLC';
        testBtn.style.position = 'fixed';
        testBtn.style.top = '10px';
        testBtn.style.right = '10px';
        testBtn.style.zIndex = '9999';
        testBtn.style.padding = '10px';
        testBtn.style.backgroundColor = 'red';
        testBtn.style.color = 'white';
        testBtn.style.border = 'none';
        testBtn.style.borderRadius = '5px';
        testBtn.style.cursor = 'pointer';
        
        testBtn.addEventListener('click', async () => {
            console.log('=== TESTE MANUAL DO PLC ===');
            try {
                const res = await fetch('/api/read_tags?names=XLCLASS_DB229_PESAGEM_CAL_PENDENTE_01,XLCLASS_DB229_PESAGEM_CAL_PENDENTE_02', { cache: 'no-store' }).then(r=>r.json());
                console.log('Resposta da API:', res);
                if (res && res.values) {
                    const p01 = Number(res.values['XLCLASS_DB229_PESAGEM_CAL_PENDENTE_01'] || 0);
                    const p02 = Number(res.values['XLCLASS_DB229_PESAGEM_CAL_PENDENTE_02'] || 0);
                    console.log('Valores lidos:', { p01, p02 });
                    
                    // Testa cálculo de bits para algumas linhas
                    console.log('=== TESTE DE CÁLCULO DE BITS ===');
                    for (let line = 1; line <= 5; line++) {
                        let bitIndex, bitValue;
                        if (line <= 8) {
                            bitIndex = line + 7; // 1->8, 2->9, etc
                            bitValue = ((p01 >> bitIndex) & 1) === 1;
                        } else {
                            bitIndex = line - 9; // 9->0, 10->1, etc
                            bitValue = ((p01 >> bitIndex) & 1) === 1;
                        }
                        console.log(`Linha ${line}: bit ${bitIndex} = ${bitValue} (deveria mostrar ${bitValue ? 'ERRO' : 'CHECK'})`);
                    }
                    
                    updateStatusIcons(p01, p02);
                    
                    // Teste forçado - força ERRO na linha 1
                    const testStatusIcons = document.querySelector('.status-icons[data-line="1"]');
                    if (testStatusIcons) {
                        const testCheck = testStatusIcons.querySelector('.status-check');
                        const testError = testStatusIcons.querySelector('.status-error');
                        if (testCheck && testError) {
                            console.log('Forçando ERRO na linha 1...');
                            testCheck.style.setProperty('display', 'none', 'important');
                            testError.style.setProperty('display', 'block', 'important');
                        }
                    }
                    
                    alert(`Valores lidos: PENDENTE_01=${p01}, PENDENTE_02=${p02}\n\nCom esses valores, todas as linhas deveriam mostrar ERRO (ícone vermelho)\n\nLinha 1 foi forçada para mostrar ERRO para teste.`);
                }
            } catch(e) {
                console.error('Erro no teste manual:', e);
                alert('Erro: ' + e.message);
            }
        });
        
        document.body.appendChild(testBtn);
    }

    // Inicialização inicial da grid
    updateGrid();
    
    // Botão de teste removido (funcionando corretamente)
    
    // Teste direto dos ícones
    setTimeout(() => {
        console.log('=== TESTE DIRETO DOS ÍCONES ===');
        console.log('Elementos .status-icons encontrados:', document.querySelectorAll('.status-icons').length);
        
        // Testa com valores fixos
        const testPendente01 = 0; // Todos os bits 0 = check
        const testPendente02 = 0;
        
        console.log('Testando com valores:', { testPendente01, testPendente02 });
        updateStatusIcons(testPendente01, testPendente02);
        
        // Teste forçado - mostra check na linha 1
        const testStatusIcons = document.querySelector('.status-icons[data-line="1"]');
        if (testStatusIcons) {
            const testCheck = testStatusIcons.querySelector('.status-check');
            const testError = testStatusIcons.querySelector('.status-error');
            if (testCheck && testError) {
                console.log('Forçando check na linha 1...');
                testCheck.style.setProperty('display', 'block', 'important');
                testError.style.setProperty('display', 'none', 'important');
            }
        }
        
        // Teste de leitura direta do PLC
        console.log('=== TESTE DE LEITURA DIRETA DO PLC ===');
        fetch('/api/read_tags?names=XLCLASS_DB229_PESAGEM_CAL_PENDENTE_01,XLCLASS_DB229_PESAGEM_CAL_PENDENTE_02', { cache: 'no-store' })
            .then(r => r.json())
            .then(res => {
                console.log('Resposta da API:', res);
                if (res && res.values) {
                    const p01 = Number(res.values['XLCLASS_DB229_PESAGEM_CAL_PENDENTE_01'] || 0);
                    const p02 = Number(res.values['XLCLASS_DB229_PESAGEM_CAL_PENDENTE_02'] || 0);
                    console.log('Valores lidos diretamente:', { p01, p02 });
                    updateStatusIcons(p01, p02);
                }
            })
            .catch(e => console.error('Erro na leitura direta:', e));
        
        // Verifica se os ícones foram atualizados
        for (let i = 1; i <= 3; i++) {
            const statusIcons = document.querySelector(`.status-icons[data-line="${i}"]`);
            if (statusIcons) {
                const checkIcon = statusIcons.querySelector('.status-check');
                const errorIcon = statusIcons.querySelector('.status-error');
                console.log(`Linha ${i}:`, {
                    checkDisplay: checkIcon ? checkIcon.style.display : 'não encontrado',
                    errorDisplay: errorIcon ? errorIcon.style.display : 'não encontrado'
                });
            }
        }
    }, 2000);
    
    // Conectar com PLC
    connectToPLC();
}

// Torna a função disponível globalmente para ser chamada depois do DOM carregar
window.inicializarBalance = inicializarBalance;
