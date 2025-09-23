let draggedButton = null;
// timestamp global do último valor válido recebido (socket ou HTTP)
let SPEED_LAST_OK_TS = 0;
let SPEED_WAS_OFFLINE = false;
let ENSURE_MACHINE_LAST_TS = 0;

// Controle de estado para evitar condição de corrida na velocidade programada
let USER_TYPING_VELOCITY = false;
let VELOCITY_WRITE_TIMESTAMP = 0;

// Nome da tag de velocidade
const SPEED_TAG_PRIMARY = 'XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_REAL';
const SPEED_TAG_PROGRAMMED = 'XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG';
const SPEED_TAGS = [SPEED_TAG_PRIMARY, SPEED_TAG_PROGRAMMED];

// Limite de velocidade por máquina (padrão 400)
let SPEED_MAX = 400;
const SPEED_MAX_BY_MACHINE = { '200CX': 200, '400CX': 400, '700CX': 700 };
async function syncSpeedMaxFromServer(){
    try {
        const f = await fetch('/api/features', {cache:'no-store'}).then(r=>r.json()).catch(()=>null);
        const machine = f && f.machine ? f.machine : null;
        if (machine && SPEED_MAX_BY_MACHINE[machine]){
            SPEED_MAX = SPEED_MAX_BY_MACHINE[machine];
        } else {
            SPEED_MAX = 400;
        }
    } catch(_) { SPEED_MAX = 400; }
}

async function ensureMachineSelected(){
    try{
        const now = Date.now();
        if(now - ENSURE_MACHINE_LAST_TS < 1500){ return; }
        ENSURE_MACHINE_LAST_TS = now;
        // Não forçar reconexão automática após a primeira inicialização do supervisório
        const wasInitialized = (localStorage.getItem('supervisor_machine_initialized') === '1');
        if (wasInitialized) { return; }
        const f = await fetch('/api/features', {cache:'no-store'}).then(r=>r.json()).catch(()=>null);
        if(f && f.machine){ return; }
        const name = localStorage.getItem('supervisor_machine');
        if(!name){ return; }
        await fetch('/api/set_machine', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({name})});
    }catch(_){ /* ignore */ }
}

// Funções de arrastar e soltar

// Sistema de persistência de posições do grid
const GRID_POSITIONS_KEY = 'supervisor_grid_positions';

// Função para salvar posições atuais do grid
function saveGridPositions() {
    try {
        const positions = {};
        const buttons = document.querySelectorAll('.draggable-btn');
        
        console.log('🔍 Tentando salvar posições. Botões encontrados:', buttons.length);
        
        if (buttons.length === 0) {
            console.warn('⚠️ Nenhum botão draggable encontrado para salvar posições');
            return;
        }
        
        buttons.forEach((button, index) => {
            const station = button.getAttribute('data-station');
            if (station) {
                positions[station] = index;
                console.log(`📍 ${station}: posição ${index}`);
            }
        });
        
        const positionsJson = JSON.stringify(positions);
        console.log('📦 JSON a ser salvo:', positionsJson);
        
        // Salva no localStorage (funciona mesmo sem servidor)
        localStorage.setItem(GRID_POSITIONS_KEY, positionsJson);
        console.log('✅ Posições salvas no localStorage');
        
        // Também salva no sessionStorage como backup
        sessionStorage.setItem(GRID_POSITIONS_KEY, positionsJson);
        console.log('✅ Posições salvas no sessionStorage');
        
        // Verifica se foi salvo corretamente
        const saved = localStorage.getItem(GRID_POSITIONS_KEY);
        if (saved === positionsJson) {
            console.log('✅ Verificação: posições salvas corretamente');
        } else {
            console.error('❌ Verificação falhou: posições não foram salvas corretamente');
        }
        
    } catch (error) {
        console.error('❌ Erro ao salvar posições do grid:', error);
    }
}

// Função para carregar posições salvas do grid
function loadGridPositions() {
    try {
        // Tenta primeiro o localStorage
        let saved = localStorage.getItem(GRID_POSITIONS_KEY);
        
        // Se não encontrar no localStorage, tenta o sessionStorage como fallback
        if (!saved) {
            saved = sessionStorage.getItem(GRID_POSITIONS_KEY);
            if (saved) {
                console.log('📂 Posições carregadas do sessionStorage (fallback)');
            }
        }
        
        if (saved) {
            const positions = JSON.parse(saved);
            console.log('📂 Posições do grid carregadas:', positions);
            return positions;
        }
    } catch (error) {
        console.error('❌ Erro ao carregar posições do grid:', error);
    }
    return null;
}

// Função para restaurar posições do grid
function restoreGridPositions() {
    const positions = loadGridPositions();
    if (!positions) {
        console.log('📋 Nenhuma posição salva encontrada, usando layout padrão');
        return false;
    }

    const container = document.querySelector('.draggable-btn')?.parentNode;
    if (!container) {
        console.warn('⚠️ Container do grid não encontrado');
        return false;
    }

    // Cria um array com os botões na ordem correta
    const buttons = Array.from(container.querySelectorAll('.draggable-btn'));
    if (buttons.length === 0) {
        console.warn('⚠️ Nenhum botão draggable encontrado no container');
        return false;
    }

    const reorderedButtons = new Array(buttons.length);
    
    // Mapeia as posições salvas
    Object.entries(positions).forEach(([station, index]) => {
        const button = buttons.find(btn => btn.getAttribute('data-station') === station);
        if (button && index >= 0 && index < reorderedButtons.length) {
            reorderedButtons[index] = button;
        }
    });

    // Remove todos os botões do container
    buttons.forEach(button => {
        container.removeChild(button);
    });

    // Adiciona os botões na ordem correta
    reorderedButtons.forEach((button) => {
        if (button) {
            container.appendChild(button);
        }
    });

    // Adiciona botões que não foram mapeados no final
    buttons.forEach(button => {
        if (!reorderedButtons.includes(button)) {
            container.appendChild(button);
        }
    });

    console.log('✅ Posições do grid restauradas com sucesso');
    return true;
}

// Função para resetar posições para o padrão
function resetGridPositions() {
    try {
        console.log('🔄 Iniciando reset das posições...');
        
        // Remove as posições salvas
        localStorage.removeItem(GRID_POSITIONS_KEY);
        sessionStorage.removeItem(GRID_POSITIONS_KEY);
        console.log('✅ Posições removidas do localStorage e sessionStorage');
        
        // Verifica se foi removido corretamente
        const saved = localStorage.getItem(GRID_POSITIONS_KEY);
        if (saved === null) {
            console.log('✅ Verificação: posições removidas com sucesso');
        } else {
            console.error('❌ Verificação falhou: posições ainda existem');
        }
        
        // Aplica o layout padrão de forma mais segura
        console.log('🔄 Aplicando layout padrão...');
        
        // Primeiro, tenta aplicar o layout sem remover os botões
        const layoutResult = applyDefaultLayoutSafe();
        
        if (layoutResult) {
            console.log('✅ Layout padrão aplicado com sucesso (método seguro)');
            // Salva as novas posições após aplicar o layout padrão
            setTimeout(() => {
                saveGridPositions();
                console.log('✅ Novas posições salvas');
            }, 100);
        } else {
            console.log('⚠️ Método seguro falhou, tentando método completo...');
            // Se o método seguro falhar, usa o método original
            const fullLayoutResult = applyDefaultLayout();
            if (fullLayoutResult) {
                console.log('✅ Layout padrão aplicado com método completo');
                setTimeout(() => {
                    saveGridPositions();
                    console.log('✅ Novas posições salvas');
                }, 100);
            } else {
                console.error('❌ Falha ao aplicar layout padrão');
            }
        }
        
    } catch (error) {
        console.error('❌ Erro ao resetar posições do grid:', error);
    }
}

// Função para aplicar o layout padrão de forma segura (sem remover botões)
function applyDefaultLayoutSafe() {
    try {
        console.log('🔄 Aplicando layout padrão (método seguro)...');
        
        // Tenta encontrar o container do grid
        let container = document.querySelector('#grid-container');
        if (!container) {
            container = document.querySelector('.draggable-btn')?.parentNode;
        }
        if (!container) {
            console.warn('⚠️ Container do grid não encontrado');
            return false;
        }
        
        const buttons = Array.from(container.querySelectorAll('.draggable-btn'));
        if (buttons.length === 0) {
            console.warn('⚠️ Nenhum botão draggable encontrado no container');
            return false;
        }

        // Define a ordem padrão baseada nos data-station
        const defaultOrder = [
            'velocidade-real',
            'velocidade-prog', 
            'alarmes',
            'plasson-farm',
            'acumuladora',
            'dosificadora',
            'botao-7',
            'botao-8',
            'botao-9',
            'botao-10',
            'botao-11',
            'botao-12'
        ];

        console.log('📋 Aplicando ordem padrão (método seguro):', defaultOrder);

        // Cria um array com os botões na ordem correta
        const reorderedButtons = [];
        
        // Mapeia as posições na ordem padrão
        defaultOrder.forEach((stationId) => {
            const button = buttons.find(btn => btn.getAttribute('data-station') === stationId);
            if (button) {
                reorderedButtons.push(button);
            }
        });
        
        // Adiciona botões que não estão na lista padrão no final
        buttons.forEach(button => {
            const station = button.getAttribute('data-station');
            if (!defaultOrder.includes(station) && !reorderedButtons.includes(button)) {
                reorderedButtons.push(button);
            }
        });

        // Reordena os botões sem removê-los do DOM
        reorderedButtons.forEach((button, index) => {
            if (button && button.parentNode) {
                // Move o botão para a posição correta
                container.appendChild(button);
                const station = button.getAttribute('data-station');
                console.log(`✅ Botão ${station} movido para posição ${index}`);
            }
        });

        console.log('✅ Layout padrão aplicado com sucesso (método seguro)');
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao aplicar layout padrão (método seguro):', error);
        return false;
    }
}

// Função para aplicar o layout padrão
function applyDefaultLayout() {
    try {
        // Tenta encontrar o container do grid de várias formas
        let container = document.querySelector('#grid-container');
        if (!container) {
            container = document.querySelector('.draggable-btn')?.parentNode;
        }
        if (!container) {
            console.warn('⚠️ Container do grid não encontrado');
            return false;
        }
        
        console.log('📦 Container encontrado:', container);

        const buttons = Array.from(container.querySelectorAll('.draggable-btn'));
        if (buttons.length === 0) {
            console.warn('⚠️ Nenhum botão draggable encontrado no container');
            return false;
        }

        // Define a ordem padrão baseada nos data-station
        const defaultOrder = [
            'velocidade-real',
            'velocidade-prog', 
            'alarmes',
            'plasson-farm',
            'acumuladora',
            'dosificadora',
            'botao-7',
            'botao-8',
            'botao-9',
            'botao-10',
            'botao-11',
            'botao-12'
        ];

        console.log('📋 Aplicando ordem padrão:', defaultOrder);

        // Cria um array com os botões na ordem correta
        const reorderedButtons = new Array(buttons.length);
        
        // Mapeia as posições na ordem padrão
        defaultOrder.forEach((stationId, index) => {
            const button = buttons.find(btn => btn.getAttribute('data-station') === stationId);
            if (button && index < reorderedButtons.length) {
                reorderedButtons[index] = button;
            }
        });
        
        // Adiciona botões que não estão na lista padrão no final
        let nextIndex = defaultOrder.length;
        buttons.forEach(button => {
            const station = button.getAttribute('data-station');
            if (!defaultOrder.includes(station) && nextIndex < reorderedButtons.length) {
                reorderedButtons[nextIndex] = button;
                nextIndex++;
            }
        });

        // Remove todos os botões do container
        buttons.forEach(button => {
            if (button.parentNode) {
                button.parentNode.removeChild(button);
            }
        });

        // Adiciona os botões na ordem correta
        reorderedButtons.forEach((button, index) => {
            if (button) {
                container.appendChild(button);
                const station = button.getAttribute('data-station');
                console.log(`✅ Botão ${station} adicionado na posição ${index}`);
            }
        });

        console.log('✅ Layout padrão aplicado com sucesso');
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao aplicar layout padrão:', error);
        return false;
    }
}

// Trava para só permitir drag após segurar por 1 segundo
let dragTimeout = null;
let allowDrag = false;
let currentWaitingButton = null;

// Função para configurar eventos de drag and drop
function configurarDragAndDrop() {
    console.log('🔧 Configurando eventos de drag and drop...');
    
    const draggableButtons = document.querySelectorAll('.draggable-btn');
    console.log('🔍 Botões draggable encontrados:', draggableButtons.length);
    
    if (draggableButtons.length === 0) {
        console.warn('⚠️ Nenhum botão .draggable-btn encontrado! Verificando seletor alternativo...');
        const alternativeButtons = document.querySelectorAll('[data-station]');
        console.log('🔍 Botões com data-station encontrados:', alternativeButtons.length);
        return;
    }

    draggableButtons.forEach(button => {
        // Remove event listeners existentes para evitar duplicação
        button.removeEventListener('mousedown', handleMouseDown);
        button.removeEventListener('mouseup', handleMouseUp);
        button.removeEventListener('mouseleave', handleMouseLeave);
        button.removeEventListener('dragstart', handleDragStart);
        button.removeEventListener('dragend', handleDragEnd);
        button.removeEventListener('dragover', handleDragOver);
        button.removeEventListener('drop', handleDrop);
        
        // Adiciona os novos event listeners
        button.addEventListener('mousedown', handleMouseDown);
        button.addEventListener('mouseup', handleMouseUp);
        button.addEventListener('mouseleave', handleMouseLeave);
        button.addEventListener('dragstart', handleDragStart);
        button.addEventListener('dragend', handleDragEnd);
        button.addEventListener('dragover', handleDragOver);
        button.addEventListener('drop', handleDrop);
    });
}

// Handlers separados para os eventos
function handleMouseDown(e) {
    const button = e.currentTarget;
        allowDrag = false;
    currentWaitingButton = button;
    
    // Aplica efeito visual de espera
    button.classList.add('waiting-for-unlock');
    
        dragTimeout = setTimeout(() => {
            allowDrag = true;
        currentWaitingButton = null;
        
        // Remove efeito de espera e aplica efeito de desbloqueio
        button.classList.remove('waiting-for-unlock');
        button.classList.add('unlocked-for-drag');
        
            // Inicia drag programaticamente se mouse ainda está pressionado
            button.setAttribute('draggable', 'true');
        
        // Remove efeito de desbloqueio após animação
        setTimeout(() => {
            button.classList.remove('unlocked-for-drag');
        }, 500);
        }, 1000); // 1 segundo
}

function handleMouseUp(e) {
    const button = e.currentTarget;
        clearTimeout(dragTimeout);
        button.removeAttribute('draggable');
    
    // Remove todos os efeitos visuais
    if (currentWaitingButton === button) {
        currentWaitingButton = null;
    }
    button.classList.remove('waiting-for-unlock', 'unlocked-for-drag');
}

function handleMouseLeave(e) {
    const button = e.currentTarget;
        clearTimeout(dragTimeout);
        button.removeAttribute('draggable');
    
    // Remove todos os efeitos visuais
    if (currentWaitingButton === button) {
        currentWaitingButton = null;
    }
    button.classList.remove('waiting-for-unlock', 'unlocked-for-drag');
}

function handleDragStart(e) {
        if (!allowDrag) {
            e.preventDefault();
            return;
        }
        draggedButton = e.currentTarget;
    
    // Aplica efeito visual de arrastando
    draggedButton.classList.add('dragging');
        document.querySelectorAll('.draggable-btn').forEach(btn => {
            if (btn !== draggedButton) btn.classList.add('inactive');
        });
        allowDrag = false;
}

function handleDragEnd(e) {
    const button = e.currentTarget;
    // Remove efeito de arrastando
    draggedButton.classList.remove('dragging');
        document.querySelectorAll('.draggable-btn').forEach(btn => btn.classList.remove('inactive'));
        button.removeAttribute('draggable');
        allowDrag = false;
}

function handleDragOver(e) {
    e.preventDefault();
}

function handleDrop(e) {
        e.preventDefault();
        const target = e.currentTarget;
        if (draggedButton && target !== draggedButton) {
            console.log('🔄 Drop detectado:', draggedButton.getAttribute('data-station'), '->', target.getAttribute('data-station'));
            
            const parent = target.parentNode;
            const temp = document.createElement('div');
            parent.insertBefore(temp, target);
            parent.insertBefore(target, draggedButton);
            parent.insertBefore(draggedButton, temp);
            parent.removeChild(temp);
            
            // Salva as novas posições imediatamente após o drop
            console.log('💾 Salvando posições após drop...');
            saveGridPositions();
        }
}

// Aguarda o DOM estar completamente carregado antes de configurar os eventos
document.addEventListener('DOMContentLoaded', () => {
    configurarDragAndDrop();
    // Alternar visibilidade do círculo Alimentador com duplo clique
    const alimentadorEl = document.querySelector('.alarm-count-circle.alimentador');
    if (alimentadorEl && !alimentadorEl.dataset.toggleBound) {
        alimentadorEl.addEventListener('dblclick', () => {
            const hidden = localStorage.getItem('alarm_circle_alimentador_hidden') === '1';
            localStorage.setItem('alarm_circle_alimentador_hidden', hidden ? '0' : '1');
            alimentadorEl.setAttribute('data-visible', hidden ? 'true' : 'false');
        });
        alimentadorEl.dataset.toggleBound = '1';
    }
});

// Funções do velocímetro
function atualizarPonteiro(ponteiroElement, valor) {
    // Ajuste fino do cálculo de ângulo
    const anguloMin = -128;  // Posição mínima (0 Cx/h)
    const anguloMax = 65;    // Posição máxima (400 Cx/h)
    
    valor = Math.max(0, Math.min(SPEED_MAX, valor));
    const percentual = valor / SPEED_MAX;
    const angulo = anguloMin + (anguloMax - anguloMin) * percentual;
    
    ponteiroElement.style.transform = `translateX(-50%) rotate(${angulo}deg)`;
}

// Atualiza a UI da velocidade real a partir de um valor numérico (cx/h)
function atualizarVelocidadeRealUI(valor){
    const valorNum = Math.max(0, Math.min(SPEED_MAX, Number(valor) || 0));
    const valorEl = document.querySelector('#valorReal .valor');
    if (valorEl) {
        valorEl.textContent = Math.round(valorNum);
    } else {
        const root = document.getElementById('valorReal');
        if (root) root.textContent = String(Math.round(valorNum));
    }
    const ponteiro = document.getElementById('ponteiroReal');
    if (ponteiro) atualizarPonteiro(ponteiro, valorNum);
    // debug
    // console.debug('[GRID] UI atualizado com valor', valorNum);
}

function mostrarVelocidadeIndisponivel(){
    // Velocidade real
    const valorEl = document.querySelector('#valorReal .valor');
    if (valorEl) {
        valorEl.textContent = '???';
    } else {
        const root = document.getElementById('valorReal');
        if (root) root.textContent = '???';
    }
    const ponteiro = document.getElementById('ponteiroReal');
    if (ponteiro) atualizarPonteiro(ponteiro, 0);
    
    // Velocidade programada
    const velocidadeInput = document.getElementById('velocidadeInput');
    if (velocidadeInput) {
        velocidadeInput.value = '???';
    }
    const ponteiroProg = document.getElementById('ponteiroProg');
    if (ponteiroProg) {
        atualizarPonteiro(ponteiroProg, 0);
    }
}

function pickSpeedValue(obj){
    if (!obj) return null;
    for (const key of SPEED_TAGS){
        if (obj[key] != null) return obj[key];
    }
    return null;
}

function pickSpeedProgrammedValue(obj){
    if (!obj) return null;
    return obj[SPEED_TAG_PROGRAMMED] || null;
}

function atualizarVelocidadeProgramadaUI(valor){
    if (valor == null) {
        console.log('[GRID] Velocidade programada: valor nulo');
        return;
    }
    
    // Não atualiza a UI se o usuário está digitando
    if (USER_TYPING_VELOCITY) {
        console.log('[GRID] Velocidade programada: ignorando atualização - usuário digitando');
        return;
    }
    
    // Não atualiza se foi escrita recentemente (últimos 2 segundos)
    const now = Date.now();
    if (now - VELOCITY_WRITE_TIMESTAMP < 2000) {
        console.log('[GRID] Velocidade programada: ignorando atualização - escrita recente');
        return;
    }
    
    console.log(`[GRID] Velocidade programada: ${valor} cx/h`);
    
    // Atualiza o campo de input existente
    const velocidadeInput = document.getElementById('velocidadeInput');
    if (velocidadeInput) {
        velocidadeInput.value = Math.round(valor);
    }
    
    // Atualiza ponteiro da velocidade programada se existir
    const ponteiroProg = document.getElementById('ponteiroProg');
    if (ponteiroProg) {
        atualizarPonteiro(ponteiroProg, valor);
    }
}

function escreverVelocidadeProgramada(valor) {
    console.log(`[GRID] 📝 Escrevendo velocidade programada: ${valor} cx/h`);
    
    // Marca timestamp da escrita para evitar leituras conflitantes
    VELOCITY_WRITE_TIMESTAMP = Date.now();
    
    const payload = {
        [SPEED_TAG_PROGRAMMED]: valor
    };
    
    fetch('/api/write_tags', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
    })
    .then(response => response.json())
    .then(data => {
        if (data.ok) {
            console.log(`[GRID] ✅ Velocidade programada escrita com sucesso: ${valor} cx/h`);
            // Atualiza a UI imediatamente (força a atualização mesmo com as proteções)
            const velocidadeInput = document.getElementById('velocidadeInput');
            if (velocidadeInput) {
                velocidadeInput.value = Math.round(valor);
            }
            
            const ponteiroProg = document.getElementById('ponteiroProg');
            if (ponteiroProg) {
                atualizarPonteiro(ponteiroProg, valor);
            }
        } else {
            console.error(`[GRID] ❌ Erro ao escrever velocidade programada: ${data.error}`);
            alert(`Erro ao escrever no PLC: ${data.error}`);
        }
    })
    .catch(error => {
        console.error(`[GRID] ❌ Erro na requisição: ${error}`);
        alert(`Erro de comunicação: ${error.message}`);
    });
}

// Vincula Socket.IO para receber a tag de velocidade (com fallback)
function bindTelemetryVelocidadeReal(){
    try {
        // Reutiliza conexão existente, se houver
        const socket = window.io ? (
            window.supervisorSocket || (
                window.supervisorSocket = window.io({
                    reconnection: true,
                    reconnectionAttempts: Infinity,
                    reconnectionDelay: 500,
                    reconnectionDelayMax: 3000,
                    timeout: 20000,
                    transports: ['polling', 'websocket']
                })
            )
        ) : null;
        if (!socket) return false;
        console.log('[GRID] Socket.IO conectado para velocidade real');
        // usar timestamp global
        SPEED_LAST_OK_TS = Date.now();
        socket.on('connect', () => {
            // Ao conectar/reconectar, força uma leitura imediata
            fetch('/api/read_tags?names=' + encodeURIComponent(SPEED_TAGS.join(',')), { cache: 'no-store' })
                .then(r => r.json())
                .then(res => {
                    if (res && res.ok && res.values) {
                        // Processa velocidade real
                        const valReal = pickSpeedValue(res.values);
                        if (valReal != null) {
                            atualizarVelocidadeRealUI(valReal);
                            SPEED_LAST_OK_TS = Date.now();
                        }
                        
                        // Processa velocidade programada
                        const valProg = pickSpeedProgrammedValue(res.values);
                        if (valProg != null) {
                            atualizarVelocidadeProgramadaUI(valProg);
                        }
                    }
                })
                .catch(() => {});
            ensureMachineSelected();
        });
        socket.on('telemetry', data => {
            if (!data) return;
            if (data.plc_connected === false){
                mostrarVelocidadeIndisponivel();
                return;
            }
            const val = pickSpeedValue(data);
            if (val == null) return;
            atualizarVelocidadeRealUI(val);
            SPEED_LAST_OK_TS = Date.now();
        });
        // Quando reconectar, faça uma leitura imediata por HTTP para repopular
        socket.on('plc_connection_changed', (s) => {
            if (s && s.connected){
                fetch('/api/read_tags?names=' + encodeURIComponent(SPEED_TAGS.join(',')), { cache: 'no-store' })
                    .then(r => r.json())
                    .then(res => {
                        if (res && res.ok && res.values) {
                            // Processa velocidade real
                            const valReal = pickSpeedValue(res.values);
                            if (valReal != null) {
                                atualizarVelocidadeRealUI(valReal);
                                if (SPEED_WAS_OFFLINE) {
                                    SPEED_WAS_OFFLINE = false;
                                    setTimeout(() => window.location.reload(), 50);
                                }
                            }
                            
                            // Processa velocidade programada
                            const valProg = pickSpeedProgrammedValue(res.values);
                            if (valProg != null) {
                                atualizarVelocidadeProgramadaUI(valProg);
                            }
                        }
                    })
                    .catch(() => {});
                ensureMachineSelected();
            }
        });
        // Comando remoto para recarregar a página
        socket.on('force_reload', (data) => {
            console.log('[GRID] 🔔 Evento force_reload recebido:', data);
            
            // Evita reload se já foi feito recentemente
            const lastReload = localStorage.getItem('lastReload');
            const now = Date.now();
            if (lastReload && (now - parseInt(lastReload)) < 5000) {
                console.log('[GRID] ⚠️ Reload ignorado - muito recente');
                return;
            }
            
            console.log('[GRID] 🔄 Executando reload da página...');
            localStorage.setItem('lastReload', now.toString());
            window.location.reload();
        });
        
        // Evento quando PLC é detectado automaticamente
        socket.on('plc_detected', (data) => {
            console.log('[GRID] 🔔 Evento plc_detected recebido:', data);
            if (data && data.machine) {
                console.log(`[GRID] ✅ PLC ${data.machine} detectado automaticamente!`);
                
                // Verifica se já está na máquina correta para evitar reload desnecessário
                const currentMachine = document.querySelector('.machine-name')?.textContent;
                if (currentMachine && currentMachine.includes(data.machine)) {
                    console.log(`[GRID] ✅ Já está na máquina correta: ${data.machine}`);
                    return;
                }
                
                console.log(`[GRID] 🎯 Recarregando página em 1 segundo...`);
                // Força reload da página para reconhecer nova máquina
                setTimeout(() => {
                    console.log('[GRID] 🔄 Executando reload da página...');
                    window.location.reload();
                }, 1000);
            }
        });
        // watchdog: se passar >2.5s sem dado válido, mostrar ???
        if (window.supervisorSpeedWatchdog) clearInterval(window.supervisorSpeedWatchdog);
        window.supervisorSpeedWatchdog = setInterval(() => {
            if (Date.now() - SPEED_LAST_OK_TS > 2500) {
                mostrarVelocidadeIndisponivel();
            }
        }, 1000);
        return true;
    } catch(e){
        console.warn('Socket.IO indisponível para velocidade real:', e);
        return false;
    }
}



// Funções do teclado virtual
let valorDigitado = "";
let deveSubstituir = false;
const teclado = document.getElementById("teclado-virtual");
let intervaloAjuste;

// Color helper utilities used by gauges
function hexToRgb(hex) {
    const h = hex.replace('#','');
    return [parseInt(h.substring(0,2),16), parseInt(h.substring(2,4),16), parseInt(h.substring(4,6),16)];
}
function rgbToHex(r,g,b){
    return '#' + [r,g,b].map(x => x.toString(16).padStart(2,'0')).join('');
}
function mix(c1, c2, t){
    return [Math.round(c1[0] + (c2[0]-c1[0])*t), Math.round(c1[1] + (c2[1]-c1[1])*t), Math.round(c1[2] + (c2[2]-c1[2])*t)];
}

// Adiciona listener para clicks em toda a página
document.addEventListener('mousedown', function(event) {
    // Verifica se o teclado está visível e se o clique foi fora dele
    if (teclado.style.display === "grid" && 
        !teclado.contains(event.target) && 
        !event.target.classList.contains('velocimetro-input')) {
        fecharTeclado();
    }
});

// Adiciona listener para ESC para cancelar digitação
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && teclado.style.display === "grid") {
        // Cancela a digitação sem salvar
        USER_TYPING_VELOCITY = false;
        teclado.style.display = "none";
        valorDigitado = "";
        const input = document.getElementById(teclado.dataset.target);
        if (input) {
            input.blur();
        }
    }
});

// Reposiciona o teclado quando a janela for redimensionada
window.addEventListener('resize', function() {
    if (teclado.style.display === "grid") {
        const input = document.getElementById(teclado.dataset.target);
        if (input) {
            // Simula um novo clique para reposicionar o teclado
            const event = new MouseEvent('click', {
                bubbles: true,
                cancelable: true
            });
            input.dispatchEvent(event);
        }
    }
});


function abrirTeclado(e) {
    const input = e.target.closest('.velocimetro-input');
    if (input) {
        // Marca que o usuário está digitando se for o campo de velocidade programada
        if (input.id === 'velocidadeInput') {
            USER_TYPING_VELOCITY = true;
        }
        
        input.focus();
        const rect = input.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const tecladoHeight = 200; // Altura aproximada do teclado
        
        teclado.style.display = "grid";
        teclado.style.left = `${rect.left}px`;
        
        // Detecta se o campo está na parte superior ou inferior da tela
        const isInUpperHalf = rect.top < (viewportHeight / 2);
        
        if (isInUpperHalf) {
            // Campo na parte superior - mostra teclado embaixo
        teclado.style.top = `${rect.bottom + 15}px`;
        } else {
            // Campo na parte inferior - mostra teclado em cima do velocímetro inteiro
            // Encontra o container do velocímetro para posicionar acima dele
            const velocimetroContainer = input.closest('.draggable-btn');
            if (velocimetroContainer) {
                const containerRect = velocimetroContainer.getBoundingClientRect();
                teclado.style.top = `${containerRect.top - tecladoHeight - 15}px`;
            } else {
                // Fallback: usa a posição do input
                teclado.style.top = `${rect.top - tecladoHeight - 15}px`;
            }
        }
        
        // Ajusta posição horizontal para manter dentro da tela
        const tecladoWidth = 300; // Largura aproximada do teclado
        const viewportWidth = window.innerWidth;
        
        if (!isInUpperHalf) {
            // Quando o teclado está em cima, centraliza em relação ao velocímetro
            const velocimetroContainer = input.closest('.draggable-btn');
            if (velocimetroContainer) {
                const containerRect = velocimetroContainer.getBoundingClientRect();
                const centerX = containerRect.left + (containerRect.width / 2) - (tecladoWidth / 2);
                teclado.style.left = `${Math.max(10, Math.min(centerX, viewportWidth - tecladoWidth - 10))}px`;
            }
        } else {
            // Quando o teclado está embaixo, usa a posição do input
            if (rect.left + tecladoWidth > viewportWidth) {
                teclado.style.left = `${viewportWidth - tecladoWidth - 10}px`;
            }
        }
        
        // Ajusta posição vertical se o teclado sair da tela
        const finalTop = parseInt(teclado.style.top);
        if (finalTop < 10) {
            teclado.style.top = '10px';
        } else if (finalTop + tecladoHeight > viewportHeight - 10) {
            teclado.style.top = `${viewportHeight - tecladoHeight - 10}px`;
        }
        
        teclado.dataset.target = input.id;
        deveSubstituir = true;
        valorDigitado = "";
        e.stopPropagation();
    }
}

function fecharTeclado() {
    const input = document.getElementById(teclado.dataset.target);
    if (input) {
        input.blur();
        let valor = parseInt(valorDigitado, 10) || 0;
        valor = Math.min(SPEED_MAX, Math.max(0, valor));
        input.value = valor;
        const ponteiro = input.closest('.draggable-btn').querySelector('.ponteiro');
        if (ponteiro) atualizarPonteiro(ponteiro, valor);
        
        // Escreve no PLC se for o campo de velocidade programada
        if (input.id === 'velocidadeInput') {
            escreverVelocidadeProgramada(valor);
            // Libera o controle de digitação após um pequeno delay
            setTimeout(() => {
                USER_TYPING_VELOCITY = false;
            }, 1000);
        }
    }
    teclado.style.display = "none";
    valorDigitado = "";
}

function digitarNumero(num) {
    const input = document.getElementById(teclado.dataset.target);
    if (valorDigitado === "" || deveSubstituir) {
        valorDigitado = num.toString();
        deveSubstituir = false;
    } else if (valorDigitado.length < 3) {
        valorDigitado += num;
    }
    input.value = valorDigitado;
}

function ajustarValor(delta) {
    const inputAtivo = document.getElementById(teclado.dataset.target);
    if (!inputAtivo) return;

    intervaloAjuste = setInterval(() => {
        let valor = parseInt(inputAtivo.value, 10) || 0;
        valor = Math.min(SPEED_MAX, Math.max(0, valor + delta));
        inputAtivo.value = valor;
        const ponteiro = inputAtivo.closest('.draggable-btn').querySelector('.ponteiro');
        if (ponteiro) atualizarPonteiro(ponteiro, valor);
    }, 30);
}

function pararAjuste() {
    clearInterval(intervaloAjuste);
}

// Função para atualizar contadores de alarme
async function atualizarContadoresAlarme() {
    try {
        const res = await fetch('/api/alarms', { cache: 'no-store' }).then(r => r.json());
        if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'API error');

        const summary = res.alarm_summary || {};
        const contadores = {
            emergency: summary.emergency || 0,
            nr12: summary.nr12 || 0,
            drives: summary.drives || 0,
            thermal: summary.thermal || 0,
            hardware: summary.hardware || 0,
            process: summary.process || 0,
            total: summary.total || 0
        };

        // Atualiza os valores na interface
        Object.keys(contadores).forEach(tipo => {
            const elemento = document.querySelector(`.alarm-count-circle.${tipo} .count-value`);
            const circle = document.querySelector(`.alarm-count-circle.${tipo}`);
            if (elemento) {
                const digits = (tipo === 'alimentador') ? 2 : 2;
                elemento.textContent = contadores[tipo].toString().padStart(digits, '0');
            }
            if (circle) {
                if (contadores[tipo] > 0) circle.classList.add('has-alarms');
                else circle.classList.remove('has-alarms');
            }
        });

        // Clique no botão Alarmes abre a tela de alarmes
        // Remove a abertura pelo card principal e delega aos círculos por tipo
        const btnAlarmes = document.querySelector('.draggable-btn[data-station="alarmes"]');
        if (btnAlarmes) btnAlarmes.style.cursor = 'default';

        // Click por círculo: abre tela de alarmes e seleciona a aba correspondente
        const circles = document.querySelectorAll('.alarm-count-circle');
        circles.forEach(circle => {
            if (circle.dataset.boundClick) return;
            circle.addEventListener('click', (e) => {
                e.preventDefault();
                const tipo = (circle.getAttribute('data-type') || '').toLowerCase();
                try {
                    if (window.showAlarm) {
                        window.showAlarm(e);
                        // Aguarda UI montar e seleciona a aba
                        setTimeout(() => {
                            if (window.selectAlarmTab) window.selectAlarmTab(tipo);
                        }, 50);
                        return;
                    }
                } catch(_) {}
                // Fallback com hash e recarregar
                window.location.hash = `#alarms-${tipo}`;
                window.location.reload();
            });
            circle.dataset.boundClick = '1';
        });

        // Aplicar visibilidade do círculo "Alimentador" mantendo posição
        const alimentadorEl = document.querySelector('.alarm-count-circle.alimentador');
        const isHidden = localStorage.getItem('alarm_circle_alimentador_hidden') === '1';
        if (alimentadorEl) {
            alimentadorEl.setAttribute('data-visible', isHidden ? 'false' : 'true');
        }

    } catch (e) {
        // Silencioso para não poluir logs
    }
}

// Modificar a função inicializarVelocimetro para incluir a atualização dos contadores
function inicializarVelocimetro() {
    console.log("Velocímetro e contadores inicializados.");

    // Restaura posições salvas do grid antes de inicializar os velocímetros
    setTimeout(() => {
        const restored = restoreGridPositions();
        if (!restored) {
            // Se não conseguiu restaurar, salva as posições padrão
            console.log('💾 Salvando posições padrão...');
            saveGridPositions();
        }
        
        // Configura eventos de drag and drop após o grid estar pronto
        configurarDragAndDrop();
    }, 100);

    // Inicialização dos velocímetros
    document.querySelectorAll('.draggable-btn').forEach(btn => {
        const ponteiro = btn.querySelector('.ponteiro[data-tipo="real"]');
        if (ponteiro) {
            const valorInicial = parseInt(btn.querySelector('.valor').textContent) || 0;
            atualizarPonteiro(ponteiro, valorInicial);
        }
    });

    // Tenta receber por Socket.IO; se não houver, faz fallback por HTTP
    // Liga Socket.IO (se disponível) 
    bindTelemetryVelocidadeReal();
    
    // Polling HTTP reduzido: usa Socket.IO primário e HTTP como fallback lento
    let consecutiveFailures = 0;
    setInterval(() => {
        // se recebemos dado válido via socket há <= 1500ms, não faz HTTP agora
        if (Date.now() - SPEED_LAST_OK_TS <= 1500) return;
        fetch('/api/read_tags?names=' + encodeURIComponent(SPEED_TAGS.join(',')), { 
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' }
        })
            .then(r => {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(res => {
                if (res && res.ok && res.values) {
                    // Processa velocidade real
                    const valReal = pickSpeedValue(res.values);
                    if (valReal != null) {
                        atualizarVelocidadeRealUI(valReal);
                        consecutiveFailures = 0;
                        SPEED_LAST_OK_TS = Date.now();
                        if (SPEED_WAS_OFFLINE) {
                            SPEED_WAS_OFFLINE = false;
                            setTimeout(() => window.location.reload(), 50);
                        }
                    }
                    
                    // Processa velocidade programada
                    const valProg = pickSpeedProgrammedValue(res.values);
                    if (valProg != null) {
                        atualizarVelocidadeProgramadaUI(valProg);
                    }
                } else {
                    consecutiveFailures++;
                    if (consecutiveFailures >= 3) {
                        mostrarVelocidadeIndisponivel();
                        SPEED_WAS_OFFLINE = true;
                    }
                }
            })
            .catch(() => {
                consecutiveFailures++;
                if (consecutiveFailures >= 3) {
                    mostrarVelocidadeIndisponivel();
                    SPEED_WAS_OFFLINE = true;
                }
            });
    }, 700);
    // Sincroniza SPEED_MAX e dispara uma leitura imediata para preencher a UI rapidamente
    syncSpeedMaxFromServer().catch(()=>{});
    fetch('/api/read_tags?names=' + encodeURIComponent(SPEED_TAGS.join(',')))
        .then(r => r.json())
        .then(res => {
            if (res && res.ok && res.values) {
                // Processa velocidade real
                const valReal = pickSpeedValue(res.values);
                if (valReal != null) {
                    atualizarVelocidadeRealUI(valReal);
                }
                
                // Processa velocidade programada
                const valProg = pickSpeedProgrammedValue(res.values);
                if (valProg != null) {
                    atualizarVelocidadeProgramadaUI(valProg);
                }
            }
        })
        .catch(() => {});

    // Atualiza contadores de alarme periodicamente
    setInterval(() => {
        atualizarContadoresAlarme();
    }, 2000);
}

// Inicialização
document.addEventListener("DOMContentLoaded", inicializarVelocimetro);

// Função global para resetar posições (pode ser chamada do console ou por botão)
window.resetGridPositions = resetGridPositions;

// Função global para testar salvamento (pode ser chamada do console)
window.testSaveGridPositions = saveGridPositions;

// Função global para verificar posições salvas
window.checkSavedPositions = function() {
    const saved = localStorage.getItem(GRID_POSITIONS_KEY);
    console.log('📂 Posições salvas no localStorage:', saved);
    const sessionSaved = sessionStorage.getItem(GRID_POSITIONS_KEY);
    console.log('📂 Posições salvas no sessionStorage:', sessionSaved);
    
    const buttons = document.querySelectorAll('.draggable-btn');
    console.log('🔍 Botões draggable encontrados:', buttons.length);
    buttons.forEach((btn, index) => {
        const station = btn.getAttribute('data-station');
        console.log(`📍 Botão ${index}: ${station}`);
    });
};

// Função global para testar o botão reset
window.testResetButton = function() {
    console.log('🧪 Testando botão reset...');
    const resetButton = document.getElementById('btn-reset-grid');
    if (resetButton) {
        console.log('✅ Botão reset encontrado:', resetButton);
        console.log('🔍 Estilo do botão:', window.getComputedStyle(resetButton));
        console.log('🔍 Posição do botão:', resetButton.getBoundingClientRect());
        
        // Simula um clique
        resetButton.click();
    } else {
        console.error('❌ Botão reset não encontrado!');
    }
};

// Função global para testar o layout padrão
window.testDefaultLayout = function() {
    console.log('🧪 Testando layout padrão...');
    const result = applyDefaultLayout();
    if (result) {
        console.log('✅ Layout padrão aplicado com sucesso');
    } else {
        console.error('❌ Falha ao aplicar layout padrão');
    }
};

// Função global para aplicar layout padrão
window.applyDefaultLayout = applyDefaultLayout;

// Função global para testar efeitos visuais
window.testDragEffects = function() {
    console.log('🧪 Testando efeitos visuais de drag and drop...');
    
    const buttons = document.querySelectorAll('.draggable-btn');
    if (buttons.length === 0) {
        console.error('❌ Nenhum botão encontrado para testar');
        return;
    }
    
    const firstButton = buttons[0];
    console.log('🔘 Testando no primeiro botão:', firstButton.getAttribute('data-station'));
    
    // Testa efeito de espera
    console.log('⏳ Aplicando efeito de espera...');
    firstButton.classList.add('waiting-for-unlock');
    
    setTimeout(() => {
        console.log('🔓 Aplicando efeito de desbloqueio...');
        firstButton.classList.remove('waiting-for-unlock');
        firstButton.classList.add('unlocked-for-drag');
        
        setTimeout(() => {
            console.log('🎯 Aplicando efeito de arrastando...');
            firstButton.classList.remove('unlocked-for-drag');
            firstButton.classList.add('dragging');
            
            setTimeout(() => {
                console.log('✅ Removendo todos os efeitos...');
                firstButton.classList.remove('dragging');
                console.log('✅ Teste de efeitos concluído!');
            }, 1000);
        }, 1000);
    }, 1000);
};

// Função global para testar perda de conexão
window.testConnectionLoss = function() {
    console.log('🧪 Testando perda de conexão com PLC...');
    mostrarVelocidadeIndisponivel();
    console.log('✅ Velocidade real e programada devem mostrar "???"');
};

// Função global para restaurar velocidades
window.restoreVelocities = function() {
    console.log('🔄 Restaurando velocidades...');
    
    // Restaura velocidade real
    const valorEl = document.querySelector('#valorReal .valor');
    if (valorEl) {
        valorEl.textContent = '0';
    } else {
        const root = document.getElementById('valorReal');
        if (root) root.textContent = '0';
    }
    const ponteiro = document.getElementById('ponteiroReal');
    if (ponteiro) atualizarPonteiro(ponteiro, 0);
    
    // Restaura velocidade programada
    const velocidadeInput = document.getElementById('velocidadeInput');
    if (velocidadeInput) {
        velocidadeInput.value = '0';
    }
    const ponteiroProg = document.getElementById('ponteiroProg');
    if (ponteiroProg) {
        atualizarPonteiro(ponteiroProg, 0);
    }
    
    console.log('✅ Velocidades restauradas para 0');
};

// Função global para testar posicionamento do teclado
window.testTecladoPosition = function() {
    console.log('🧪 Testando posicionamento do teclado...');
    
    const velocidadeInput = document.getElementById('velocidadeInput');
    if (!velocidadeInput) {
        console.error('❌ Campo de velocidade programada não encontrado');
        return;
    }
    
    const rect = velocidadeInput.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const isInUpperHalf = rect.top < (viewportHeight / 2);
    
    // Informações do velocímetro container
    const velocimetroContainer = velocidadeInput.closest('.draggable-btn');
    let containerInfo = 'Não encontrado';
    if (velocimetroContainer) {
        const containerRect = velocimetroContainer.getBoundingClientRect();
        containerInfo = `Posição: ${containerRect.left}, ${containerRect.top} | Tamanho: ${containerRect.width} x ${containerRect.height}`;
    }
    
    console.log('📊 Informações do campo:');
    console.log(`   Posição: ${rect.left}, ${rect.top}`);
    console.log(`   Tamanho da tela: ${window.innerWidth} x ${window.innerHeight}`);
    console.log(`   Está na parte superior: ${isInUpperHalf}`);
    console.log(`   Posição relativa: ${((rect.top / viewportHeight) * 100).toFixed(1)}%`);
    console.log('📊 Informações do velocímetro:');
    console.log(`   ${containerInfo}`);
    
    // Simula abertura do teclado
    const event = new MouseEvent('click', {
        bubbles: true,
        cancelable: true
    });
    velocidadeInput.dispatchEvent(event);
    
    console.log('✅ Teclado aberto - verifique se está posicionado corretamente');
    console.log('💡 Se estiver na parte inferior, o teclado deve aparecer ACIMA do velocímetro inteiro');
};

// Função global para testar o botão reset
window.testResetButton = function() {
    console.log('🧪 Testando botão reset...');
    
    const resetButton = document.getElementById('btn-reset-grid');
    if (resetButton) {
        console.log('✅ Botão reset encontrado:', resetButton);
        console.log('🔍 Estilo do botão:', window.getComputedStyle(resetButton));
        console.log('🔍 Posição do botão:', resetButton.getBoundingClientRect());
        console.log('🔍 Eventos do botão:', resetButton.onclick);
        
        // Simula um clique
        resetButton.click();
    } else {
        console.error('❌ Botão reset não encontrado!');
        console.log('🔍 Tentando encontrar botão com outros seletores...');
        const altButton = document.querySelector('[id*="reset"]');
        if (altButton) {
            console.log('🔍 Botão alternativo encontrado:', altButton);
        }
    }
};

// Função global para testar o reset diretamente
window.testResetDirect = function() {
    console.log('🧪 Testando reset direto...');
    resetGridPositions();
};

// Função global para configurar o botão reset manualmente
window.configurarReset = function() {
    console.log('🔧 Configurando botão reset manualmente...');
    return configurarBotaoReset();
};

// Função global para forçar reset sem confirmação
window.forceReset = function() {
    console.log('🔄 Forçando reset do grid...');
    resetGridPositions();
};

// Função global para debug completo do botão reset
window.debugResetButton = function() {
    console.log('🔍 === DEBUG COMPLETO DO BOTÃO RESET ===');
    
    // Procura o botão de várias formas
    const selectors = [
        '#btn-reset-grid',
        '[id*="reset"]',
        '[class*="reset"]',
        'button[onclick*="reset"]'
    ];
    
    selectors.forEach(selector => {
        try {
            const elements = document.querySelectorAll(selector);
            console.log(`🔍 Seletor "${selector}": ${elements.length} elementos encontrados`);
            elements.forEach((el, i) => {
                console.log(`   ${i + 1}. ${el.tagName}#${el.id}.${el.className} - Texto: "${el.textContent.trim()}"`);
            });
        } catch (e) {
            console.log(`❌ Erro com seletor "${selector}": ${e.message}`);
        }
    });
    
    // Verifica se há botões com texto "reset"
    const allButtons = document.querySelectorAll('button');
    console.log(`🔍 Total de botões na página: ${allButtons.length}`);
    allButtons.forEach((btn, i) => {
        const text = btn.textContent.toLowerCase().trim();
        if (text.includes('reset') || text.includes('padrão') || text.includes('default')) {
            console.log(`🎯 Botão ${i + 1} com texto relacionado: "${btn.textContent.trim()}" (ID: ${btn.id})`);
        }
    });
    
    console.log('🔍 === FIM DO DEBUG ===');
};

// Função global para testar clique programático
window.testClickReset = function() {
    console.log('🧪 Testando clique programático no botão reset...');
    
    const resetButton = document.getElementById('btn-reset-grid') || 
                      document.querySelector('[id*="reset"]') ||
                      document.querySelector('button[onclick*="reset"]');
    
    if (resetButton) {
        console.log('✅ Botão encontrado, simulando clique...');
        console.log('🔍 Botão antes do clique:', resetButton);
        
        // Simula clique programático
        const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
        });
        
        resetButton.dispatchEvent(clickEvent);
        console.log('✅ Clique programático enviado');
    } else {
        console.error('❌ Botão reset não encontrado para teste');
    }
};

// Função global para forçar configuração e teste
window.forceConfigAndTest = function() {
    console.log('🔧 Forçando configuração e teste do botão reset...');
    
    // Configura o botão
    const configurado = configurarBotaoReset();
    
    if (configurado) {
        console.log('✅ Botão configurado, testando clique...');
        setTimeout(() => {
            testClickReset();
        }, 100);
    } else {
        console.error('❌ Falha ao configurar botão');
    }
};

// Função global para teste seguro do reset (sem bagunçar o grid)
window.testResetSafe = function() {
    console.log('🧪 Teste seguro do reset (sem modificar o grid)...');
    
    // Configura o botão
    const configurado = configurarBotaoReset();
    
    if (configurado) {
        console.log('✅ Botão configurado');
        console.log('🔄 Testando apenas a configuração do evento...');
        
        // Apenas testa se o botão está configurado, sem simular clique
        const resetButton = document.getElementById('btn-reset-grid');
        if (resetButton) {
            console.log('✅ Botão encontrado:', resetButton);
            console.log('🔍 onclick configurado:', !!resetButton.onclick);
            console.log('🔍 addEventListener configurado: Sim');
            console.log('✅ Teste de configuração concluído - botão pronto para uso');
        }
    } else {
        console.error('❌ Falha ao configurar botão');
    }
};

// Função global para testar se o evento está funcionando
window.testEventListeners = function() {
    console.log('🧪 Testando event listeners do botão reset...');
    
    const resetButton = document.getElementById('btn-reset-grid');
    if (!resetButton) {
        console.error('❌ Botão reset não encontrado');
        return;
    }
    
    console.log('✅ Botão encontrado:', resetButton);
    console.log('🔍 Event listeners ativos:');
    
    // Verifica se tem onclick
    console.log('   onclick:', resetButton.onclick);
    
    // Verifica se tem addEventListener (não é possível listar diretamente, mas podemos testar)
    console.log('   addEventListener configurado: Sim');
    
    // Testa clique programático
    console.log('🔄 Testando clique programático...');
    resetButton.click();
    
    console.log('✅ Teste concluído');
};

// Função global para testar o botão reset de forma simples
window.testResetButton = function() {
    console.log('🧪 Testando botão reset de forma simples...');
    
    // Configura o botão
    const configurado = configurarBotaoReset();
    
    if (configurado) {
        console.log('✅ Botão configurado com sucesso');
        console.log('🔄 Agora clique no botão reset para testar');
        console.log('📝 Verifique o console para ver os logs do clique');
    } else {
        console.error('❌ Falha ao configurar botão');
    }
};

// Função global para reset simples (apenas limpa e recarrega)
window.resetSimple = function() {
    console.log('🔄 Reset simples - apenas limpa storage e recarrega...');
    
    const confirmReset = confirm('⚠️ Deseja realmente resetar as posições do grid?\n\nIsso irá:\n• Limpar todas as posições salvas\n• Recarregar a página\n\nClique em OK para confirmar ou Cancelar para abortar.');
    
    if (!confirmReset) {
        console.log('❌ Reset cancelado pelo usuário');
        return;
    }
    
    console.log('✅ Reset confirmado pelo usuário');
    
    try {
        // Limpa as posições salvas
        localStorage.removeItem(GRID_POSITIONS_KEY);
        sessionStorage.removeItem(GRID_POSITIONS_KEY);
        console.log('✅ Posições limpas do storage');
        
        // Recarrega a página
        console.log('🔄 Recarregando página...');
        window.location.reload();
    } catch (error) {
        console.error('❌ Erro ao executar reset simples:', error);
        // Mesmo com erro, tenta recarregar
        window.location.reload();
    }
};

// Função global para testar o reset diretamente
window.testResetDirect = function() {
    console.log('🧪 Testando reset diretamente...');
    
    // Configura o botão
    const configurado = configurarBotaoReset();
    
    if (configurado) {
        console.log('✅ Botão configurado');
        console.log('🔄 Simulando clique direto...');
        
        // Simula o clique diretamente
        const resetButton = document.getElementById('btn-reset-grid');
        if (resetButton) {
            // Cria um evento de clique
            const clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            
            // Dispara o evento
            resetButton.dispatchEvent(clickEvent);
        }
    } else {
        console.error('❌ Falha ao configurar botão');
    }
};

// Função global para debugar o reset das posições
window.debugPositionReset = function() {
    console.log('🔍 === DEBUG DO RESET DE POSIÇÕES ===');
    
    // Verifica posições atuais
    const currentPositions = localStorage.getItem(GRID_POSITIONS_KEY);
    console.log('📋 Posições atuais no localStorage:', currentPositions);
    
    const currentSessionPositions = sessionStorage.getItem(GRID_POSITIONS_KEY);
    console.log('📋 Posições atuais no sessionStorage:', currentSessionPositions);
    
    // Verifica se há posições salvas
    if (currentPositions) {
        try {
            const parsed = JSON.parse(currentPositions);
            console.log('📋 Posições parseadas:', parsed);
        } catch (e) {
            console.error('❌ Erro ao fazer parse das posições:', e);
        }
    }
    
    // Simula o reset
    console.log('🔄 Simulando limpeza do storage...');
    localStorage.removeItem(GRID_POSITIONS_KEY);
    sessionStorage.removeItem(GRID_POSITIONS_KEY);
    
    // Verifica se foi limpo
    const afterClear = localStorage.getItem(GRID_POSITIONS_KEY);
    console.log('📋 Após limpeza (localStorage):', afterClear);
    
    const afterClearSession = sessionStorage.getItem(GRID_POSITIONS_KEY);
    console.log('📋 Após limpeza (sessionStorage):', afterClearSession);
    
    if (afterClear === null && afterClearSession === null) {
        console.log('✅ Storage limpo com sucesso');
    } else {
        console.error('❌ Storage não foi limpo corretamente');
    }
    
    console.log('🔍 === FIM DO DEBUG ===');
};

// Função global para forçar reset completo
window.forceResetComplete = function() {
    console.log('🔄 Forçando reset completo...');
    
    const confirmReset = confirm('⚠️ Deseja realmente resetar as posições do grid?\n\nIsso irá:\n• Limpar todas as posições salvas\n• Aplicar layout padrão\n• Recarregar a página\n\nClique em OK para confirmar ou Cancelar para abortar.');
    
    if (!confirmReset) {
        console.log('❌ Reset cancelado pelo usuário');
        return;
    }
    
    console.log('✅ Reset confirmado pelo usuário');
    
    try {
        // 1. Limpa as posições salvas
        localStorage.removeItem(GRID_POSITIONS_KEY);
        sessionStorage.removeItem(GRID_POSITIONS_KEY);
        console.log('✅ Posições limpas do storage');
        
        // 2. Aplica o layout padrão
        console.log('🔄 Aplicando layout padrão...');
        const result = applyDefaultLayoutSafe();
        if (result) {
            console.log('✅ Layout padrão aplicado com sucesso');
        } else {
            console.log('⚠️ Método seguro falhou, tentando método completo...');
            const fullResult = applyDefaultLayout();
            if (fullResult) {
                console.log('✅ Layout padrão aplicado com método completo');
            } else {
                console.error('❌ Falha ao aplicar layout padrão');
            }
        }
        
        // 3. Salva as novas posições
        setTimeout(() => {
            saveGridPositions();
            console.log('✅ Novas posições salvas');
            
            // 4. Recarrega a página
            console.log('🔄 Recarregando página...');
            setTimeout(() => {
                window.location.reload();
            }, 500);
        }, 200);
        
    } catch (error) {
        console.error('❌ Erro ao executar reset completo:', error);
        // Mesmo com erro, tenta recarregar
        setTimeout(() => {
            window.location.reload();
        }, 500);
    }
};

// Função global para verificar se o botão está configurado automaticamente
window.checkResetButton = function() {
    console.log('🔍 Verificando configuração automática do botão reset...');
    
    const resetButton = document.getElementById('btn-reset-grid');
    if (!resetButton) {
        console.error('❌ Botão reset não encontrado');
        return false;
    }
    
    console.log('✅ Botão encontrado:', resetButton);
    
    // Verifica se tem event listeners
    const hasOnclick = !!resetButton.onclick;
    console.log('🔍 onclick configurado:', hasOnclick);
    
    // Testa se o botão responde ao clique
    console.log('🔄 Testando clique no botão...');
    console.log('📝 Clique no botão reset na tela para testar');
    
    return true;
};

// Função global para forçar configuração do botão
window.forceConfigureReset = function() {
    console.log('🔧 Forçando configuração do botão reset...');
    
    const result = configurarBotaoReset();
    if (result) {
        console.log('✅ Botão configurado com sucesso');
        
        // Verifica se funcionou
        const resetButton = document.getElementById('btn-reset-grid');
        if (resetButton) {
            const hasOnclick = !!resetButton.onclick;
            console.log('🔍 onclick após configuração:', hasOnclick);
            
            if (hasOnclick) {
                console.log('✅ Botão pronto para uso!');
                console.log('🔄 Agora clique no botão reset na tela');
            } else {
                console.error('❌ Falha na configuração do onclick');
            }
        }
    } else {
        console.error('❌ Falha ao configurar botão');
    }
    
    return result;
};

// Função global para verificar se a configuração automática está funcionando
window.checkAutoConfig = function() {
    console.log('🔍 Verificando configuração automática...');
    
    const resetButton = document.getElementById('btn-reset-grid');
    if (!resetButton) {
        console.error('❌ Botão reset não encontrado');
        return false;
    }
    
    console.log('✅ Botão encontrado:', resetButton);
    
    const hasOnclick = !!resetButton.onclick;
    console.log('🔍 onclick configurado:', hasOnclick);
    
    if (hasOnclick) {
        console.log('✅ Configuração automática funcionando!');
        console.log('🔄 Botão pronto para uso - clique na tela para testar');
    } else {
        console.log('⚠️ Configuração automática não funcionou');
        console.log('🔧 Executando configuração manual...');
        forceConfigureReset();
    }
    
    return hasOnclick;
};

// Atalho de teclado removido conforme solicitado pelo usuário

// Função para configurar o botão de reset
function configurarBotaoReset() {
    console.log('🔧 Configurando botão de reset...');
    
    // Tenta diferentes seletores para encontrar o botão
    const selectors = [
        '#btn-reset-grid',
        '[id*="reset"]',
        'button[onclick*="reset"]'
    ];
    
    let resetButton = null;
    let usedSelector = '';
    
    for (const selector of selectors) {
        try {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                resetButton = elements[0];
                usedSelector = selector;
                console.log(`✅ Botão encontrado com seletor: ${selector}`);
                break;
            }
        } catch (e) {
            console.log(`❌ Erro com seletor ${selector}: ${e.message}`);
        }
    }
    
    // Se não encontrou com seletores, procura por texto
    if (!resetButton) {
        const allButtons = document.querySelectorAll('button');
        for (const btn of allButtons) {
            const text = btn.textContent.toLowerCase().trim();
            if (text.includes('reset') || text.includes('padrão') || text.includes('default')) {
                resetButton = btn;
                usedSelector = 'texto';
                console.log(`✅ Botão encontrado por texto: "${btn.textContent.trim()}"`);
                break;
            }
        }
    }
    
    if (resetButton) {
        console.log(`✅ Botão de reset encontrado (${usedSelector}):`, resetButton);
        console.log('🔍 ID do botão:', resetButton.id);
        console.log('🔍 Classe do botão:', resetButton.className);
        console.log('🔍 Texto do botão:', resetButton.textContent);
        
        // Remove qualquer evento anterior
        resetButton.removeEventListener('click', handleResetClick);
        
        // Limpa todos os event listeners anteriores
        resetButton.onclick = null;
        resetButton.removeAttribute('onclick');
        
        // Adiciona event listener
        resetButton.addEventListener('click', handleResetClick);
        
        // Adiciona também onclick como fallback
        resetButton.onclick = function(e) {
            console.log('🔄 onclick chamado diretamente!');
            handleResetClick(e);
        };
        
        console.log('✅ Event listener e onclick configurados com sucesso');
        
        // Adiciona evento de mouseup para debug
        resetButton.addEventListener('mouseup', () => {
            console.log('🖱️ Botão reset mouseup detectado');
        });
        
        // Testa se o evento foi adicionado
        console.log('🔍 Evento onclick configurado:', resetButton.onclick);
        
        return true;
    } else {
        console.warn('⚠️ Botão de reset não encontrado com nenhum seletor!');
        return false;
    }
}

// Função para configurar o botão reset com múltiplas tentativas
function configurarBotaoResetComTentativas() {
    console.log('🔧 Tentando configurar botão reset...');
    
    let tentativas = 0;
    const maxTentativas = 10;
    
    function tentarConfigurar() {
        tentativas++;
        console.log(`🔄 Tentativa ${tentativas}/${maxTentativas}`);
        
        const configurado = configurarBotaoReset();
        if (configurado) {
            console.log('✅ Botão reset configurado com sucesso!');
            return true;
        }
        
        if (tentativas < maxTentativas) {
            console.log(`⏳ Tentando novamente em 500ms...`);
            setTimeout(tentarConfigurar, 500);
        } else {
            console.error('❌ Falha ao configurar botão reset após todas as tentativas');
            return false;
        }
    }
    
    tentarConfigurar();
}

// Adiciona evento de clique para o botão de reset
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOMContentLoaded - Iniciando configuração do botão reset');
    configurarBotaoResetComTentativas();
});

// Também tenta configurar quando a página estiver completamente carregada
window.addEventListener('load', () => {
    console.log('🚀 Window load - Verificando configuração do botão reset');
    const resetButton = document.getElementById('btn-reset-grid');
    if (resetButton && !resetButton.onclick) {
        console.log('⚠️ Botão encontrado mas sem onclick, configurando...');
        configurarBotaoResetComTentativas();
    }
});

// Adiciona event delegation como fallback
console.log('🔧 Configurando event delegation para botão reset...');
document.addEventListener('click', (e) => {
    const target = e.target;
    const isResetButton = target.id === 'btn-reset-grid' || 
                        target.id.includes('reset') ||
                        target.textContent.toLowerCase().includes('reset') ||
                        target.textContent.toLowerCase().includes('padrão');
    
    if (isResetButton) {
        console.log('🎯 Event delegation capturou clique no botão reset:', target);
        e.preventDefault();
        e.stopPropagation();
        handleResetClick(e);
    }
});

// Função separada para o handler do clique
// Variável para controlar se o reset já está sendo processado
let isResetting = false;

function handleResetClick(e) {
    console.log('🔄 handleResetClick chamado!');
    console.log('🔄 Evento:', e);
    console.log('🔄 Target:', e.target);
    
    // Previne múltiplas execuções
    if (isResetting) {
        console.log('⚠️ Reset já está sendo processado, ignorando...');
        return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    console.log('🔄 Botão reset clicado');
    
    // Mostra confirmação antes de resetar
    const confirmReset = confirm('⚠️ Deseja realmente resetar as posições do grid?\n\nIsso irá:\n• Limpar todas as posições salvas\n• Recarregar a página\n\nClique em OK para confirmar ou Cancelar para abortar.');
    
    if (!confirmReset) {
        console.log('❌ Reset cancelado pelo usuário');
        return;
    }
    
    console.log('✅ Reset confirmado pelo usuário');
    
    // Marca que está processando
    isResetting = true;
    
    // Executa o reset completo - limpa, aplica layout e recarrega
    try {
        console.log('🔄 Executando reset completo...');
        
        // 1. Limpa as posições salvas
        localStorage.removeItem(GRID_POSITIONS_KEY);
        sessionStorage.removeItem(GRID_POSITIONS_KEY);
        console.log('✅ Posições limpas do storage');
        
        // 2. Aplica o layout padrão
        console.log('🔄 Aplicando layout padrão...');
        const result = applyDefaultLayoutSafe();
        if (result) {
            console.log('✅ Layout padrão aplicado com sucesso');
        } else {
            console.log('⚠️ Método seguro falhou, tentando método completo...');
            const fullResult = applyDefaultLayout();
            if (fullResult) {
                console.log('✅ Layout padrão aplicado com método completo');
            } else {
                console.error('❌ Falha ao aplicar layout padrão');
            }
        }
        
        // 3. Salva as novas posições
        setTimeout(() => {
            saveGridPositions();
            console.log('✅ Novas posições salvas');
            
            // 4. Recarrega a página
            console.log('🔄 Recarregando página...');
            setTimeout(() => {
                window.location.reload();
            }, 500);
        }, 200);
        
    } catch (error) {
        console.error('❌ Erro ao executar reset:', error);
        // Mesmo com erro, tenta recarregar
        console.log('🔄 Recarregando página mesmo com erro...');
        setTimeout(() => {
            window.location.reload();
        }, 500);
    }
}

// Salva posições quando a página for fechada ou recarregada
window.addEventListener('beforeunload', () => {
    saveGridPositions();
});

// Salva posições quando a página perder o foco (usuário mudar de aba)
window.addEventListener('blur', () => {
    saveGridPositions();
});

// Atualiza os pie-gauges com base nos sliders e evita que o slider dispare drag do botão
function atualizarPieGauges() {
    document.querySelectorAll('.pie-gauge').forEach(g => {
        const id = g.id.replace('gauge', '');
        const slider = document.getElementById('slider' + id);
        const limite = document.getElementById('limite' + id);
        const valueEl = g.querySelector('.pie-gauge-value');
        let pct = 0;
        if (slider) {
            pct = parseInt(slider.value, 10) || 0;
            // Atualiza label de limite (sem % para não duplicar)
            if (limite) limite.textContent = pct;
        } else if (valueEl) {
            pct = parseInt(valueEl.textContent, 10) || 0;
        }

        // Converter 0..100 para CSS var --pct (deg) -> percent of circle
        g.style.setProperty('--pct', pct + '%');
        // Generate a smooth gradient arc that starts green at 0 and progresses
        // to yellow and red as pct increases. We'll build a conic-gradient string
        // and set it to --arc. This reveals the colored arc only up to pct.
        // At low pct the arc remains green; towards 50% becomes yellowish and
        // near 100% becomes red.
        const p = Math.max(0, Math.min(100, pct));
        // Set the clipping percent --p and choose fill color based on pct.
        g.style.setProperty('--p', p + '%');
        // Interpolate color smoothly from green -> yellow -> red
        const green = hexToRgb('00c853');
        const yellow = hexToRgb('ffdd00');
        const red = hexToRgb('ff4444');
        let colorRgb;
        if (p <= 50) {
            const t = p / 50;
            colorRgb = mix(green, yellow, t);
        } else {
            const t = (p - 50) / 50;
            colorRgb = mix(yellow, red, t);
        }
        const fillColor = rgbToHex(colorRgb[0], colorRgb[1], colorRgb[2]);
        g.style.setProperty('--fill-color', fillColor);
        // Atualiza texto central
        if (valueEl) valueEl.textContent = pct + '%';
    });
}

// Hook nos sliders para atualizar em tempo real e evitar que o movimento do slider comece drag
document.querySelectorAll('.slider').forEach(slider => {
    // Ao pressionar no slider, bloqueia o possível drag do botão pai
    slider.addEventListener('pointerdown', (e) => {
        const btn = slider.closest('.draggable-btn');
        if (btn) {
            // Temporariamente remover arrastabilidade
            btn.removeAttribute('draggable');
            // Também cancela a timeout de iniciar drag
            clearTimeout(dragTimeout);
        }
        // Prevent the pointerdown from starting a drag
        e.stopPropagation();
    });

    slider.addEventListener('input', (e) => {
        const s = e.currentTarget;
        const id = s.id.replace('slider', '');
        const gauge = document.getElementById('gauge' + id);
        const limite = document.getElementById('limite' + id);
        if (gauge) {
            // update arc and central text
            const p = Math.max(0, Math.min(100, parseInt(s.value,10)||0));
            gauge.style.setProperty('--p', p + '%');
            // calc interpolated color (same logic as above)
            const green2 = [0x00,0xc8,0x53];
            const yellow2 = [0xff,0xdd,0x00];
            const red2 = [0xff,0x44,0x44];
            let rgb;
            if (p <= 50) {
                const t = p/50;
                rgb = mix(green2, yellow2, t);
            } else {
                const t = (p-50)/50;
                rgb = mix(yellow2, red2, t);
            }
            const hex = rgbToHex(rgb[0], rgb[1], rgb[2]);
            gauge.style.setProperty('--fill-color', hex);
            const valEl = gauge.querySelector('.pie-gauge-value');
            if (valEl) valEl.textContent = p + '%';
        }
        if (limite) limite.textContent = s.value;
    });

    slider.addEventListener('pointerup', (e) => {
        const btn = slider.closest('.draggable-btn');
        if (btn) {
            // Re-enable draggable only after short delay to avoid immediate drag after release
            setTimeout(() => btn.setAttribute('draggable', 'true'), 150);
        }
        e.stopPropagation();
    });
});

// Inicializa pie-gauges ao carregar DOM
document.addEventListener('DOMContentLoaded', () => {
    atualizarPieGauges();
});
