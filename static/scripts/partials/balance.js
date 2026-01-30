function inicializarBalance() {
    console.log('Inicializando Balance...');

    // ✅ Função para obter quantidade de linhas baseado no tipo de máquina
    // 200CX = 6 linhas, 400CX = 12 linhas, 700CX = 18 linhas
    // NOTA: Este parâmetro é INDEPENDENTE da quantidade de embaladoras (tela de classificação)
    function getLineQuantity() {
        const machineType = localStorage.getItem('supervisor_machine_type') || '700CX';
        
        // Mapeia tipo de máquina para quantidade de linhas de balança
        switch (machineType.toUpperCase()) {
            case '200CX':
                return 6;
            case '400CX':
                return 12;
            case '700CX':
            default:
                return 18;
        }
    }
    
    // ✅ Função para atualizar o layout do grid baseado na quantidade de linhas
    function updateGridLayout(lineCount) {
        const balanceGrid = document.querySelector('.balance-grid');
        if (!balanceGrid) return;
        
        // Sempre organiza em 2 linhas (rows), ajustando apenas as colunas
        // 6 boxes = 3 colunas x 2 linhas
        // 12 boxes = 6 colunas x 2 linhas
        // 18 boxes = 9 colunas x 2 linhas
        const columns = Math.ceil(lineCount / 2);
        const gap = '16px';
        
        // Aplica layout centralizado com colunas calculadas
        balanceGrid.style.gridTemplateColumns = `repeat(${columns}, minmax(120px, 180px))`;
        balanceGrid.style.gap = gap;
        balanceGrid.style.justifyContent = 'center';
        balanceGrid.style.alignContent = 'center';
        
        // Adiciona data-attribute para referência
        balanceGrid.setAttribute('data-lines', lineCount);
        
        console.log(`[BALANCE] Layout ajustado: ${lineCount} boxes, ${columns} colunas x 2 linhas, centralizado`);
    }

    // Estado
    let calibrationEnabled = false; // Controlado pelo usuário (botão toggle)
    let calibrationButtonsEnabled = false; // Controlado pela tag do PLC (status > 9)
    let calibrationButtonsLocked = false; // ✅ NOVO: Trava os botões visíveis até ação do usuário
    let plcConnected = false; // Status da comunicação com o PLC
    let selectedLine = null;
    let selectedWeightType = null; // 'min' ou 'max'
    let lastToggleTime = 0; // Timestamp do último toggle manual
    let isToggling = false; // Flag para evitar múltiplos cliques
    let pollingInterval = null; // Referência do intervalo de polling
    let calibrationPollingInterval = null; // Referência do intervalo de polling da calibração
    let refreshInFlight = false;
    let calibrationPollInFlight = false;
    
    // ✅ Obtém quantidade de linhas da configuração
    const lineQuantity = getLineQuantity();
    console.log(`[BALANCE] Quantidade de linhas configurada: ${lineQuantity}`);
    
    // ✅ Sistema de bloqueio baseado em TIMESTAMP (não depende de timers)
    let calibrationBlockedUntil = 0; // Timestamp até quando está bloqueado
    const CALIBRATION_BLOCK_MS = 6000; // 6 segundos de bloqueio após cada escrita
    let lastWaitPopupTime = 0; // Timestamp da última vez que o popup de espera foi mostrado
    const WAIT_POPUP_COOLDOWN = 4000; // Mostra popup de espera no máximo a cada 4 segundos
    
    // ✅ Função para verificar se está bloqueado (baseado em timestamp, não em flag)
    function isCalibrationBusy() {
        return Date.now() < calibrationBlockedUntil;
    }
    
    // ✅ Função para verificar se pode mostrar popup de espera (evita spam)
    function canShowWaitPopup() {
        const now = Date.now();
        if (now - lastWaitPopupTime > WAIT_POPUP_COOLDOWN) {
            lastWaitPopupTime = now;
            return true;
        }
        return false;
    }
    
    // ✅ Função para bloquear (seta timestamp futuro)
    function startCalibrationBlock() {
        // Durante a escrita, bloqueia por tempo maior (escrita pode demorar)
        calibrationBlockedUntil = Date.now() + 15000; // 15s de margem durante escrita
        console.log(`[BALANCE] 🔒 Calibração BLOQUEADA (escrita em andamento)`);
    }
    
    // ✅ Função para finalizar (ajusta timestamp para cooldown restante)
    function endCalibrationBlock() {
        calibrationBlockedUntil = Date.now() + CALIBRATION_BLOCK_MS;
        console.log(`[BALANCE] ⏳ Escrita concluída - cooldown de ${CALIBRATION_BLOCK_MS/1000}s`);
    }
    
    // ✅ NOVO: Função para resetar o estado de calibração (volta ao estado inicial)
    function resetCalibrationState() {
        console.log('[BALANCE] 🔄 Resetando estado de calibração para estado inicial');
        calibrationEnabled = false;
        calibrationButtonsEnabled = false;
        calibrationButtonsLocked = false;
        
        // Atualiza o botão de toggle
        if (toggleBtn) {
            toggleBtn.textContent = 'Habilitar Calibração';
            toggleBtn.classList.remove('enabled');
            toggleBtn.classList.add('disabled');
        }
        
        // Para o polling de calibração se estiver ativo
        if (calibrationPollingInterval) {
            clearInterval(calibrationPollingInterval);
            calibrationPollingInterval = null;
        }
        
        // Fecha o modal de loading se estiver aberto
        toggleLoadingModal(false);
        
        // Atualiza a grid para mostrar status ao invés de botões
        updateGrid();
        
        // ✅ Força leitura imediata dos status para atualizar ícones rapidamente
        forceUpdateStatusIcons();
    }
    
    // ✅ Função para forçar atualização imediata dos ícones de status
    async function forceUpdateStatusIcons() {
        try {
            const PENDENTE_01 = 'XLCLASS_DB229_PESAGEM_CAL_PENDENTE_01';
            const PENDENTE_02 = 'XLCLASS_DB229_PESAGEM_CAL_PENDENTE_02';
            const res = await fetch(`/api/read_tags?names=${encodeURIComponent(`${PENDENTE_01},${PENDENTE_02}`)}`, { cache: 'no-store' }).then(r => r.json());
            
            if (res && res.ok && res.values) {
                const pendente01 = Number(res.values[PENDENTE_01] || 0) >>> 0;
                const pendente02 = Number(res.values[PENDENTE_02] || 0) >>> 0;
                console.log('[BALANCE] ⚡ Atualização imediata dos ícones de status:', { pendente01, pendente02 });
                updateStatusIcons(pendente01, pendente02);
            }
        } catch (error) {
            console.error('[BALANCE] Erro ao forçar atualização dos ícones:', error);
        }
    }
    
    // ✅ Cria linhas baseado na quantidade configurada
    let lines = Array.from({ length: lineQuantity }, (_, i) => ({
        number: i + 1,
        weight: 0,
        calibrated: false
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
        
        // ✅ Aplica layout dinâmico baseado na quantidade de linhas
        updateGridLayout(lines.length);
        
        lines.forEach(line => {
            const card = document.createElement('div');
            card.className = 'balance-card';
            card.innerHTML = `
                <h3>Linha ${line.number}</h3>
                <span class="weight-value">${plcConnected ? `${Number(line.weight || 0)} g` : '### g'}</span>
                <div class="calibrate-actions" style="height: 90px;">
                    <button class="calibrate-btn" data-line="${line.number}" style="visibility:${calibrationButtonsEnabled ? 'visible' : 'hidden'};" ${calibrationButtonsEnabled ? '' : 'tabindex="-1" aria-hidden="true"'}>
                        <img src="/static/images/pages/icons/comandos/01%20-%20Bot%C3%A3o_Calibrar.png" alt="Calibrar" />
                    </button>
                    <div class="status-icons" data-line="${line.number}" style="visibility:${!calibrationButtonsEnabled ? 'visible' : 'hidden'};">
                        <img class="status-check" src="/static/images/pages/icons/status/00_Check_Laranja_2.png" alt="Calibrado" style="display: none;" />
                        <img class="status-error" src="/static/images/pages/icons/status/00_Erro.png" alt="Erro" style="display: none;" />
                    </div>
                </div>
            `;
            balanceGrid.appendChild(card);
        });

        // Adiciona evento aos botões de calibrar *somente* se botões estiverem habilitados
        if (calibrationButtonsEnabled) {
            document.querySelectorAll('.calibrate-btn').forEach(btn => {
                btn.removeEventListener('click', handleCalibrateClick);
                btn.addEventListener('click', handleCalibrateClick);
            });
        }
        
        // Atualiza ícones de status após criar a grid
        if (!calibrationButtonsEnabled && lastStatusValues.pendente01 !== null && lastStatusValues.pendente02 !== null) {
            updateStatusIcons(lastStatusValues.pendente01, lastStatusValues.pendente02);
        }
        
        // Debug: verifica se os elementos foram criados
        console.log('Grid criada. Elementos .status-icons:', document.querySelectorAll('.status-icons').length);
        console.log('Elementos .status-check:', document.querySelectorAll('.status-check').length);
        console.log('Elementos .status-error:', document.querySelectorAll('.status-error').length);
    }

    // Atualiza apenas os valores de peso na UI (sem recriar a grid)
    function updateWeightSpans() {
        document.querySelectorAll('.balance-card').forEach((card, idx) => {
            const span = card.querySelector('.weight-value');
            if (!span) return;
            
            if (plcConnected) {
                const w = Number(lines[idx]?.weight || 0);
                // Só mostra valor se for um número válido e diferente de 0, ou se for 0 mas com conexão confirmada
                span.textContent = `${w} g`;
            } else {
                span.textContent = '### g';
            }
        });
    }

    // Abre modal para escolher peso (mínimo ou máximo)
    function showWeightModal(line) {
        if (!line) {
            console.warn('[BALANCE] showWeightModal chamado com line null');
            return;
        }
        selectedLine = line;
        console.log(`[BALANCE] selectedLine definido para linha ${line.number}`);
        document.getElementById('modal-line-number').textContent = line.number;
        
        if (plcConnected) {
            const w = Number(line.weight || 0);
            document.getElementById('modal-current-value').textContent = w;
        } else {
            document.getElementById('modal-current-value').textContent = '###';
        }
        
        weightModal.style.display = 'flex';
    }

    // Abre modal de confirmação para o peso escolhido (mín ou máx)
    function showConfirmationModal(weightType) {
        if (!selectedLine) {
            console.warn('[BALANCE] selectedLine é null - ignorando showConfirmationModal');
            return;
        }
        document.getElementById('confirm-line-number').textContent = selectedLine.number;
        document.getElementById('weight-type').textContent =
            weightType === 'min' ? 'mínimo' : 'máximo';
        confirmationModal.style.display = 'flex';
    }

    // Fecha todos os modais abertos
    function hideModals() {
        if (weightModal) weightModal.style.display = 'none';
        if (confirmationModal) confirmationModal.style.display = 'none';
        hideBalanceToast(); // Remove qualquer toast pendente
    }
    
    // ✅ Função de emergência para fechar TUDO (pode ser chamada do console: window.closeAllBalanceModals())
    window.closeAllBalanceModals = function() {
        if (weightModal) weightModal.style.display = 'none';
        if (confirmationModal) confirmationModal.style.display = 'none';
        const lm = document.getElementById('loading-modal');
        if (lm) lm.style.display = 'none';
        hideBalanceToast();
        calibrationBlockedUntil = 0; // Libera bloqueio
        console.log('[BALANCE] 🔓 Todos os modais fechados e bloqueio liberado');
    };
    
    // ✅ NOVO: Função global de cleanup para ser chamada quando sair da tela
    window.cleanupBalance = function() {
        console.log('[BALANCE] 🧹 Cleanup da tela de balança');
        console.log('[BALANCE] Estado atual:', { calibrationEnabled, calibrationButtonsEnabled, calibrationButtonsLocked });
        
        // ✅ SEMPRE reseta o estado ao sair da tela (sem condição)
        // Salva o estado antes de resetar para poder escrever no PLC
        const wasEnabled = calibrationEnabled;
        const wasButtonsEnabled = calibrationButtonsEnabled;
        const wasLocked = calibrationButtonsLocked;
        
        // Reseta estado local
        calibrationEnabled = false;
        calibrationButtonsEnabled = false;
        calibrationButtonsLocked = false;
        
        // Atualiza o botão de toggle
        if (toggleBtn) {
            toggleBtn.textContent = 'Habilitar Calibração';
            toggleBtn.classList.remove('enabled');
            toggleBtn.classList.add('disabled');
        }
        
        // Para o polling de calibração
        if (calibrationPollingInterval) {
            clearInterval(calibrationPollingInterval);
            calibrationPollingInterval = null;
        }
        
        // Fecha modais
        if (weightModal) weightModal.style.display = 'none';
        if (confirmationModal) confirmationModal.style.display = 'none';
        const lm = document.getElementById('loading-modal');
        if (lm) lm.style.display = 'none';
        hideBalanceToast();
        
        // Atualiza grid para mostrar status
        updateGrid();
        
        // ✅ Escreve no PLC para desabilitar calibração se estava em qualquer estado de calibração
        if (wasEnabled || wasButtonsEnabled || wasLocked) {
            console.log('[BALANCE] 📡 Escrevendo no PLC para desabilitar calibração');
            fetch('/api/write_word_bit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'XLCLASS_DB229_PESAGEM_COMANDO_STATUS',
                    bit: 8,
                    mode: 'state',
                    value: 0
                })
            }).catch(e => console.error('[BALANCE] Erro ao desabilitar calibração no PLC:', e));
        }
        
        // Para polling de leitura
        stopPolling();
        
        // Remove subscrição
        unsubscribeScreen();
        
        console.log('[BALANCE] ✅ Cleanup concluído - estado resetado');
    };

    // Alterna o estado da calibração (ativa/desativa)
    async function handleToggleCalibration() {
        // Previne múltiplos cliques simultâneos
        if (isToggling) {
            console.log('Toggle já em andamento, ignorando clique');
            return;
        }
        
        isToggling = true;
        console.log('Toggle calibração clicado. Estado atual:', calibrationEnabled);
        
        // ✅ Se está DESABILITANDO a calibração, reseta todo o estado
        if (calibrationEnabled) {
            console.log('[BALANCE] 🔄 Desabilitando calibração - resetando estado');
            resetCalibrationState();
            
            // Escreve no PLC em background
            setTimeout(async () => {
                try {
                    const tagName = 'XLCLASS_DB229_PESAGEM_COMANDO_STATUS';
                    console.log('[BALANCE] Escrevendo no PLC: Desabilitado');
                    
                    const writeRes = await fetch('/api/write_word_bit', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            name: tagName,
                            bit: 8,
                            mode: 'state',
                            value: 0
                        })
                    });
                    
                    const result = await writeRes.json();
                    
                    if (!writeRes.ok || !result.ok) {
                        throw new Error(result.error || 'Falha ao escrever no PLC');
                    }
                    
                    console.log('[BALANCE] ✅ Escrita no PLC concluída:', result);
                } catch(e) {
                    console.error('[BALANCE] ❌ Erro ao escrever no PLC:', e);
                } finally {
                    isToggling = false;
                }
            }, 100);
            return;
        }
        
        // ✅ Se está HABILITANDO a calibração
        calibrationEnabled = true;
        toggleBtn.textContent = 'Desabilitar Calibração';
        toggleBtn.classList.add('enabled');
        toggleBtn.classList.remove('disabled');
        
        // Atualiza grid imediatamente
        updateGrid();
        
        // Mostra loading baseado na tag do PLC
            try { 
                startCalibrationLoading(); 
            } catch (e) { 
                console.warn('Falha ao iniciar carregamento baseado no PLC:', e); 
        }
        
        // Escreve no PLC em background (não bloqueia a UI)
        setTimeout(async () => {
            try {
                const tagName = 'XLCLASS_DB229_PESAGEM_COMANDO_STATUS';
                
                console.log('[BALANCE] Escrevendo no PLC: Habilitado');
                
                const writeRes = await fetch('/api/write_word_bit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: tagName,
                        bit: 8,
                        mode: 'state',
                        value: 1
                    })
                });
                
                const result = await writeRes.json();
                
                if (!writeRes.ok || !result.ok) {
                    throw new Error(result.error || 'Falha ao escrever no PLC');
                }
                
                console.log('[BALANCE] ✅ Escrita no PLC concluída:', result);
            } catch(e) {
                console.error('[BALANCE] ❌ Erro ao escrever no PLC:', e);
            } finally {
                isToggling = false;
            }
        }, 100); // Pequeno delay para não bloquear a UI
    }

    // Evento ao clicar no botão "Calibrar"
    function handleCalibrateClick(e) {
        // Não bloqueia aqui - apenas abre o modal
        const datasetSource = e.currentTarget || e.target.closest('.calibrate-btn') || e.target;
        const lineNumber = parseInt(datasetSource.dataset.line, 10);
        const line = lines.find(l => l.number === lineNumber);
        if (line) {
            showWeightModal(line);
        }
    }

    // Quando usuário escolhe peso mínimo ou máximo
    function handleWeightSelection(weightType) {
        console.log(`[BALANCE] handleWeightSelection chamado: weightType=${weightType}, selectedLine=${selectedLine ? selectedLine.number : 'null'}`);
        if (!selectedLine) {
            console.warn('[BALANCE] selectedLine é null - ignorando handleWeightSelection');
            hideModals();
            return;
        }
        // Salva referência antes de fechar modais
        const lineRef = selectedLine;
        selectedWeightType = weightType;
        
        // Fecha apenas o modal de peso (não o de confirmação)
        if (weightModal) weightModal.style.display = 'none';
        
        // Abre modal de confirmação
        showConfirmationModal(weightType);
    }

    // Função para calcular a tag e bit corretos baseado na linha e tipo de peso
    function getCalibrationTagAndBit(lineNumber, weightType) {
        let tagName, bitIndex;
        
        if (lineNumber <= 16) {
            // Linhas 1-16: usa XLCLASS_DB229_CALIBRAR_PESO_MINIMO_01 e XLCLASS_DB229_CALIBRAR_PESO_MAXIMO_01
            tagName = weightType === 'min' ? 
                'XLCLASS_DB229_CALIBRAR_PESO_MINIMO_01' : 
                'XLCLASS_DB229_CALIBRAR_PESO_MAXIMO_01';
            
            // Mapeamento de bits: linha 1->bit8, linha 2->bit9, ..., linha 8->bit15, linha 9->bit0, ..., linha 16->bit7
            if (lineNumber <= 8) {
                bitIndex = lineNumber + 7; // 1->8, 2->9, ..., 8->15
            } else {
                bitIndex = lineNumber - 9; // 9->0, 10->1, ..., 16->7
            }
        } else {
            // Linhas 17-18: usa XLCLASS_DB229_CALIBRAR_PESO_MINIMO_02 e XLCLASS_DB229_CALIBRAR_PESO_MAXIMO_02
            tagName = weightType === 'min' ? 
                'XLCLASS_DB229_CALIBRAR_PESO_MINIMO_02' : 
                'XLCLASS_DB229_CALIBRAR_PESO_MAXIMO_02';
            
            // Linha 17->bit8, linha 18->bit9
            if (lineNumber === 17) {
                bitIndex = 8; // Linha 17 -> bit 8
            } else if (lineNumber === 18) {
                bitIndex = 9; // Linha 18 -> bit 9
            }
        }
        
        return { tagName, bitIndex };
    }

    // Função para escrever no PLC o comando de calibração
    // ✅ Usa API write_word_bit_queued com fila no backend para garantir serialização
    async function writeCalibrationCommand(lineNumber, weightType) {
        try {
            const { tagName, bitIndex } = getCalibrationTagAndBit(lineNumber, weightType);
            
            console.log(`[BALANCE] 🔒 Iniciando calibração: ${weightType === 'min' ? 'peso mínimo' : 'peso máximo'} da linha ${lineNumber}`);
            console.log(`[BALANCE] Tag: ${tagName}, Bit: ${bitIndex}`);
            console.log(`[BALANCE] 📡 Enviando requisição para /api/write_word_bit...`);
            
            // ✅ Usa API atômica write_word_bit com lock no backend
            const writeRes = await fetch('/api/write_word_bit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: tagName,
                    bit: bitIndex,
                    mode: 'state',
                    value: 1  // Seta o bit para 1
                })
            });
            
            console.log(`[BALANCE] 📡 Status da resposta: ${writeRes.status} ${writeRes.statusText}`);
            
            const result = await writeRes.json();
            console.log(`[BALANCE] 📡 Corpo da resposta:`, result);
            
            if (!writeRes.ok || !result.ok) {
                console.error(`[BALANCE] ❌ Erro na resposta: writeRes.ok=${writeRes.ok}, result.ok=${result.ok}`);
                throw new Error(result.error || 'Falha ao escrever no PLC');
            }
            
            console.log(`[BALANCE] ✅ Comando de calibração enviado com sucesso para linha ${lineNumber}`);
            console.log(`[BALANCE] Bit ${bitIndex} da tag ${tagName} setado para 1 (valor escrito: 0x${result.written?.toString(16).toUpperCase() || '?'})`);
            
            // ✅ Aguarda mais um pouco após a escrita para garantir que o PLC processou
            await new Promise(resolve => setTimeout(resolve, 500));
            
            return true;
            
        } catch (error) {
            console.error(`[BALANCE] ❌ Erro ao enviar comando de calibração para linha ${lineNumber}:`, error);
            console.error(`[BALANCE] ❌ Tipo do erro:`, error.constructor.name);
            console.error(`[BALANCE] ❌ Mensagem:`, error.message);
            return false;
        }
    }

    // ✅ Função para mostrar toast de feedback (SIMPLES E ROBUSTA)
    let toastTimeoutId = null;
    
    function showBalanceToast(message, duration = 2000) {
        // Cancela timeout anterior
        if (toastTimeoutId) {
            clearTimeout(toastTimeoutId);
            toastTimeoutId = null;
        }
        
        // Remove toast anterior se existir
        const existingToast = document.getElementById('balance-toast');
        if (existingToast) {
            existingToast.remove();
        }
        
        // Cria novo toast
        const toast = document.createElement('div');
        toast.id = 'balance-toast';
        toast.style.cssText = `
            position: fixed;
            top: 20%;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 15px 25px;
            border-radius: 8px;
            font-size: 18px;
            font-weight: bold;
            z-index: 10000;
            text-align: center;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        // Remove após o tempo especificado
        toastTimeoutId = setTimeout(() => {
            const t = document.getElementById('balance-toast');
            if (t) t.remove();
            toastTimeoutId = null;
        }, duration);
    }
    
    // ✅ Função para remover toast imediatamente
    function hideBalanceToast() {
        if (toastTimeoutId) {
            clearTimeout(toastTimeoutId);
            toastTimeoutId = null;
        }
        const t = document.getElementById('balance-toast');
        if (t) t.remove();
    }
    

    // Confirma a calibração da linha selecionada
    async function handleConfirmCalibration() {
        if (!selectedLine || !selectedWeightType) {
            return;
        }
        
        const lineNumber = selectedLine.number;
        const weightType = selectedWeightType;
        
        // ✅ Verifica se está bloqueado (escrita em andamento ou cooldown)
        if (isCalibrationBusy()) {
            console.log(`[BALANCE] ⏸️ Linha ${lineNumber} bloqueada`);
            // Mostra popup de espera apenas se não foi mostrado recentemente (evita spam)
            if (canShowWaitPopup()) {
                showBalanceToast('⏳ Aguarde alguns segundos e tente novamente', 3000);
            }
            return;
        }
        
        console.log(`[BALANCE] 🎯 Linha ${lineNumber} ${weightType} - Processando calibração`);
        
        // ✅ BLOQUEIA IMEDIATAMENTE (antes de qualquer operação async)
        startCalibrationBlock();
        
        // Fecha modais
        hideModals();
        
        // Limpa seleções
        selectedLine = null;
        selectedWeightType = null;
        
        // ✅ Executa calibração
        try {
            const success = await writeCalibrationCommand(lineNumber, weightType);
            
            if (success) {
                // Atualiza estado local
                const index = lines.findIndex(l => l.number === lineNumber);
                if (index !== -1) {
                    lines[index].calibrated = true;
                }
                console.log(`✅ Calibração de peso ${weightType === 'min' ? 'mínimo' : 'máximo'} da linha ${lineNumber} enviada com sucesso!`);
                // Não mostra popup de sucesso conforme solicitado
            } else {
                console.error(`❌ Erro ao enviar comando de calibração para linha ${lineNumber}`);
                showBalanceToast('❌ Erro ao enviar comando.\nTente novamente.', 3000);
            }
        } catch (error) {
            console.error(`[BALANCE] ❌ Erro crítico na linha ${lineNumber}:`, error);
            showBalanceToast('❌ Erro ao processar calibração.\nTente novamente.', 3000);
        } finally {
            // ✅ LIBERA BLOQUEIO (com cooldown)
            endCalibrationBlock();
        }
        
        updateGrid();
        console.log(`[BALANCE] ✅ Linha ${lineNumber} ${weightType}: Processamento concluído`);
    }

    // Event Listeners
    toggleBtn.addEventListener('click', handleToggleCalibration);

    document.getElementById('min-weight-btn')
        .addEventListener('click', (e) => {
            e.stopPropagation();
            handleWeightSelection('min');
        });

    document.getElementById('max-weight-btn')
        .addEventListener('click', (e) => {
            e.stopPropagation();
            handleWeightSelection('max');
        });

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
        if (!loadingModal) return; // Proteção contra null
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

    // Função para iniciar carregamento baseado na tag do PLC
    function startCalibrationLoading() {
        console.log('Iniciando monitoramento da tag do PLC (popup só aparece quando status >= 1 && <= 9)...');
        
        // ✅ NÃO mostra o popup imediatamente - só quando a tag estiver entre 1 e 9
        // Apenas inicia o polling da tag de status
        startCalibrationStatusPolling();
    }
    
    // Função auxiliar para preparar o popup de loading (chamada quando status entra no intervalo 1-9)
    function prepareLoadingPopup() {
            const progressLeft = document.getElementById('loading-progress-left');
            const progressRight = document.getElementById('loading-progress-right');
            const progressText = document.getElementById('loading-progress-text');
            const progressBar = document.querySelector('.progress-bar');
            
            if (progressLeft && progressRight) {
                progressLeft.style.width = '0%';
                progressRight.style.width = '0%';
            }
            
            if (progressText) {
                progressText.textContent = '0%';
            }
            
            if (progressBar) {
                progressBar.style.opacity = '1';
                progressBar.style.visibility = 'visible';
                progressBar.style.display = 'block';
            }
    }

    // Função para monitorar status da calibração via PLC
    function startCalibrationStatusPolling() {
        const CALIBRATION_STATUS_TAG = 'XLCLASS_DB229_PESAGEM_STATUS_PASSO_CALIBRACAO';
        
        // Limpa intervalo anterior se existir
        if (calibrationPollingInterval) {
            clearInterval(calibrationPollingInterval);
            calibrationPollingInterval = null;
        }
        
        const pollCalibrationStatus = async () => {
            if (calibrationPollInFlight) return;
            calibrationPollInFlight = true;
            try {
                const res = await fetch(`/api/read_tags?names=${encodeURIComponent(CALIBRATION_STATUS_TAG)}`, { cache: 'no-store' }).then(r=>r.json());
                if (!res || !res.values) {
                    console.warn('Falha ao ler status da calibração');
                    return;
                }
                
                const statusValue = Number(res.values[CALIBRATION_STATUS_TAG] || 0);
                console.log('Status da calibração:', statusValue);
                
                // Verifica se está no intervalo válido (1-9) - mostra popup apenas nesse intervalo
                if (statusValue >= 1 && statusValue <= 9) {
                    // ✅ Só mostra o popup quando o valor entra no intervalo 1-9
                    if (loadingModal.style.display !== 'flex') {
                        console.log('[BALANCE] Status entrou no intervalo 1-9 - mostrando popup de carregamento');
                        prepareLoadingPopup();
                        toggleLoadingModal(true);
                    }
                    
                    // Atualiza progresso baseado no valor (0-10, onde 1-9 são os passos)
                    updateProgress(statusValue); // updateProgress já calcula porcentagem corretamente (value/10*100)
                    const percentage = Math.round((statusValue / 10) * 100);
                    console.log(`Calibração em andamento: passo ${statusValue} (${percentage}%)`);
                    
                    // Desabilita botões durante o processo
                    if (calibrationButtonsEnabled) {
                        calibrationButtonsEnabled = false;
                        updateGrid();
                    }
                } else if (statusValue >= 10) {
                    // Calibração finalizada (valor >= 10) - fecha popup e habilita botões
                    console.log('Calibração finalizada (status >= 10) - fechando popup e habilitando botões');
                    calibrationButtonsEnabled = true;
                    calibrationButtonsLocked = true; // ✅ NOVO: Trava os botões visíveis
                    console.log('[BALANCE] 🔒 Botões de calibração TRAVADOS (só desbloqueia com ação do usuário)');
                    updateGrid();
                    
                    // Fecha o popup imediatamente
                    clearInterval(calibrationPollingInterval);
                    calibrationPollingInterval = null;
                    toggleLoadingModal(false);
                } else {
                    // ✅ Valor 0 ou inválido
                    if (calibrationButtonsLocked) {
                        // Botões travados - para polling e fecha popup
                        console.log('Status = 0 mas botões TRAVADOS - mantendo botões de calibração visíveis');
                        clearInterval(calibrationPollingInterval);
                        calibrationPollingInterval = null;
                        toggleLoadingModal(false);
                    } else if (calibrationEnabled) {
                        // ✅ NOVO: Calibração habilitada mas valor ainda 0 - CONTINUA aguardando
                        // NÃO para o polling - espera o PLC mudar o valor para 1-9
                        console.log('[BALANCE] Status = 0, aguardando PLC mudar para intervalo 1-9...');
                        // Mantém polling ativo, não faz nada
                    } else {
                        // Calibração não habilitada - para polling
                        console.log('Calibração não habilitada (status = 0) - parando polling');
                    clearInterval(calibrationPollingInterval);
                    calibrationPollingInterval = null;
                    toggleLoadingModal(false);
                    }
                }
            } catch (error) {
                console.error('Erro ao ler status da calibração:', error);
                clearInterval(calibrationPollingInterval);
                setTimeout(() => {
                    toggleLoadingModal(false);
                }, 500);
            } finally {
                calibrationPollInFlight = false;
            }
        };
        
        // Inicia polling a cada 200ms para leitura mais rápida
        calibrationPollingInterval = setInterval(pollCalibrationStatus, 200);
        
        // Primeira leitura imediata
        pollCalibrationStatus();
    }

    // Cache para evitar piscar (desabilitado temporariamente para debug)
    let lastStatusValues = { pendente01: null, pendente02: null };
    
    // Função para atualizar ícones de status das linhas
    function updateStatusIcons(pendente01, pendente02) {
        console.log('Atualizando ícones com valores:', { pendente01, pendente02 });
        
        // Atualiza ícones para cada linha (usa quantidade configurada)
        for (let lineNum = 1; lineNum <= lineQuantity; lineNum++) {
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
        if (refreshInFlight) return;
        refreshInFlight = true;
        try {
            // Não atualiza se estiver fazendo toggle manual
            if (isToggling) {
                return;
            }
            // Lê tags principais e de status em uma única chamada
            const SPEED_TAG = 'XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_REAL';
            const CMD_TAG = 'XLCLASS_DB229_PESAGEM_COMANDO_STATUS';
            const PENDENTE_01 = 'XLCLASS_DB229_PESAGEM_CAL_PENDENTE_01';
            const PENDENTE_02 = 'XLCLASS_DB229_PESAGEM_CAL_PENDENTE_02';
            // Tags de peso instantâneo (usa quantidade configurada)
            const instantTags = Array.from({ length: lineQuantity }, (_, i) => `XLCLASS_DB229_PESAGEM_INSTANTANEO[${i}]`);
            const CALIBRATION_STATUS_TAG = 'XLCLASS_DB229_PESAGEM_STATUS_PASSO_CALIBRACAO';
            const names = `${SPEED_TAG},${CMD_TAG},${PENDENTE_01},${PENDENTE_02},${CALIBRATION_STATUS_TAG},${instantTags.join(',')}`;
            const res = await fetch(`/api/read_tags?names=${encodeURIComponent(names)}`, { cache: 'no-store' }).then(r=>r.json());
            if (!res || !res.ok || !res.values) throw new Error('bad');
            
            const vReal = Number(res.values[SPEED_TAG] || 0);
            const cmd = Number(res.values[CMD_TAG] || 0) >>> 0;
            const bit8 = ((cmd >> 8) & 1) === 1;
            const pendente01 = Number(res.values[PENDENTE_01] || 0) >>> 0;
            const pendente02 = Number(res.values[PENDENTE_02] || 0) >>> 0;
            const calibrationStatus = Number(res.values[CALIBRATION_STATUS_TAG] || 0);

            // Atualiza pesos das linhas a partir das tags instantâneas
            let validValuesCount = 0;
            for (let i = 0; i < lineQuantity; i++) {
                const tag = `XLCLASS_DB229_PESAGEM_INSTANTANEO[${i}]`;
                const hasTag = res.values && Object.prototype.hasOwnProperty.call(res.values, tag);
                if (!hasTag) {
                    continue; // não sobrescreve peso com 0 quando não há dado
                }
                const raw = res.values[tag];
                const val = Number(raw);
                if (Number.isFinite(val)) {
                    lines[i].weight = val;
                    validValuesCount++;
                }
            }
            
            // Só marca como conectado se conseguiu ler pelo menos algumas tags válidas
            const wasConnected = plcConnected;
            plcConnected = validValuesCount > 0;
            
            // Log de mudança de estado
            if (wasConnected !== plcConnected) {
                console.log(`Status de conexão mudou: ${wasConnected ? 'conectado' : 'desconectado'} -> ${plcConnected ? 'conectado' : 'desconectado'} (${validValuesCount} valores válidos)`);
            }
            
            // Atualiza UI dos pesos
            updateWeightSpans();

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
            
            // ✅ AJUSTADO: Só atualiza botões se NÃO estiverem travados pelo usuário
            if (!calibrationButtonsLocked) {
            // Controla botões de calibração baseado no status do PLC
            const newButtonsEnabled = calibrationStatus > 9;
            if (newButtonsEnabled !== calibrationButtonsEnabled) {
                calibrationButtonsEnabled = newButtonsEnabled;
                console.log(`Botões de calibração ${calibrationButtonsEnabled ? 'habilitados' : 'desabilitados'} (status: ${calibrationStatus})`);
                updateGrid();
                }
            } else {
                // Botões travados - ignora mudanças da tag do PLC
                console.log(`[BALANCE] Botões TRAVADOS - ignorando mudança de status do PLC (status: ${calibrationStatus})`);
            }
            
            // Atualiza ícones apenas se botões de calibração desativados
            if (!calibrationButtonsEnabled) {
                updateStatusIcons(pendente01, pendente02);
            }
            
        } catch(e) {
            console.error('Erro na leitura do PLC:', e);
            // Marca como desconectado em caso de erro
            plcConnected = false;
            updateWeightSpans(); // Atualiza para mostrar ###
            
            // Em falha, oculta visualmente mantendo o espaço
            if (toggleBtn) toggleBtn.style.visibility = 'hidden';
        } finally {
            refreshInFlight = false;
        }
    }

    // ========== Subscrição por tela (ativa drivers só quando a tela está aberta) ==========
    const clientId = `balance-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    let heartbeatTimer = null;
    let heartbeatInFlight = false;

    function buildSubscribedTags() {
        const tags = [];
        // Tags de peso instantâneo (usa quantidade configurada)
        for (let i = 0; i < lineQuantity; i++) {
            tags.push(`XLCLASS_DB229_PESAGEM_INSTANTANEO[${i}]`);
        }
        // Tags de comando e status
        tags.push('XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_REAL');
        tags.push('XLCLASS_DB229_PESAGEM_COMANDO_STATUS');
        tags.push('XLCLASS_DB229_PESAGEM_CAL_PENDENTE_01');
        tags.push('XLCLASS_DB229_PESAGEM_CAL_PENDENTE_02');
        tags.push('XLCLASS_DB229_PESAGEM_STATUS_PASSO_CALIBRACAO');
        return tags;
    }

    async function subscribeScreen() {
        try {
            const res = await fetch('/api/subscribe_tags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    client_id: clientId, 
                    tags: buildSubscribedTags(), 
                    screen_name: 'tela_pesagem' 
                })
            });
            await res.json().catch(() => ({}));
            startHeartbeat();
            console.log('✅ Subscrição de tags ativada para tela de balança');
        } catch (error) {
            console.error('❌ Erro ao ativar subscrição de tags:', error);
        }
    }

    async function unsubscribeScreen() {
        try {
            stopHeartbeat();
            await fetch('/api/unsubscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_id: clientId })
            });
            console.log('✅ Subscrição de tags desativada para tela de balança');
        } catch (error) {
            console.error('❌ Erro ao desativar subscrição de tags:', error);
        }
    }

    async function heartbeatScreen() {
        if (heartbeatInFlight) return;
        heartbeatInFlight = true;
        try {
            await fetch('/api/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_id: clientId })
            });
        } catch (error) {
            console.error('❌ Erro no heartbeat:', error);
        } finally {
            heartbeatInFlight = false;
        }
    }

    function startHeartbeat() {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(heartbeatScreen, 15000); // 15 segundos
    }

    function stopHeartbeat() {
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
    }

    // ========== Integração com PLC ==========
    async function connectToPLC() {
        // Primeira leitura imediata
        refreshFromPLC();
        
        // Inicia polling
        startPolling();
        
        // Inicia subscrição
        subscribeScreen();
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
    plcConnected = false; // Inicia como desconectado
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

    // ========== Controle de Visibilidade da Aba ==========
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // Aba oculta: para polling e desativa subscrição
            stopPolling();
            unsubscribeScreen();
            
            // ✅ NOVO: Reseta estado de calibração quando sai da tela
            if (calibrationEnabled || calibrationButtonsLocked) {
                console.log('[BALANCE] 🔄 Tela oculta - resetando estado de calibração');
                resetCalibrationState();
                
                // Escreve no PLC para desabilitar calibração
                fetch('/api/write_word_bit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: 'XLCLASS_DB229_PESAGEM_COMANDO_STATUS',
                        bit: 8,
                        mode: 'state',
                        value: 0
                    })
                }).catch(e => console.error('[BALANCE] Erro ao desabilitar calibração no PLC:', e));
            }
        } else {
            // Aba visível: reinicia polling e ativa subscrição
            startPolling();
            subscribeScreen();
        }
    });
    
    // ✅ Listener para mudanças no tipo de máquina (storage event)
    window.addEventListener('storage', (e) => {
        if (e.key === 'supervisor_machine_type') {
            console.log('[BALANCE] Tipo de máquina mudou no localStorage:', e.newValue);
            // Recarrega a página para aplicar a nova quantidade de linhas
            location.reload();
        }
    });
}

// Torna a função disponível globalmente para ser chamada depois do DOM carregar
window.inicializarBalance = inicializarBalance;
