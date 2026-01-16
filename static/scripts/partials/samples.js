// Função para inicializar a tela de amostras
function inicializarSamples() {
    console.log('Inicializando Samples...');
    
    // Estado da aplicação
    const state = {
        lines: Array.from({ length: 18 }, (_, i) => ({
            lineNum: i + 1,
            cells: Array.from({ length: 10 }, () => ({ value: null, color: 'empty' }))
        })),
        pollingInterval: null,
        socket: null,
        isActive: true,
        firstUpdate: true // Flag para primeira atualização
    };
    
    // Função para determinar a cor baseada no valor
    function getColorForValue(value) {
        if (value === null || value === undefined || isNaN(value)) {
            return 'empty';
        }
        
        // Lógica de cores baseada em faixas de peso (ajustar conforme necessário)
        // Baseado na imagem, parece haver diferentes cores para diferentes valores
        // Vou usar uma lógica simples baseada em faixas
        if (value >= 60 && value < 70) {
            return 'green';
        } else if (value >= 50 && value < 60) {
            return 'blue';
        } else if (value >= 40 && value < 50) {
            return 'yellow';
        } else if (value > 0 && value < 40) {
            return 'gray';
        } else if (value >= 70) {
            return 'white';
        } else {
            return 'empty';
        }
    }
    
    // Função para renderizar a grade
    function renderGrid() {
        const grid = document.getElementById('samples-grid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        state.lines.forEach((line, lineIdx) => {
            const row = document.createElement('div');
            row.className = 'samples-row';
            
            // Label da linha
            const label = document.createElement('div');
            label.className = 'samples-row-label';
            label.textContent = `L${String(line.lineNum).padStart(2, '0')}`;
            row.appendChild(label);
            
            // Container das células
            const cellsContainer = document.createElement('div');
            cellsContainer.className = 'samples-row-cells';
            
            line.cells.forEach((cell, cellIdx) => {
                const cellEl = document.createElement('div');
                cellEl.className = `samples-cell ${cell.color}`;
                cellEl.dataset.line = line.lineNum;
                cellEl.dataset.index = cellIdx;
                
                if (cell.value !== null) {
                    cellEl.textContent = `${Math.round(cell.value)}g`;
                } else {
                    cellEl.textContent = '';
                }
                
                cellsContainer.appendChild(cellEl);
            });
            
            row.appendChild(cellsContainer);
            grid.appendChild(row);
        });
    }
    
    // Função para atualizar células com animação
    function updateCells() {
        state.lines.forEach((line, lineIdx) => {
            line.cells.forEach((cell, cellIdx) => {
                const cellEl = document.querySelector(
                    `.samples-cell[data-line="${line.lineNum}"][data-index="${cellIdx}"]`
                );
                
                if (cellEl) {
                    // Remove classes antigas
                    cellEl.className = 'samples-cell';
                    cellEl.classList.add(cell.color);
                    
                    // Atualiza valor
                    if (cell.value !== null) {
                        cellEl.textContent = `${Math.round(cell.value)}g`;
                        cellEl.classList.add('has-value');
                        
                        // Remove animação após um tempo
                        setTimeout(() => {
                            cellEl.classList.remove('has-value');
                        }, 300);
                    } else {
                        cellEl.textContent = '';
                    }
                }
            });
        });
    }
    
    // Função para processar dados recebidos (via Socket.IO ou HTTP)
    function processDataFromPLC(data) {
        if (!state.isActive) {
            return;
        }
        
        // Verifica se o container está visível
        const container = document.getElementById('samples-container');
        if (!container || container.style.display === 'none') {
            return;
        }
        
        if (!data || typeof data !== 'object') {
            return;
        }
        
        // Atualiza os valores nas células
        let hasChanges = false;
        
        for (let lineNum = 1; lineNum <= 18; lineNum++) {
            const lineIdx = lineNum - 1;
            const line = state.lines[lineIdx];
            
            for (let idx = 0; idx < 10; idx++) {
                const tag = `XLCLASS_DB209_VISIB_PESO_OVO_L${String(lineNum).padStart(2, '0')}[${idx}]`;
                const rawValue = data[tag];
                
                let value = null;
                if (rawValue !== undefined && rawValue !== null) {
                    const numValue = Number(rawValue);
                    if (!isNaN(numValue)) {
                        value = numValue;
                    }
                }
                
                const cell = line.cells[idx];
                const oldValue = cell.value;
                const oldColor = cell.color;
                
                cell.value = value;
                cell.color = getColorForValue(value);
                
                // Verifica se houve mudança (compreensão de diferenças de ponto flutuante)
                const valueChanged = oldValue !== value && 
                    !(oldValue !== null && value !== null && Math.abs(oldValue - value) < 0.01);
                const colorChanged = oldColor !== cell.color;
                
                if (valueChanged || colorChanged) {
                    hasChanges = true;
                }
            }
        }
        
        // Atualiza a interface se houver mudanças ou se for a primeira atualização
        if (hasChanges || state.firstUpdate) {
            if (state.firstUpdate) {
                console.log('[SAMPLES] Primeira atualização, renderizando valores...');
                state.firstUpdate = false;
            }
            updateCells();
        }
    }
    
    // Função para ler dados do PLC via HTTP (fallback)
    async function refreshFromPLC() {
        if (!state.isActive) {
            return;
        }
        
        // Verifica se o container está visível
        const container = document.getElementById('samples-container');
        if (!container || container.style.display === 'none') {
            return;
        }
        
        try {
            // Gera lista de todas as tags (18 linhas x 10 índices = 180 tags)
            const tags = [];
            for (let lineNum = 1; lineNum <= 18; lineNum++) {
                for (let idx = 0; idx < 10; idx++) {
                    tags.push(`XLCLASS_DB209_VISIB_PESO_OVO_L${String(lineNum).padStart(2, '0')}[${idx}]`);
                }
            }
            
            const names = tags.join(',');
            const res = await fetch(`/api/read_tags?names=${encodeURIComponent(names)}`, { 
                cache: 'no-store' 
            }).then(r => r.json());
            
            if (!res || !res.ok || !res.values) {
                console.warn('[SAMPLES] Resposta inválida do servidor:', res);
                return;
            }
            
            processDataFromPLC(res.values);
            
        } catch (error) {
            console.error('[SAMPLES] Erro ao ler dados do PLC:', error);
        }
    }
    
    // Função para inicializar Socket.IO (atualizações em tempo real)
    function initSocketIO() {
        try {
            if (typeof io === 'undefined') {
                console.warn('[SAMPLES] Socket.IO não disponível, usando polling HTTP');
                startPolling();
                return;
            }
            
            // Reutiliza socket global se disponível
            state.socket = window.supervisorSocket || (
                window.supervisorSocket = io({
                    reconnection: true,
                    reconnectionAttempts: Infinity,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    timeout: 20000,
                    forceNew: false,
                    transports: ['polling', 'websocket'],
                    upgrade: true,
                    rememberUpgrade: false
                })
            );
            
            // Remove listeners antigos se houver para evitar duplicação
            state.socket.off('telemetry');
            
            // Escuta evento telemetry para atualização em tempo real
            state.socket.on('telemetry', (data) => {
                if (!data) return;
                processDataFromPLC(data);
            });
            
            console.log('[SAMPLES] ✅ Socket.IO configurado para atualizações em tempo real');
            
            // Faz primeira leitura via HTTP para garantir dados iniciais
            setTimeout(() => {
                refreshFromPLC();
            }, 100);
            
        } catch (error) {
            console.error('[SAMPLES] Erro ao inicializar Socket.IO:', error);
            // Fallback para polling HTTP
            startPolling();
        }
    }
    
    // Função para iniciar polling HTTP (fallback)
    function startPolling() {
        // Limpa qualquer intervalo anterior
        if (state.pollingInterval) {
            clearInterval(state.pollingInterval);
            state.pollingInterval = null;
        }
        
        // Garante que o estado está ativo
        state.isActive = true;
        
        // ✅ CORRIGIDO: Polling a cada 2 segundos (era 200ms) - reduz uso de CPU/memória
        state.pollingInterval = setInterval(() => {
            refreshFromPLC();
        }, 2000);
        console.log('[SAMPLES] Polling HTTP iniciado (2000ms)');
        
        // Primeira leitura imediata
        setTimeout(() => {
            refreshFromPLC();
        }, 100);
    }
    
    // Função para parar polling
    function stopPolling() {
        if (state.pollingInterval) {
            clearInterval(state.pollingInterval);
            state.pollingInterval = null;
            console.log('[SAMPLES] Polling parado');
        }
    }
    
    // Função para desconectar Socket.IO
    function disconnectSocket() {
        if (state.socket) {
            state.socket.off('telemetry');
            // Não desconecta o socket global, apenas remove os listeners
            state.socket = null;
            console.log('[SAMPLES] Socket.IO desconectado');
        }
    }
    
    // Inicialização
    console.log('[SAMPLES] Renderizando grade inicial...');
    renderGrid();
    console.log('[SAMPLES] Grade renderizada, inicializando Socket.IO...');
    initSocketIO();
    
    // Cleanup function
    window.cleanupSamples = function() {
        console.log('[SAMPLES] Fazendo cleanup...');
        state.isActive = false;
        stopPolling();
        disconnectSocket();
        // Limpa referência do intervalo
        if (state.pollingInterval) {
            clearInterval(state.pollingInterval);
            state.pollingInterval = null;
        }
    };
    
    // Retorna referência para permitir controle externo
    return {
        startPolling,
        stopPolling,
        refreshFromPLC
    };
}

// Exporta para escopo global
window.inicializarSamples = inicializarSamples;

