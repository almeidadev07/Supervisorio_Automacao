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
        
        // Aplica o layout padrão imediatamente
        console.log('🔄 Aplicando layout padrão...');
        applyDefaultLayout();
        
        // Recarrega a página para garantir que tudo está correto
        setTimeout(() => {
            console.log('🔄 Recarregando página para garantir consistência...');
            window.location.reload();
        }, 500);
        
    } catch (error) {
        console.error('❌ Erro ao resetar posições do grid:', error);
    }
}

// Função para aplicar o layout padrão
function applyDefaultLayout() {
    try {
        const container = document.querySelector('.draggable-btn')?.parentNode;
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

        console.log('📋 Aplicando ordem padrão:', defaultOrder);

        // Remove todos os botões do container
        buttons.forEach(button => {
            container.removeChild(button);
        });

        // Adiciona os botões na ordem padrão
        defaultOrder.forEach(stationId => {
            const button = buttons.find(btn => btn.getAttribute('data-station') === stationId);
            if (button) {
                container.appendChild(button);
                console.log(`✅ Botão ${stationId} adicionado na posição padrão`);
            }
        });

        // Adiciona botões que não estão na lista padrão no final
        buttons.forEach(button => {
            const station = button.getAttribute('data-station');
            if (!defaultOrder.includes(station)) {
                container.appendChild(button);
                console.log(`✅ Botão ${station} adicionado no final (não está na lista padrão)`);
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
    const valorEl = document.querySelector('#valorReal .valor');
    if (valorEl) {
        valorEl.textContent = '???';
    } else {
        const root = document.getElementById('valorReal');
        if (root) root.textContent = '???';
    }
    const ponteiro = document.getElementById('ponteiroReal');
    if (ponteiro) atualizarPonteiro(ponteiro, 0);
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


function abrirTeclado(e) {
    const input = e.target.closest('.velocimetro-input');
    if (input) {
        // Marca que o usuário está digitando se for o campo de velocidade programada
        if (input.id === 'velocidadeInput') {
            USER_TYPING_VELOCITY = true;
        }
        
        input.focus();
        const rect = input.getBoundingClientRect();
        teclado.style.display = "grid";
        teclado.style.left = `${rect.left}px`;
        teclado.style.top = `${rect.bottom + 15}px`;
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
function atualizarContadoresAlarme() {
    // Simulação de contadores (substitua com dados reais)
    const contadores = {
        emergency: Math.floor(Math.random() * 100),
        drives: Math.floor(Math.random() * 100),
        thermal: Math.floor(Math.random() * 100),
        hardware: Math.floor(Math.random() * 100),
        process: Math.floor(Math.random() * 100),
        total: 0
    };

    // Calcula total
    contadores.total = Object.values(contadores)
        .reduce((acc, val) => acc + val, 0) - contadores.total;

    // Atualiza os valores na interface
    Object.keys(contadores).forEach(tipo => {
        const elemento = document.querySelector(`.alarm-count-circle.${tipo} .count-value`);
        if (elemento) {
            elemento.textContent = contadores[tipo].toString().padStart(3, '0');
        }
    });
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

// Adiciona atalho de teclado para resetar posições (Ctrl+Shift+R)
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        if (confirm('Deseja resetar as posições do grid para o padrão?')) {
            resetGridPositions();
        }
    }
});

// Adiciona evento de clique para o botão de reset
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔧 Configurando botão de reset...');
    
    // Tenta encontrar o botão com um pequeno delay para garantir que o DOM está pronto
    setTimeout(() => {
        const resetButton = document.getElementById('btn-reset-grid');
        if (resetButton) {
            console.log('✅ Botão de reset encontrado');
            
            // Remove qualquer evento anterior
            resetButton.removeEventListener('click', handleResetClick);
            
            // Adiciona o novo evento
            resetButton.addEventListener('click', handleResetClick);
            
            // Também adiciona um evento de mousedown para debug
            resetButton.addEventListener('mousedown', () => {
                console.log('🖱️ Botão reset mousedown detectado');
            });
            
        } else {
            console.warn('⚠️ Botão de reset não encontrado!');
        }
    }, 100);
});

// Função separada para o handler do clique
function handleResetClick(e) {
    e.preventDefault();
    e.stopPropagation();
    console.log('🔄 Botão reset clicado');
    
    if (confirm('Deseja resetar as posições do grid para o padrão?')) {
        console.log('✅ Usuário confirmou reset');
        resetGridPositions();
    } else {
        console.log('❌ Usuário cancelou reset');
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
