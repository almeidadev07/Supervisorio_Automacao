// Garantia de histórico de velocidade definido
try {
    if (typeof window !== 'undefined') {
        window.speedRealHistory = window.speedRealHistory || [];
        window.speedProgHistory = window.speedProgHistory || [];
    }
} catch(_) {}
// Variáveis globais para histórico de velocidades (usadas em múltiplos handlers)
let speedRealHistory = window.speedRealHistory || [];
let speedProgHistory = window.speedProgHistory || [];
let draggedButton = null;
// timestamp global do último valor válido recebido (socket ou HTTP)
let SPEED_LAST_OK_TS = 0;
let ALARM_LAST_OK_TS = 0; // timestamp do último resumo de alarmes válido
let SPEED_WAS_OFFLINE = false;
let PLC_CONNECTED = true; // estado global de conexão com o PLC
let ENSURE_MACHINE_LAST_TS = 0;
let SPEED_NULL_STREAK = 0; // leituras nulas consecutivas da velocidade real
let LAST_FORCE_RECONNECT_TS = 0; // throttle para /api/force_reconnect
let PLC_OFFLINE_CONFIRMED = false; // flag para confirmar que PLC está realmente offline
// ✅ Torna acessível globalmente para outros scripts (ex: alarm.js)
window.PLC_OFFLINE_CONFIRMED = false;
let PLC_RECONNECT_STABLE_COUNT = 0; // contador de leituras estáveis para confirmar reconexão
let PLC_OFFLINE_TIMESTAMP = 0; // timestamp quando foi marcado como offline
const PLC_RECONNECT_STABLE_THRESHOLD = 3; // precisa de 3 leituras estáveis para considerar reconectado (reduzido de 10 para resposta mais rápida)
const PLC_RECONNECT_MIN_TIME_MS = 5000; // mínimo de 5 segundos offline antes de aceitar reconexão
// Debounce para evitar piscar offline em quedas muito rápidas
const PLC_OFFLINE_DEBOUNCE_MS = 2000; // só considera offline se ficar >2s sem dado/ok
// Sistema de estabilidade para velocidades
const STABILITY_WINDOW = 3; // Mantém últimas 3 leituras para análise
// Intervalos globais para Data/Hora (usados em start/stop antes de definições)
var dateTimeInterval = null;
var serverTimeSyncInterval = null;
var TIME_OFFSET_MS = 0; // server_now - client_now
let POLL_BACKOFF_UNTIL_TS = 0; // backoff dinâmico para polling HTTP
let __pollSpeedLoopWarned = false; // evita spam de log quando já ativo

// Identidade do cliente/tela para o sistema de subscrições do backend
const GRID_CLIENT_ID = 'grid-' + Math.random().toString(36).slice(2, 10);

// Controle de estado para evitar condição de corrida na velocidade programada
let USER_TYPING_VELOCITY = false;
let VELOCITY_WRITE_TIMESTAMP = 0;

// Nome da tag de velocidade
const SPEED_TAG_PRIMARY = 'XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_REAL';
const SPEED_TAG_PROGRAMMED = 'XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG';
// Tags usadas nas leituras
const SPEED_TAGS = [SPEED_TAG_PRIMARY, SPEED_TAG_PROGRAMMED];
const SPEED_TAGS_REAL_ONLY = [SPEED_TAG_PRIMARY];
// Chaves alternativas que podem vir do backend/telemetria
const SPEED_FALLBACK_KEYS = [
    'VEL_REAL', 'VELOC_REAL', 'VELOCIDADE_REAL', 'vel_real', 'veloc_real', 'velocidade_real',
    'SPEED_REAL', 'speed_real', 'speed', 'SPEED'
];

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

// Sistema de persistência de posições do grid (var para evitar TDZ em handlers iniciais)
var GRID_POSITIONS_KEY = 'supervisor_grid_positions';

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

// Trava para só permitir drag após segurar por 1 segundo (var para evitar TDZ quando handlers disparam cedo)
var dragTimeout = null;
var allowDrag = false;
var currentWaitingButton = null;

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
    // Se o alvo estiver dentro de um controle interno que não deve iniciar drag, ignore
    if (e.target && e.target.closest && (e.target.closest('.peripheral-btn') || e.target.closest('.jog-switch') || e.target.closest('label[for="jog1"]') || (e.target.id === 'jog1'))) {
        // Cancela qualquer unlock pendente e garante que não inicia drag
        clearTimeout(dragTimeout);
        allowDrag = false;
        return;
    }
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
        // Bloqueia drag se a origem for um controle interno
        if ((e.target && e.target.closest && (e.target.closest('.peripheral-btn') || e.target.closest('.jog-switch') || e.target.closest('label[for="jog1"]') || (e.target.id === 'jog1'))) || !allowDrag) {
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
    // Garante teclados fechados ao iniciar
    try {
        const kb = document.getElementById('teclado-virtual');
        if (kb) kb.style.display = 'none';
    } catch(_) {}
    try {
        const kbt = document.getElementById('teclado-virtual-texto');
        if (kbt) kbt.style.display = 'none';
    } catch(_) {}
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
    // Atualiza tanto estrutura antiga (#valorReal) quanto a nova (#valorReal .valor)
    const valorEl = document.querySelector('#valorReal .valor');
        const root = document.getElementById('valorReal');
    if (valorEl) valorEl.textContent = Math.round(valorNum);
        if (root) root.textContent = String(Math.round(valorNum));
    const ponteiro = document.getElementById('ponteiroReal');
    if (ponteiro) atualizarPonteiro(ponteiro, valorNum);
    // debug
    // console.debug('[GRID] UI atualizado com valor', valorNum);
}

function mostrarVelocidadeIndisponivel(){
    // Velocidade real
    const valorEl = document.querySelector('#valorReal .valor');
    if (valorEl) {
        valorEl.textContent = '###';
    } else {
        const root = document.getElementById('valorReal');
        if (root) root.textContent = '###';
    }
    const ponteiro = document.getElementById('ponteiroReal');
    if (ponteiro) atualizarPonteiro(ponteiro, 0);
    
    // Velocidade programada
    const velocidadeInput = document.getElementById('velocidadeInput');
    if (velocidadeInput) {
        velocidadeInput.value = '###';
    }
    const ponteiroProg = document.getElementById('ponteiroProg');
    if (ponteiroProg) {
        atualizarPonteiro(ponteiroProg, 0);
    }
}

function pickSpeedValue(obj){
    if (!obj) return null;
    // Retorna estritamente a velocidade real do PLC
    if (obj.hasOwnProperty(SPEED_TAG_PRIMARY)) return obj[SPEED_TAG_PRIMARY];
    // Fallback para chaves alternativas (variações comuns)
    for (const k of SPEED_FALLBACK_KEYS){
        if (obj[k] != null) return obj[k];
        // tenta também em minúsculas
        const kl = k.toLowerCase();
        if (obj[kl] != null) return obj[kl];
    }
    return null;
}

function pickSpeedProgrammedValue(obj){
    if (!obj) return null;
    return obj[SPEED_TAG_PROGRAMMED] || null;
}

// Lê tags via /api/read_tags (GET)
async function fetchTagsWithFallback(tagNames){
    try {
        const qs = encodeURIComponent((tagNames||[]).join(','));
        const r = await fetch('/api/read_tags?names=' + qs, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
        if (r.ok) {
            const res = await r.json();
            if (res && res.ok && res.values) return res.values;
        }
    } catch(err) {
        console.warn('[GRID] Erro ao buscar tags:', err);
    }
    return null;
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

function tryForceReconnect(reason){
    const now = Date.now();
    if (now - LAST_FORCE_RECONNECT_TS < 10000) return; // 10s throttle
    LAST_FORCE_RECONNECT_TS = now;
    try {
        console.warn('[GRID] Forçando reconexão do PLC:', reason || 'sem motivo');
        fetch('/api/force_reconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
            .then(r => r.json())
            .then(res => console.log('[GRID] force_reconnect ->', res))
            .catch(()=>{});
    } catch(_) {}
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
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    timeout: 20000,
                    forceNew: true,
                    transports: ['polling', 'websocket'],
                    upgrade: true,
                    rememberUpgrade: false
                })
            )
        ) : null;
        if (!socket) return false;
        console.log('[GRID] Socket.IO conectado para velocidade real');
        // usar timestamp global
        SPEED_LAST_OK_TS = Date.now();
        
        // Tratamento de erros de conexão
        socket.on('connect_error', (error) => {
            console.log('[GRID] ❌ Erro de conexão Socket.IO:', error);
            const sinceLastOk = Date.now() - (SPEED_LAST_OK_TS || 0);
            if (sinceLastOk >= PLC_OFFLINE_DEBOUNCE_MS) {
                PLC_CONNECTED = false;
                mostrarVelocidadeIndisponivel();
            } else {
                console.log(`[GRID] ⚠️ connect_error breve (${sinceLastOk}ms) ignorado (debounce ${PLC_OFFLINE_DEBOUNCE_MS}ms)`);
            }
        });
        
        socket.on('disconnect', (reason) => {
            console.log('[GRID] 📡 Socket.IO desconectado:', reason);
            const sinceLastOk = Date.now() - (SPEED_LAST_OK_TS || 0);
            if (sinceLastOk >= PLC_OFFLINE_DEBOUNCE_MS) {
                PLC_CONNECTED = false;
                mostrarVelocidadeIndisponivel();
            } else {
                console.log(`[GRID] ⚠️ disconnect breve (${sinceLastOk}ms) ignorado (debounce ${PLC_OFFLINE_DEBOUNCE_MS}ms)`);
            }
        });
        
        socket.on('connect', () => {
            console.log('[GRID] ✅ Socket.IO conectado');
            PLC_CONNECTED = true;
            // Ao conectar/reconectar, força uma leitura imediata
            fetch('/api/read_tags?names=' + encodeURIComponent(SPEED_TAGS.join(',')), { cache: 'no-store' })
                .then(r => r.json())
                .then(res => {
                    if (res && res.ok && res.values) {
                        PLC_CONNECTED = true;
                        try { console.log('[GRID][init HTTP] values=', res.values); } catch(_) {}
                        // Processa velocidade real
                        const valReal = pickSpeedValue(res.values);
                        if (valReal != null) {
                            try { console.log('[GRID][init HTTP] real=', valReal); } catch(_) {}
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
            
            // ✅ PRIORIDADE com DEBOUNCE: Se recebeu status offline, aplica tolerância para quedas rápidas
            if (data.plc_connected === false || data.plc_connected === 'false' || data.plc_connected === 0){
                const sinceLastOk = Date.now() - (SPEED_LAST_OK_TS || 0);
                if (sinceLastOk < PLC_OFFLINE_DEBOUNCE_MS) {
                    console.log(`[GRID] ⚠️ Offline breve (${sinceLastOk}ms) ignorado (debounce ${PLC_OFFLINE_DEBOUNCE_MS}ms)`);
                } else {
                    PLC_CONNECTED = false;
                    PLC_OFFLINE_CONFIRMED = true; // ✅ Confirma que está offline
                    window.PLC_OFFLINE_CONFIRMED = true; // ✅ Sincroniza com variável global
                    PLC_OFFLINE_TIMESTAMP = Date.now(); // ✅ Marca timestamp do momento offline
                    PLC_RECONNECT_STABLE_COUNT = 0; // Reset contador de reconexão
                    mostrarVelocidadeIndisponivel();
                    setAlarmCountsOffline();
                    console.log('[GRID] 📡 PLC desconectado via telemetria - valores bloqueados até reconexão estável');
                    valueStabilityCount = 0; // Reset estabilidade
                }
                // ✅ IMPORTANTE: Retorna ANTES de processar qualquer dado
                return;
            }
            
            // ✅ PROTEÇÃO CRÍTICA: Se está offline confirmado, IGNORA TODOS OS DADOS
            // Mesmo que venha com plc_connected: true, não processa até confirmar reconexão estável
            if (PLC_OFFLINE_CONFIRMED) {
                const timeSinceOffline = Date.now() - PLC_OFFLINE_TIMESTAMP;
                
                // ✅ VERIFICAÇÃO DE TEMPO MÍNIMO: Só aceita reconexão após tempo mínimo
                if (timeSinceOffline < PLC_RECONNECT_MIN_TIME_MS) {
                    console.log(`[GRID] ⏳ Aguardando tempo mínimo de ${PLC_RECONNECT_MIN_TIME_MS/1000}s offline (${(timeSinceOffline/1000).toFixed(1)}s decorridos) - ignorando dados`);
                    return; // Ignora dados se ainda não passou tempo mínimo
                }
                
                // Só processa se recebeu explicitamente plc_connected: true E dados são válidos
                if (data.plc_connected === true || data.plc_connected === 'true' || data.plc_connected === 1) {
                    // Verifica se os dados são válidos (não null/undefined)
                    const val = pickSpeedValue(data);
                    if (val != null && val !== undefined) {
                        PLC_RECONNECT_STABLE_COUNT++;
                        console.log(`[GRID] 🔄 Tentativa de reconexão: ${PLC_RECONNECT_STABLE_COUNT}/${PLC_RECONNECT_STABLE_THRESHOLD} leituras estáveis (${(timeSinceOffline/1000).toFixed(1)}s offline)`);
                        
                        // Só considera reconectado após múltiplas leituras estáveis
                        if (PLC_RECONNECT_STABLE_COUNT >= PLC_RECONNECT_STABLE_THRESHOLD) {
                            PLC_OFFLINE_CONFIRMED = false;
                            window.PLC_OFFLINE_CONFIRMED = false; // ✅ Sincroniza com variável global
                            PLC_RECONNECT_STABLE_COUNT = 0;
                            PLC_OFFLINE_TIMESTAMP = 0;
                            PLC_CONNECTED = true;
                            console.log('[GRID] ✅ PLC reconectado e estável - valores serão restaurados');
                            // ✅ FORÇA ATUALIZAÇÃO IMEDIATA: Limpa histórico e atualiza valores assim que reconecta
                            speedRealHistory = []; // Limpa histórico para forçar atualização imediata
                            speedProgHistory = []; // Limpa histórico de velocidade programada também
                            SPEED_LAST_OK_TS = Date.now(); // Reset timestamp para permitir polling
                            // ✅ ATUALIZAÇÃO IMEDIATA: Força atualização com o valor atual
                            atualizarVelocidadeRealUI(val);
                            lastStableValue = val;
                            // Atualiza velocidade programada também se disponível
                            const valProg = pickSpeedProgrammedValue(data);
                            if (valProg != null) {
                                atualizarVelocidadeProgramadaUI(valProg);
                            }
                            // ✅ ATUALIZAÇÃO IMEDIATA DE ALARMES: Atualiza alarmes assim que reconecta
                            if (data.alarm_summary) {
                                try {
                                    const summary = data.alarm_summary;
                                    const contadores = {
                                        emergency: Number(summary.emergency || 0),
                                        nr12: Number(summary.nr12 || 0),
                                        drives: Number(summary.drives || 0),
                                        thermal: Number(summary.thermal || 0),
                                        hardware: Number(summary.hardware || 0),
                                        process: Number(summary.process || 0),
                                        total: Number(summary.total || 0)
                                    };
                                    
                                    // Atualiza os valores na interface
                                    Object.keys(contadores).forEach(tipo => {
                                        const elemento = document.querySelector(`.alarm-count-circle.${tipo} .count-value`);
                                        const circle = document.querySelector(`.alarm-count-circle.${tipo}`);
                                        
                                        if (elemento) {
                                            const valor = contadores[tipo];
                                            if (typeof valor === 'number' && !isNaN(valor)) {
                                                elemento.textContent = valor.toString().padStart(2, '0');
                                            } else {
                                                elemento.textContent = '00';
                                            }
                                        }
                                        
                                        if (circle) {
                                            if (contadores[tipo] > 0) {
                                                circle.classList.add('has-alarms');
                                            } else {
                                                circle.classList.remove('has-alarms');
                                            }
                                        }
                                    });
                                    
                                    ALARM_LAST_OK_TS = Date.now();
                                    console.log('[GRID] ✅ Alarmes atualizados imediatamente após reconexão');
                                } catch (e) {
                                    console.error('[GRID] ❌ Erro ao atualizar alarmes na reconexão:', e);
                                }
                            }
                            // ✅ FORÇA RECARGA DE ALARMES: Atualiza grid de alarmes quando reconecta
                            try {
                                if (window.carregarAlarmesReais && typeof window.carregarAlarmesReais === 'function') {
                                    console.log('[GRID] ✅ Forçando recarga de alarmes após reconexão');
                                    window.carregarAlarmesReais();
                                } else if (window.currentViewMode === 'instantaneos') {
                                    // Tenta acessar via escopo global se disponível
                                    setTimeout(() => {
                                        try {
                                            if (window.carregarAlarmesReais) window.carregarAlarmesReais();
                                        } catch(_) {}
                                    }, 500);
                                }
                            } catch (e) {
                                console.warn('[GRID] Não foi possível recarregar alarmes automaticamente:', e);
                            }
                            console.log('[GRID] ✅ Valores atualizados imediatamente após reconexão');
                            // Continua processamento abaixo para manter atualização contínua
                        } else {
                            // Ainda não está estável o suficiente - mantém offline
                            console.log(`[GRID] ⏳ Aguardando estabilidade (${PLC_RECONNECT_STABLE_COUNT}/${PLC_RECONNECT_STABLE_THRESHOLD}) - mantendo valores offline`);
                            return; // Não processa dados ainda
                        }
                    } else {
                        // Dados inválidos - reset contador e mantém offline
                        PLC_RECONNECT_STABLE_COUNT = 0;
                        console.log('[GRID] ⚠️ Dados inválidos recebidos durante reconexão - resetando contador');
                        return;
                    }
                } else {
                    // Recebeu dados mas sem confirmação explícita de conexão - ignora
                    console.log('[GRID] ⚠️ Dados recebidos mas PLC ainda está offline confirmado e sem plc_connected:true - ignorando');
                    return;
                }
            }
            
            // Se chegou aqui, ou não estava offline confirmado, ou já confirmou reconexão estável
            PLC_CONNECTED = true;
            try { console.log('[GRID][telemetry] keys=', Object.keys(data)); } catch(_) {}
            
            // ✅ SISTEMA DE ESTABILIDADE INTELIGENTE - Velocidade Real
            const val = pickSpeedValue(data);
            if (val != null) {
                try { console.log('[GRID][telemetry] real=', val); } catch(_) {}
                
                // ✅ IMPORTANTE: Atualiza timestamp SEMPRE que dados chegam
                // Isso evita que watchdog marque como offline
                // Mas só atualiza se não estiver em modo offline confirmado
                if (!PLC_OFFLINE_CONFIRMED) {
                    SPEED_LAST_OK_TS = Date.now();
                }
                SPEED_NULL_STREAK = 0;
                
                // Adiciona ao histórico
                speedRealHistory.push(val);
                if (speedRealHistory.length > STABILITY_WINDOW) {
                    speedRealHistory.shift(); // Remove valor mais antigo
                }
                
                // Atualiza se:
                // 1. Valor é estável (repetiu pelo menos 1x) - rápido para valores consistentes
                // 2. OU valor mudou significativamente (>5%) - detecta mudanças reais
                // 3. OU é a primeira leitura válida
                let shouldUpdate = false;
                
                if (speedRealHistory.length === 1) {
                    // Primeira leitura válida - atualiza imediatamente
                    shouldUpdate = true;
                } else if (speedRealHistory.length >= 2) {
                    const currentVal = speedRealHistory[speedRealHistory.length - 1];
                    const prevVal = speedRealHistory[speedRealHistory.length - 2];
                    
                    // Verifica estabilidade (valor repetiu)
                    const isStable = currentVal === prevVal;
                    
                    // ✅ Verifica mudança significativa (>5% para evitar oscilação por ruído)
                    const percentChange = prevVal !== 0 ? Math.abs((currentVal - prevVal) / prevVal) : 1;
                    const isSignificantChange = percentChange > 0.05; // 5% (aumentado de 3%)
                    
                    shouldUpdate = isStable || isSignificantChange;
                    
                    try {
                        if (isSignificantChange) {
                            console.log(`[GRID][telemetry] 📈 Mudança significativa: ${prevVal} → ${currentVal} (${(percentChange*100).toFixed(1)}%)`);
                        }
                    } catch(_) {}
                }
                
                if (shouldUpdate) {
                    atualizarVelocidadeRealUI(val);
                    lastStableValue = val;
                }
            } else {
                // Valor null - tolera 5 leituras null antes de limpar (aumentado de 2)
                SPEED_NULL_STREAK++;
                if (SPEED_NULL_STREAK > 5) {
                    speedRealHistory = []; // Limpa histórico
                    valueStabilityCount = 0;
                }
            }
            
            // ✅ SISTEMA DE ESTABILIDADE INTELIGENTE - Velocidade Programada
            const valProg = pickSpeedProgrammedValue(data);
            if (valProg != null) {
                try { console.log('[GRID][telemetry] prog=', valProg); } catch(_) {}
                
                // Adiciona ao histórico
                speedProgHistory.push(valProg);
                if (speedProgHistory.length > STABILITY_WINDOW) {
                    speedProgHistory.shift();
                }
                
                // Atualiza com mesma lógica de estabilidade
                let shouldUpdateProg = false;
                
                if (speedProgHistory.length === 1) {
                    shouldUpdateProg = true;
                } else if (speedProgHistory.length >= 2) {
                    const currentVal = speedProgHistory[speedProgHistory.length - 1];
                    const prevVal = speedProgHistory[speedProgHistory.length - 2];
                    
                    const isStable = currentVal === prevVal;
                    const percentChange = prevVal !== 0 ? Math.abs((currentVal - prevVal) / prevVal) : 1;
                    const isSignificantChange = percentChange > 0.05; // 5% (aumentado de 3%)
                    
                    shouldUpdateProg = isStable || isSignificantChange;
                }
                
                if (shouldUpdateProg) {
                    atualizarVelocidadeProgramadaUI(valProg);
                }
            }
            
            // ✅ PROCESSA ALARMES EM TEMPO REAL (SEM FILTRO DE ESTABILIDADE)
            // Alarmes NÃO passam pelo sistema de estabilidade pois precisam atualizar instantaneamente
            // ✅ PROTEÇÃO: Não processa alarmes se está offline confirmado
            if (data.alarm_summary && !PLC_OFFLINE_CONFIRMED) {
                try {
                    const summary = data.alarm_summary;
                    
                    // ✅ PROTEÇÃO: Garante valores numéricos válidos (evita "##")
                    const contadores = {
                        emergency: Number(summary.emergency || 0),
                        nr12: Number(summary.nr12 || 0),
                        drives: Number(summary.drives || 0),
                        thermal: Number(summary.thermal || 0),
                        hardware: Number(summary.hardware || 0),
                        process: Number(summary.process || 0),
                        total: Number(summary.total || 0)
                    };
                    
                    // Atualiza os valores na interface
                    Object.keys(contadores).forEach(tipo => {
                        const elemento = document.querySelector(`.alarm-count-circle.${tipo} .count-value`);
                        const circle = document.querySelector(`.alarm-count-circle.${tipo}`);
                        
                        if (elemento) {
                            // ✅ PROTEÇÃO: Valida que é número antes de formatar
                            const valor = contadores[tipo];
                            if (typeof valor === 'number' && !isNaN(valor)) {
                                elemento.textContent = valor.toString().padStart(2, '0');
                            } else {
                                elemento.textContent = '00'; // Fallback seguro
                            }
                        }
                        
                        if (circle) {
                            if (contadores[tipo] > 0) {
                                circle.classList.add('has-alarms');
                            } else {
                                circle.classList.remove('has-alarms');
                            }
                        }
                    });
                    
                    ALARM_LAST_OK_TS = Date.now();
                    
                    // Log apenas se houver alarmes ativos (reduz poluição)
                    const totalAlarmes = contadores.total || 0;
                    if (totalAlarmes > 0) {
                        console.log(`[GRID][telemetry] 🚨 ${totalAlarmes} alarmes ativos`);
                    }
                } catch (e) {
                    console.error('[GRID][telemetry] ❌ Erro ao atualizar alarmes:', e);
                }
            }
        });
        // Quando reconectar, faça uma leitura imediata por HTTP para repopular
        socket.on('plc_connection_changed', (s) => {
            console.log('[GRID] 🔔 Estado do PLC mudou:', s);
            if (s && s.connected){
                // ✅ Não marca como conectado imediatamente - aguarda confirmação estável
                console.log('[GRID] 🔄 PLC reporta conexão - aguardando confirmação estável...');
                PLC_RECONNECT_STABLE_COUNT = 0; // Reset contador
                // ✅ IMPORTANTE: NÃO reseta PLC_OFFLINE_CONFIRMED aqui - deixa o sistema de confirmação fazer isso
                // PLC_OFFLINE_CONFIRMED será resetado apenas após 10 leituras estáveis no evento telemetry
                // Não marca PLC_CONNECTED = true ainda - aguarda telemetry confirmar
                // ✅ IMPORTANTE: Só faz leitura HTTP se não está offline confirmado
                // O sistema de confirmação via telemetry vai fazer a reconexão
                if (!PLC_OFFLINE_CONFIRMED) {
                    fetch('/api/read_tags?names=' + encodeURIComponent(SPEED_TAGS.join(',')), { cache: 'no-store' })
                        .then(r => r.json())
                        .then(res => {
                            if (res && res.ok && res.values) {
                                // ✅ VERIFICAÇÃO: Não atualiza se ficou offline durante o fetch
                                if (PLC_OFFLINE_CONFIRMED) {
                                    console.log('[GRID] ⚠️ PLC ficou offline durante leitura HTTP de reconexão - cancelando');
                                    return;
                                }
                                
                                PLC_CONNECTED = true;
                                try { console.log('[GRID][reconnect HTTP] values=', res.values); } catch(_) {}
                                // Processa velocidade real
                                const valReal = pickSpeedValue(res.values);
                                if (valReal != null) {
                                    try { console.log('[GRID][reconnect HTTP] real=', valReal); } catch(_) {}
                                    atualizarVelocidadeRealUI(valReal);
                                    SPEED_NULL_STREAK = 0;
                                    if (SPEED_WAS_OFFLINE) {
                                        SPEED_WAS_OFFLINE = false;
                                        console.log('[GRID] ✅ Reconectado (sem reload automático)');
                                        // ✅ DESABILITADO: Reload automático causava oscilação
                                        // setTimeout(() => window.location.reload(), 100);
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
                } else {
                    console.log('[GRID] ⚠️ PLC ainda está offline confirmado - não fazendo leitura HTTP de reconexão');
                }
                ensureMachineSelected();
            }
            else if (s && s.connected === false) {
                const sinceLastOk = Date.now() - (SPEED_LAST_OK_TS || 0);
                if (sinceLastOk < PLC_OFFLINE_DEBOUNCE_MS) {
                    console.log(`[GRID] ⚠️ Offline breve via evento ( ${sinceLastOk}ms ) ignorado (debounce ${PLC_OFFLINE_DEBOUNCE_MS}ms)`);
                } else {
                    PLC_CONNECTED = false;
                    PLC_OFFLINE_CONFIRMED = true; // ✅ Confirma offline
                    window.PLC_OFFLINE_CONFIRMED = true; // ✅ Sincroniza com variável global
                    PLC_OFFLINE_TIMESTAMP = Date.now(); // ✅ Marca timestamp do momento offline
                    PLC_RECONNECT_STABLE_COUNT = 0; // Reset contador
                    mostrarVelocidadeIndisponivel();
                    setAlarmCountsOffline();
                }
                if (s.reason === 'Address out of range errors') {
                    console.log(`[GRID] ⏳ PLC em cooldown por ${s.cooldown}s devido a erros de Address out of range`);
                } else {
                    console.log('[GRID] 📡 PLC desconectado via notificação');
                }
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
        // ✅ WATCHDOG DESABILITADO: Causava oscilação e reloads desnecessários
        // Confia na lógica de estabilidade e cache do DataHub
        if (window.supervisorSpeedWatchdog) clearInterval(window.supervisorSpeedWatchdog);
        
        // Watchdog MUITO permissivo apenas para casos extremos (2 minutos sem dados)
        window.supervisorSpeedWatchdog = setInterval(() => {
            if (Date.now() - SPEED_LAST_OK_TS > 120000) {  // 2 minutos (era 60s)
                console.warn('[GRID] ⚠️ Watchdog: >2min sem dados de velocidade');
                // Não mostra "###", apenas loga - confia no cache
                // mostrarVelocidadeIndisponivel();
            }
        }, 30000); // Verifica a cada 30 segundos (era 10s)
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
    const input = e.target.closest('.velocimetro-input') || e.target;
    if (input) {
        // Marca que o usuário está digitando se for o campo de velocidade programada
        if (input.id === 'velocidadeInput') {
            USER_TYPING_VELOCITY = true;
        }
        input.focus();
        // Posicionamento do teclado numérico: agora é fixo no rodapé, então basta mostrar
        const rect = input.getBoundingClientRect();
        // Só exibe após definir o target, para evitar flash inicial
        teclado.style.display = "grid";
        // Mantém dataset.target para que as funções usem o input correto
        teclado.dataset.target = input.id || (input.id = 'kbd-' + Math.random().toString(36).slice(2,8));
        deveSubstituir = true;
        valorDigitado = "";
    }
}

function fecharTeclado() {
    const input = document.getElementById(teclado.dataset.target);
    if (input) {
        input.blur();
        let valor = parseInt(valorDigitado, 10);
        if (isNaN(valor)) {
            valor = parseInt(input.value, 10);
        }
        if (isNaN(valor)) valor = 0;
        valor = Math.min(SPEED_MAX, Math.max(0, valor));
        input.value = valor;
        // Dispara eventos para telas que salvam no change
        try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch(_) {}
        try { input.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
        const ponteiro = input.closest('.draggable-btn')?.querySelector?.('.ponteiro');
        if (ponteiro) atualizarPonteiro(ponteiro, valor);
        // Escreve no PLC se for o campo de velocidade programada
        if (input.id === 'velocidadeInput') {
            escreverVelocidadeProgramada(valor);
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
    if (!input) return;
    if (valorDigitado === "" || deveSubstituir) {
        valorDigitado = num.toString();
        deveSubstituir = false;
    } else if (valorDigitado.length < 3) {
        valorDigitado += num;
    }
    // Atualiza o input visivelmente enquanto digita
    input.value = valorDigitado;
}

// Novo: apagar último dígito no teclado numérico
function apagarUltimoNumero() {
    const input = document.getElementById(teclado.dataset.target);
    if (!input) return;
    if (valorDigitado === "" && input.value) {
        valorDigitado = String(input.value);
    }
    valorDigitado = valorDigitado.slice(0, -1);
    input.value = valorDigitado;
}

// Novo: limpar totalmente a entrada no teclado numérico
function limparEntradaTeclado() {
    const input = document.getElementById(teclado.dataset.target);
    if (!input) return;
    valorDigitado = "";
    input.value = "";
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
    // ✅ PROTEÇÃO: Não atualiza alarmes se está offline confirmado
    if (PLC_OFFLINE_CONFIRMED) {
        console.log('[GRID ALARM] ⚠️ PLC offline confirmado - bloqueando atualização de alarmes via HTTP');
        return;
    }
    
    try {
        const res = await fetch('/api/alarms', { cache: 'no-store' }).then(r => r.json());
        console.log('[GRID ALARM] Resposta da API /api/alarms:', res);
        
        if (!res) throw new Error('no response');
        // Se o backend indicar desconexão, mantém '##' e sai
        if (res.connected === false || res.plc_connected === false || res.offline === true) {
            console.log('[GRID ALARM] Backend indica desconexão');
            setAlarmCountsOffline();
            tryForceReconnect('alarms indicou desconexão');
            return;
        }
        if (!res.ok) throw new Error(res && res.error ? res.error : 'API error');

        const summary = res.alarm_summary;
        console.log('[GRID ALARM] Resumo de alarmes:', summary);
        console.log('[GRID ALARM] Total de alarmes ativos:', res.active_alarms ? res.active_alarms.length : 0);
        
        // Se não houver resumo válido, considera offline para não sobrescrever '##' com '00'
        if (!summary || typeof summary !== 'object') {
            console.log('[GRID ALARM] Resumo inválido');
            setAlarmCountsOffline();
            return;
        }
        const contadores = {
            emergency: Number(summary.emergency || 0),
            nr12: Number(summary.nr12 || 0),
            drives: Number(summary.drives || 0),
            thermal: Number(summary.thermal || 0),
            hardware: Number(summary.hardware || 0),
            process: Number(summary.process || 0),
            total: Number(summary.total || 0)
        };

        console.log('[GRID ALARM] Contadores calculados:', contadores);

        // Atualiza os valores na interface
        Object.keys(contadores).forEach(tipo => {
            const elemento = document.querySelector(`.alarm-count-circle.${tipo} .count-value`);
            const circle = document.querySelector(`.alarm-count-circle.${tipo}`);
            if (elemento) {
                const digits = 2;
                elemento.textContent = contadores[tipo].toString().padStart(digits, '0');
                console.log(`[GRID ALARM] ✓ Atualizado círculo '${tipo}': ${contadores[tipo]}`);
            } else {
                console.log(`[GRID ALARM] ✗ Elemento não encontrado para '${tipo}'`);
            }
            if (circle) {
                if (contadores[tipo] > 0) {
                    circle.classList.add('has-alarms');
                    console.log(`[GRID ALARM] ✓ Círculo '${tipo}' marcado com has-alarms`);
                } else {
                    circle.classList.remove('has-alarms');
                }
            }
        });

        // Marca momento de atualização bem-sucedida e conexão ativa
        PLC_CONNECTED = true;
        ALARM_LAST_OK_TS = Date.now();

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
                e.stopPropagation();
                
                // Extrai o tipo do círculo (prioriza data-type, depois classe CSS)
                let tipo = (circle.getAttribute('data-type') || '').toLowerCase();
                if (!tipo) {
                    // Tenta extrair da classe CSS
                    const classes = Array.from(circle.classList);
                    const tipoClass = classes.find(c => 
                        ['emergency', 'nr12', 'drives', 'thermal', 'hardware', 'process', 'total', 'alimentador'].includes(c)
                    );
                    if (tipoClass) tipo = tipoClass.toLowerCase();
                }
                
                // Mapeia tipos especiais para abas válidas
                const tipoMap = {
                    'total': 'todas',
                    'alimentador': 'todas' // Alimentador não tem aba específica, abre todas
                };
                const prioridade = tipoMap[tipo] || tipo;
                
                console.log(`[GRID] Clicado no círculo de alarme: tipo="${tipo}" -> prioridade="${prioridade}"`);
                
                try {
                    if (window.showAlarm) {
                        // Define a aba desejada para a tela de alarmes
                        window.__desiredAlarmTab = prioridade;
                        console.log(`[GRID] ✅ Aba desejada definida: "${prioridade}"`);
                        // Abre a tela de alarmes; seleção ocorrerá imediatamente dentro de showAlarm
                        window.showAlarm(e);
                        return;
                    } else {
                        console.error('[GRID] ❌ window.showAlarm não está disponível');
                    }
                } catch(err) {
                    console.error('[GRID] Erro ao abrir tela de alarmes:', err);
                }
                
                // Fallback com hash e recarregar
                try { window.__desiredAlarmTab = prioridade; } catch(_) {}
                window.location.hash = `#alarms-${prioridade}`;
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
        // Em perda de comunicação, mostra placeholder '##' para todos os tipos
        setAlarmCountsOffline();
    }
}

// Delegação global: garante que clique nos círculos abra a tela de alarmes
(function bindAlarmCircleClicksOnce(){
    if (window.__alarmCircleDelegationBound) return;
    window.__alarmCircleDelegationBound = true;
    document.addEventListener('click', (e) => {
        try {
            const circle = e.target && e.target.closest ? e.target.closest('.alarm-count-circle') : null;
            if (!circle) return;
            e.preventDefault();
            e.stopPropagation();
            let tipo = (circle.getAttribute('data-type') || '').toLowerCase();
            if (!tipo) {
                const classes = Array.from(circle.classList || []);
                const tipoClass = classes.find(c =>
                    ['emergency','nr12','drives','thermal','hardware','process','total','alimentador'].includes(c)
                );
                if (tipoClass) tipo = tipoClass.toLowerCase();
            }
            const tipoMap = { total: 'todas', alimentador: 'todas' };
            const prioridade = tipoMap[tipo] || tipo || 'todas';
            console.log(`[GRID_DELEGATION] Clicado no círculo: tipo="${tipo}" -> prioridade="${prioridade}"`);
            window.__desiredAlarmTab = prioridade;
            console.log(`[GRID_DELEGATION] ✅ Aba desejada definida: "${prioridade}"`);
            if (window.showAlarm && typeof window.showAlarm === 'function') {
                // Define aba desejada e abre imediatamente; seleção ocorre dentro de showAlarm sem delay
                window.showAlarm(e);
            } else {
                console.error('[GRID_DELEGATION] ❌ window.showAlarm não está disponível, usando fallback');
                // Fallback
                window.location.hash = `#alarms-${prioridade}`;
                window.location.reload();
            }
        } catch(err) {
            console.error('[GRID] Erro no clique do círculo de alarme:', err);
        }
    }, true);
})();

function setAlarmCountsOffline(){
    const tipos = ['emergency','nr12','drives','thermal','hardware','process','total','alimentador'];
    tipos.forEach(tipo => {
        const elemento = document.querySelector(`.alarm-count-circle.${tipo} .count-value`);
        if (elemento) elemento.textContent = '##';
        const circle = document.querySelector(`.alarm-count-circle.${tipo}`);
        if (circle) circle.classList.remove('has-alarms');
    });
}

// Flag global para evitar múltiplas inicializações
let __velocimetroInicializado = false;
let __pollSpeedLoopAtivo = false;
let __alarmWatchdogInterval = null;

// Modificar a função inicializarVelocimetro para incluir a atualização dos contadores
function inicializarVelocimetro() {
    // ✅ PROTEÇÃO: Evita múltiplas inicializações
    if (__velocimetroInicializado) {
        console.warn('[GRID] ⚠️ inicializarVelocimetro já foi executado. Ignorando chamada duplicada.');
        return;
    }
    __velocimetroInicializado = true;
    
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
            let valorInicial = 0;
            const valorEl = btn.querySelector('#valorReal') || btn.querySelector('.valor');
            if (valorEl && typeof valorEl.textContent === 'string') {
                const parsed = parseInt(valorEl.textContent, 10);
                valorInicial = isNaN(parsed) ? 0 : parsed;
            }
            atualizarPonteiro(ponteiro, valorInicial);
        }
    });

    // Tenta receber por Socket.IO; se não houver, faz fallback por HTTP
    // Liga Socket.IO (se disponível) 
    bindTelemetryVelocidadeReal();
    // Subscreve tags necessárias para este grid e mantém heartbeat
    try {
        fetch('/api/subscribe_tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: GRID_CLIENT_ID, tags: [SPEED_TAG_PRIMARY, SPEED_TAG_PROGRAMMED] })
        }).then(()=>{
            if (window.__gridHeartbeat) clearInterval(window.__gridHeartbeat);
            window.__gridHeartbeat = setInterval(() => {
                fetch('/api/heartbeat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ client_id: GRID_CLIENT_ID })
                }).catch(()=>{});
            }, 10000);
        }).catch(()=>{});
    } catch(_) {}
    
    // Polling HTTP ultra-otimizado: trabalha com cache do backend e reduz carga no PLC
    let consecutiveFailures = 0;
    let lastSuccessfulRead = 0;
    let adaptiveInterval = 5000; // Intervalo adaptativo base - aumentado para reduzir carga
    let lastStableValue = null; // Último valor estável conhecido
    let valueStabilityCount = 0; // Contador de estabilidade do valor
    let minStabilityCount = 1; // Reduzido para 1 - máximo responsivo
    let connectionStableCount = 0; // Contador de estabilidade da conexão
    
    // ✅ SISTEMA DE ESTABILIDADE INTELIGENTE - Evita oscilações na UI
    // STABILITY_WINDOW, speedRealHistory e speedProgHistory já estão definidos globalmente
    let lastConnectionState = null; // Último estado de conexão conhecido
    let valuePersistenceTime = 0; // Timestamp do último valor válido
    let maxPersistenceTime = 30000; // 30 segundos de persistência de valores
    
    function isGridVisible(){
        try {
            const el = document.getElementById('grid-container');
            return !!(el && el.offsetParent !== null && getComputedStyle(el).display !== 'none');
        } catch(_) { return true; }
    }
    
    async function pollSpeedLoop(){
        // ✅ PROTEÇÃO: Evita múltiplos loops concorrentes
        if (__pollSpeedLoopAtivo) {
            // Silencia avisos repetidos; apenas retorna
            return;
        }
        
        // ✅ PROTEÇÃO CRÍTICA: Se PLC está offline confirmado, NÃO faz polling
        if (PLC_OFFLINE_CONFIRMED) {
            console.log('[GRID] ⚠️ PLC offline confirmado - bloqueando polling HTTP');
            __pollSpeedLoopAtivo = false;
            setTimeout(pollSpeedLoop, 5000); // Tenta novamente em 5s
            return;
        }
        
        __pollSpeedLoopAtivo = true;
        
        const now = Date.now();
        
        // Ajusta intervalo baseado na estabilidade
        if (consecutiveFailures === 0 && now - lastSuccessfulRead < 5000) {
            adaptiveInterval = Math.max(3000, adaptiveInterval - 100); // Acelera se estável (mínimo 3s)
        } else if (consecutiveFailures > 0) {
            adaptiveInterval = Math.min(8000, adaptiveInterval + 500); // Desacelera se instável (máximo 8s)
        }
        
        // Jitter para evitar sincronização
        const jitter = Math.floor(Math.random() * 300) - 150;
        const nextDelay = Math.max(2000, adaptiveInterval + jitter); // Mínimo 2 segundos

        try {
            if (!isGridVisible()) {
                __pollSpeedLoopAtivo = false;
                setTimeout(pollSpeedLoop, Math.max(2000, nextDelay));
                return;
            }
            
            // Se recebeu dados recentes via socket, pula esta rodada
            if (now - SPEED_LAST_OK_TS <= 3000) {
                __pollSpeedLoopAtivo = false;
                setTimeout(pollSpeedLoop, nextDelay);
                return;
            }
            
            // ✅ VERIFICAÇÃO ADICIONAL: Se ficou offline durante o fetch, cancela
            if (PLC_OFFLINE_CONFIRMED) {
                console.log('[GRID] ⚠️ PLC ficou offline durante fetch - cancelando atualização');
                __pollSpeedLoopAtivo = false;
                setTimeout(pollSpeedLoop, 5000);
                return;
            }
            
            // Lê tanto a velocidade real quanto a programada para manter ambas atualizadas
            const values = await fetchTagsWithFallback(SPEED_TAGS);
            
            // ✅ VERIFICAÇÃO APÓS FETCH: Se ficou offline durante o fetch, cancela
            if (PLC_OFFLINE_CONFIRMED) {
                console.log('[GRID] ⚠️ PLC ficou offline após fetch - cancelando atualização');
                __pollSpeedLoopAtivo = false;
                setTimeout(pollSpeedLoop, 5000);
                return;
            }
            
            if (values && Object.keys(values).length > 0) {
                // Sistema de estabilidade de conexão
                if (lastConnectionState === true) {
                    connectionStableCount++;
                } else {
                    connectionStableCount = 1;
                    lastConnectionState = true;
                }
                
                // ✅ VERIFICAÇÃO: Não marca como conectado se está offline confirmado
                if (!PLC_OFFLINE_CONFIRMED) {
                    // Só marca como conectado após 2 leituras consecutivas bem-sucedidas
                    if (connectionStableCount >= 2) {
                        PLC_CONNECTED = true;
                        consecutiveFailures = 0;
                        lastSuccessfulRead = now;
                    }
                } else {
                    // Se está offline confirmado, não atualiza valores mesmo que receba dados
                    console.log('[GRID] ⚠️ Dados recebidos via HTTP mas PLC está offline confirmado - ignorando');
                    __pollSpeedLoopAtivo = false;
                    setTimeout(pollSpeedLoop, 5000);
                    return;
                }
                
                try { console.log('[GRID][poll] values=', values); } catch(_) {}
                
                const valReal = pickSpeedValue(values);
                    if (valReal != null) {
                    // ✅ VERIFICAÇÃO FINAL: Não atualiza se está offline confirmado
                    if (PLC_OFFLINE_CONFIRMED) {
                        console.log('[GRID] ⚠️ Tentativa de atualizar velocidade mas PLC está offline confirmado - bloqueando');
                        __pollSpeedLoopAtivo = false;
                        setTimeout(pollSpeedLoop, 5000);
                        return;
                    }
                    
                    try { console.log('[GRID][poll] real=', valReal); } catch(_) {}
                    
                    // Sistema de estabilidade: só atualiza UI se valor for estável
                    if (lastStableValue === valReal) {
                        valueStabilityCount++;
                    } else {
                        valueStabilityCount = 1;
                        lastStableValue = valReal;
                    }
                    
                    // Atualiza UI imediatamente e mantém persistência
                        atualizarVelocidadeRealUI(valReal);
                    valuePersistenceTime = now; // Atualiza timestamp de persistência
                    SPEED_NULL_STREAK = 0;
                    SPEED_LAST_OK_TS = now;
                    
                        if (SPEED_WAS_OFFLINE) {
                            SPEED_WAS_OFFLINE = false;
                        console.log('[GRID] ✅ Reconectado via HTTP (sem reload)');
                        // ✅ DESABILITADO: Reload automático
                        // setTimeout(() => window.location.reload(), 100);
                    }
                } else {
                    SPEED_NULL_STREAK++;
                    valueStabilityCount = 0; // Reset estabilidade em caso de null
                    connectionStableCount = 0; // Reset estabilidade de conexão
                    lastConnectionState = false;
                    
                    // ✅ TOLERÂNCIA MÁXIMA: 20 nulls antes de marcar offline (antes 8)
                    if (SPEED_NULL_STREAK >= 20) {
                        console.warn('[GRID] ⚠️ 20+ leituras null consecutivas');
                        PLC_CONNECTED = false;
                        mostrarVelocidadeIndisponivel();
                        tryForceReconnect('velocidade real null repetido');
                        SPEED_NULL_STREAK = 0;
                    }
                }
                
                // ✅ VERIFICAÇÃO: Não atualiza velocidade programada se está offline confirmado
                if (!PLC_OFFLINE_CONFIRMED) {
                    // Atualiza a velocidade programada quando disponível
                    const valProg = pickSpeedProgrammedValue(values);
                    if (valProg != null) atualizarVelocidadeProgramadaUI(valProg);
                }
                
                } else {
                    consecutiveFailures++;
                connectionStableCount = 0; // Reset estabilidade de conexão
                lastConnectionState = false;
                console.log(`[GRID] ⚠️ Falha de leitura #${consecutiveFailures}`);
                
                // ✅ Sistema de fallback: EXTREMAMENTE tolerante - 30 falhas (antes 10)
                if (consecutiveFailures >= 30) {
                    console.warn('[GRID] ⚠️ 30+ falhas consecutivas de leitura');
                    // Só mostra "###" se não há valor estável conhecido E passou do tempo de persistência
                    if (!lastStableValue || (now - valuePersistenceTime > maxPersistenceTime)) {
                        mostrarVelocidadeIndisponivel();
                        PLC_CONNECTED = false;
                        SPEED_WAS_OFFLINE = true;
                    }
                    tryForceReconnect('falha de leitura repetida');
                }
            }
        } catch(error) {
                consecutiveFailures++;
            connectionStableCount = 0; // Reset estabilidade de conexão
            lastConnectionState = false;
            console.log(`[GRID] ❌ Erro de rede #${consecutiveFailures}:`, error);
            
            // ✅ Sistema de fallback: EXTREMAMENTE tolerante - 30 falhas (antes 10)
            if (consecutiveFailures >= 30) {
                console.warn('[GRID] ⚠️ 30+ erros consecutivos de rede');
                // Só mostra "###" se não há valor estável conhecido E passou do tempo de persistência
                if (!lastStableValue || (now - valuePersistenceTime > maxPersistenceTime)) {
                    mostrarVelocidadeIndisponivel();
                    PLC_CONNECTED = false;
                    SPEED_WAS_OFFLINE = true;
                }
                tryForceReconnect('erro de rede nas leituras');
            }
        } finally {
            __pollSpeedLoopAtivo = false;
            setTimeout(pollSpeedLoop, nextDelay);
        }
    }
    
    // Inicia polling após 1 segundo
    setTimeout(pollSpeedLoop, 1000);
    // Sincroniza SPEED_MAX e dispara uma leitura imediata para preencher a UI rapidamente
    syncSpeedMaxFromServer().catch(()=>{});
    fetchTagsWithFallback(SPEED_TAGS)
        .then(values => {
            if (values) {
                PLC_CONNECTED = true;
                try { console.log('[GRID][post-sync] values=', values); } catch(_) {}
                const valReal = pickSpeedValue(values);
                if (valReal != null) {
                    try { console.log('[GRID][post-sync] real=', valReal); } catch(_) {}
                    atualizarVelocidadeRealUI(valReal);
                }
                const valProg = pickSpeedProgrammedValue(values);
                if (valProg != null) atualizarVelocidadeProgramadaUI(valProg);
            }
        })
        .catch(() => {});

    // ✅ DESABILITADO: Polling HTTP de alarmes - Agora 100% via SocketIO
    // O polling HTTP estava COMPETINDO com SocketIO e sobrescrevendo valores corretos com "##"
    // Alarmes agora são atualizados EXCLUSIVAMENTE via SocketIO (telemetry event)
    
    /*
    // ANTIGO: Polling HTTP a cada 2s (DESABILITADO)
    setInterval(() => {
        atualizarContadoresAlarme();
        if (Date.now() - ALARM_LAST_OK_TS > 120000) {
            console.warn('[GRID] ⚠️ Watchdog: >120s sem dados de alarmes');
            setAlarmCountsOffline();
        }
    }, 2000);
    */
    
    // Watchdog de alarmes: marca offline se ficar tempo demais sem dados
    // Limpa watchdog anterior se existir
    if (__alarmWatchdogInterval) clearInterval(__alarmWatchdogInterval);
    __alarmWatchdogInterval = setInterval(() => {
        const sinceMs = Date.now() - ALARM_LAST_OK_TS;
        if (sinceMs > 60000) {  // 60s sem dados de alarmes
            console.warn('[GRID] ⚠️ Sem dados de alarmes há >60s. Marcando grid de alarmes como offline (##).');
            try { setAlarmCountsOffline(); } catch(_) {}
        }
    }, 30000); // Checa a cada 30s
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
    // Garante teclados fechados também após load completo
    try { const kb = document.getElementById('teclado-virtual'); if (kb) kb.style.display = 'none'; } catch(_) {}
    try { const kbt = document.getElementById('teclado-virtual-texto'); if (kbt) kbt.style.display = 'none'; } catch(_) {}
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
        // Só intercepta se a tela do grid estiver ativa
        try {
            const grid = document.getElementById('grid-container');
            const gridVisible = grid && window.getComputedStyle(grid).display !== 'none' && grid.offsetParent !== null;
            if (!gridVisible) {
                console.log('⛔ Interceptação do reset ignorada: tela inicial não está ativa');
                return;
            }
        } catch(_) {}
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
    
    // Garante que o reset só funcione na tela inicial (grid)
    try {
        const grid = document.getElementById('grid-container');
        const gridVisible = grid && window.getComputedStyle(grid).display !== 'none' && grid.offsetParent !== null;
        if (!gridVisible) {
            console.log('⛔ Reset bloqueado: tela inicial não está ativa');
            return;
        }
    } catch(_) {}

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

// Fecha teclados ao mudar de aba/visibilidade
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        try { const kb = document.getElementById('teclado-virtual'); if (kb) kb.style.display = 'none'; } catch(_) {}
        try { const kbt = document.getElementById('teclado-virtual-texto'); if (kbt) kbt.style.display = 'none'; } catch(_) {}
    }
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

// ========== Função para atualizar Data e Hora ==========
// (variáveis globais já declaradas no topo para evitar TDZ)

function updateDateTime() {
    console.log('🕒 Executando updateDateTime...');
    
    // Usar a data/hora do servidor Windows (via offset) com fallback local
    const now = new Date(Date.now() + (Number.isFinite(TIME_OFFSET_MS) ? TIME_OFFSET_MS : 0));
    
    // Verificar se a data é válida (proteção contra erros de sistema)
    if (isNaN(now.getTime())) {
        console.error('❌ Data inválida detectada, usando data padrão');
        return;
    }
    
    // Formatar data (DD/MM/AAAA) - formato brasileiro
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const dateString = `${day}/${month}/${year}`;
    
    // Formatar hora (HH:MM:SS) - formato 24h
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timeString = `${hours}:${minutes}:${seconds}`;
    
    // Atualizar elementos no DOM
    const dateElement = document.getElementById('current-date');
    const timeElement = document.getElementById('current-time');
    
    console.log('🔍 Procurando elementos:', {
        dateElement: dateElement,
        timeElement: timeElement,
        dateString: dateString,
        timeString: timeString
    });
    
    if (dateElement) {
        dateElement.textContent = dateString;
        console.log('✅ Data atualizada:', dateString);
    } else {
        console.error('❌ Elemento current-date não encontrado!');
    }
    
    if (timeElement) {
        timeElement.textContent = timeString;
        console.log('✅ Hora atualizada:', timeString);
    } else {
        console.error('❌ Elemento current-time não encontrado!');
    }
    
    // Debug log com timestamp formatado
    const systemTime = now.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    console.log(`🕒 Data/Hora renderizada: ${systemTime}`);
}

// Função de teste para verificar se os elementos existem
function testDateTimeElements() {
    console.log('🧪 Testando elementos de data/hora...');
    
    const dateElement = document.getElementById('current-date');
    const timeElement = document.getElementById('current-time');
    
    if (dateElement) {
        console.log('✅ Elemento current-date encontrado:', dateElement);
        dateElement.textContent = 'TESTE DATA';
    } else {
        console.error('❌ Elemento current-date NÃO encontrado!');
    }
    
    if (timeElement) {
        console.log('✅ Elemento current-time encontrado:', timeElement);
        timeElement.textContent = 'TESTE HORA';
    } else {
        console.error('❌ Elemento current-time NÃO encontrado!');
    }
}

// Função para sincronizar com o servidor (opcional)
async function syncWithServerTime() {
    try {
        const response = await fetch('/api/time', { 
            method: 'GET',
            cache: 'no-cache',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
        
        if (response.ok) {
            const serverTime = await response.text();
            const serverDate = new Date(serverTime);
            
            if (!isNaN(serverDate.getTime())) {
                const clientNow = Date.now();
                TIME_OFFSET_MS = serverDate.getTime() - clientNow;
                console.log('🔄 Sincronizado com servidor. OFFSET(ms)=', TIME_OFFSET_MS);
                return serverDate;
            }
        }
    } catch (error) {
        console.log('⚠️ Servidor não disponível, usando data local do navegador');
    }
    
    TIME_OFFSET_MS = 0;
    return new Date(); // Fallback para data local
}

function startDateTimeUpdate() {
    console.log('🚀 Iniciando atualização de data/hora...');
    
    // Limpar intervalo anterior se existir
    if (dateTimeInterval) {
        clearInterval(dateTimeInterval);
    }
    if (serverTimeSyncInterval) {
        clearInterval(serverTimeSyncInterval);
    }
    
    // Testar se os elementos existem primeiro
    testDateTimeElements();
    
    // Aguardar um pouco para garantir que o DOM esteja pronto
    setTimeout(() => {
        console.log('⏰ Executando primeira atualização...');
        // Sincroniza imediatamente com o servidor antes do primeiro render
        syncWithServerTime().finally(() => updateDateTime());
        
        // Atualizar a cada segundo com alta precisão
        dateTimeInterval = setInterval(updateDateTime, 1000);
        console.log('✅ Intervalo de atualização configurado');
    }, 100);
    
    // Sincronizar com servidor a cada 30 segundos (opcional)
    serverTimeSyncInterval = setInterval(async () => {
        await syncWithServerTime();
    }, 30000);
    
    console.log('🕒 Iniciado atualização de data/hora sincronizada com Windows');
}

function stopDateTimeUpdate() {
    if (dateTimeInterval) {
        clearInterval(dateTimeInterval);
        dateTimeInterval = null;
        console.log('🕒 Parado atualização de data/hora');
    }
    if (serverTimeSyncInterval) {
        clearInterval(serverTimeSyncInterval);
        serverTimeSyncInterval = null;
    }
}

// Inicializar data/hora mesmo se o script carregar após DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        startDateTimeUpdate();
    });
} else {
    // DOM já pronto
    startDateTimeUpdate();
}

// Exportar funções para uso global
window.startDateTimeUpdate = startDateTimeUpdate;
window.stopDateTimeUpdate = stopDateTimeUpdate;
window.testDateTimeElements = testDateTimeElements;
window.updateDateTime = updateDateTime;

// Função para testar manualmente no console
window.testDateTime = function() {
    console.log('🧪 Teste manual de data/hora iniciado...');
    testDateTimeElements();
    setTimeout(() => {
        updateDateTime();
    }, 1000);
};

// ================== Jog Acumuladora (bit 13 de XLCLASS_DB901_ESTEIRA_INLINE_COMANDOS) ==================
const TAG_JOG_INLINE = 'XLCLASS_DB901_ESTEIRA_INLINE_COMANDOS';
const JOG_BIT_INDEX = 13;
let jogAcPollInterval = null;

function bitIsSet(word, bit) {
    return ((Number(word) >>> bit) & 1) === 1;
}

async function readJogWord() {
    try {
        const res = await fetch('/api/read_tags?names=' + encodeURIComponent(TAG_JOG_INLINE), { cache: 'no-store' });
        const data = await res.json();
        if (data && data.ok && data.values && typeof data.values[TAG_JOG_INLINE] !== 'undefined') {
            return Number(data.values[TAG_JOG_INLINE]);
        }
    } catch(_) {}
    return null;
}

async function writeJogBitOne() {
    try {
        // Usa endpoint dedicado para garantir read-modify-write no backend
        let res = await fetch('/api/write_word_bit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: TAG_JOG_INLINE, bit: JOG_BIT_INDEX, mode: 'set', pure: true })
        });
        let text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { data = null; }
        console.log('[JOG] write_word_bit resp (set pure):', data || text, 'status=', res.status);
        if (data && data.ok) return true;

        // Fallback: pulso puro
        res = await fetch('/api/write_word_bit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: TAG_JOG_INLINE, bit: JOG_BIT_INDEX, mode: 'pulse', pulse_ms: 600, pure: true })
        });
        text = await res.text();
        try { data = JSON.parse(text); } catch { data = null; }
        console.log('[JOG] write_word_bit resp (pulse pure fallback):', data || text, 'status=', res.status);
        return !!(data && data.ok);
    } catch(e) { console.error('[JOG] erro na escrita:', e); return false; }
}

// Alterna o bit: se está 1 -> clear, se 0 -> set (ambos modo 'pure' para não depender do word atual)
async function writeJogBitToggle() {
    try {
        // Lê estado atual para decidir fallback se necessário
        const before = await readJogWord();
        const wasOn = before != null ? bitIsSet(before, JOG_BIT_INDEX) : null;
        // Define explicitamente o estado alvo (0/1) no backend
        let res = await fetch('/api/write_word_bit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: TAG_JOG_INLINE, bit: JOG_BIT_INDEX, mode: 'state', value: wasOn ? 0 : 1, pure: false })
        });
        let text = await res.text();
        let data; try { data = JSON.parse(text); } catch { data = null; }
        console.log('[JOG] state resp:', data || text, 'status=', res.status);
        if (data && data.ok && typeof data.value !== 'undefined') {
            // Se a intenção era limpar, insista com bursts curtos de clear puro para vencer o scan do PLC
            if (wasOn === true && Number(data.value) === 1) {
                try {
                    for (let i=0;i<5;i++){
                        const res2 = await fetch('/api/write_word_bit', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: TAG_JOG_INLINE, bit: JOG_BIT_INDEX, mode: 'clear', pure: true })
                        });
                        console.log('[JOG] burst clear pure try', i+1, 'status=', res2.status);
                        await new Promise(r => setTimeout(r, 40));
                    }
                } catch(_) {}
                setTimeout(syncJogFromPLC, 120);
                return true;
            }
            setJogUIActive(!!data.value);
            setTimeout(syncJogFromPLC, 120);
            return true;
        }
        return false;
    } catch(e) { console.error('[JOG] erro na escrita (toggle):', e); return false; }
}

function setJogUIActive(active) {
    const jog = document.getElementById('jog1');
    if (!jog) return;
    try { jog.checked = !!active; } catch(_) {}
    const wrapper = jog.closest('.jog-switch');
    if (wrapper) wrapper.classList.toggle('active', !!active);
}

async function syncJogFromPLC() {
    const word = await readJogWord();
    if (word === null) return;
    const on = bitIsSet(word, JOG_BIT_INDEX);
    setJogUIActive(on);
}

function setupJogAcumuladora() {
    const jog = document.getElementById('jog1');
    if (!jog) { setTimeout(setupJogAcumuladora, 200); return; }
    const jogLabel = document.querySelector('label[for="jog1"]');
    const jogWrap = jog.closest('.jog-switch');

    // Evita iniciar drag ao interagir com o toggle
    ['pointerdown','mousedown','click','pointerup','mouseup','touchstart','touchend'].forEach(evt => {
        [jog, jogLabel, jogWrap].forEach(el => {
            if (!el) return;
            el.addEventListener(evt, (e) => {
                try { e.stopPropagation(); e.stopImmediatePropagation(); } catch(_) {}
                const parent = el.closest && el.closest('.draggable-btn');
                if (evt === 'pointerdown' || evt === 'mousedown' || evt === 'touchstart') {
                    if (parent) parent.removeAttribute('draggable');
                } else if (evt === 'pointerup' || evt === 'mouseup' || evt === 'touchend') {
                    if (parent) setTimeout(() => parent.setAttribute('draggable','true'), 120);
                }
            }, { passive: false });
        });
    });

    // Clique envia comando (escreve 1) e depois sincroniza via leitura
    if (!jog.dataset.bound) {
        jog.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try { jog.disabled = true; } catch(_) {}
            const ok = await writeJogBitToggle();
            if (!ok) {
                // feedback simples de erro
                try { const w = jog.closest('.jog-switch'); if (w) { const prev = w.style.outline; w.style.outline = '2px solid #dc3545'; setTimeout(()=>{ w.style.outline = prev; }, 600); } } catch(_) {}
            }
            try { jog.disabled = false; } catch(_) {}
        });
        if (jogLabel) {
            jogLabel.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                try { jog.disabled = true; } catch(_) {}
                const ok = await writeJogBitToggle();
                if (!ok) {
                    try { const w = jog.closest('.jog-switch'); if (w) { const prev = w.style.outline; w.style.outline = '2px solid #dc3545'; setTimeout(()=>{ w.style.outline = prev; }, 600); } } catch(_) {}
                }
                try { jog.disabled = false; } catch(_) {}
            });
        }
        jog.dataset.bound = '1';
    }

    // Sincroniza estado inicial e inicia polling leve
    syncJogFromPLC();
    if (jogAcPollInterval) clearInterval(jogAcPollInterval);
    jogAcPollInterval = setInterval(syncJogFromPLC, 400);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupJogAcumuladora);
} else {
    setTimeout(setupJogAcumuladora, 0);
}

// ================== Periféricos (9 botões) ==================
const PERIPHERALS_STATE_KEY = 'grid_peripherals_state';

function loadPeripheralsState() {
    try {
        const raw = localStorage.getItem(PERIPHERALS_STATE_KEY);
        if (!raw) return {};
        const obj = JSON.parse(raw);
        return (obj && typeof obj === 'object') ? obj : {};
    } catch (_) { return {}; }
}

function savePeripheralsState(state) {
    try {
        localStorage.setItem(PERIPHERALS_STATE_KEY, JSON.stringify(state || {}));
    } catch (_) {}
}

function applyPeripheralVisual(button, enabled) {
    if (!button) return;
    const on = !!enabled;
    // Evita estados visuais em botões-ícone para não sobrescrever imagem/tamanho
    if (button.classList.contains('btn-icon')) return;
    // classe antiga
    button.classList.toggle('toggled', on);
    // classe com design de histórico
    button.classList.toggle('active', on);
}

function initPeripherals() {
    const container = document.querySelector('.draggable-btn[data-station="botao-9"]');
    if (!container) return;

    const state = loadPeripheralsState();
    // Espera os elementos internos existirem se ainda não montaram
    let buttons = container.querySelectorAll('.peripheral-btn');
    if (!buttons || buttons.length === 0) {
        // tenta novamente após curto atraso
        setTimeout(initPeripherals, 100);
        return;
    }
    if (!buttons || buttons.length === 0) return;

    buttons.forEach(btn => {
        let role = btn.getAttribute('data-role') || btn.id || '';
        // normaliza ids novos
        if (role === 'btn-ovoscopia-toggle') role = 'ovoscopia';
        if (role === 'btn-crack-toggle') role = 'crack';

        // Evita que o clique/mousedown nos botões internos inicie drag do grid
        btn.addEventListener('mousedown', (ev) => {
            ev.stopPropagation();
            const parent = btn.closest('.draggable-btn');
            if (parent) parent.removeAttribute('draggable');
        });
        btn.addEventListener('pointerdown', (ev) => {
            ev.stopPropagation();
            const parent = btn.closest('.draggable-btn');
            if (parent) parent.removeAttribute('draggable');
        });
        btn.addEventListener('mouseup', (ev) => {
            ev.stopPropagation();
            const parent = btn.closest('.draggable-btn');
            if (parent) setTimeout(() => parent.setAttribute('draggable', 'true'), 120);
        });
        btn.addEventListener('pointerup', (ev) => {
            ev.stopPropagation();
            const parent = btn.closest('.draggable-btn');
            if (parent) setTimeout(() => parent.setAttribute('draggable', 'true'), 120);
        });
        // Acessibilidade: tecla Enter/Space também alterna
        btn.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                btn.click();
            }
        });
        const enabled = !!state[role];
        applyPeripheralVisual(btn, enabled);
        // aplica design semelhante ao botão de histórico (tema azul ativo) somente quando não for ícone
        // não aplicar alarm-toggle aos ícones (sem borda/sombra)

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (role === 'ovoscopia') {
                // Toggle visual e alterna texto/ícone Ovoscopia <-> Magna Visio
                const wasEnabled = !!state[role];
                const nowEnabled = !wasEnabled;
                state[role] = nowEnabled;
                // Não aplicar visual states para botões-ícone
                const label = document.getElementById('label-ovoscopia');
                if (label) label.textContent = nowEnabled ? 'Magna Visio' : 'Ovoscopia';
                // Aplica nova imagem diretamente
                btn.style.setProperty('background', (nowEnabled
                    ? 'url(/static/images/pages/icons/comandos/icone_habilita_verde_invertido.png)'
                    : 'url(/static/images/pages/icons/comandos/icone_habilita_azul.png)') + ' center/contain no-repeat', 'important');
                savePeripheralsState(state);
                // micro-efeito de clique (sem delay na troca de imagem)
                btn.style.transform = 'scale(0.98)';
                setTimeout(() => { btn.style.transform = ''; }, 50);
            } else if (role === 'crack') {
                // Toggle habilitado/desabilitado com persistência
                const wasEnabled = !!state[role];
                const nowEnabled = !wasEnabled;
                state[role] = nowEnabled;
                // Não aplicar visual states para botões-ícone
                const label = document.getElementById('label-crack');
                if (label) label.textContent = 'Crack';
                // Aplica nova imagem diretamente
                btn.style.setProperty('background', (nowEnabled
                    ? 'url(/static/images/pages/icons/comandos/icone_habilita_verde_invertido.png)'
                    : 'url(/static/images/pages/icons/comandos/icone_habilita_desabilitado.png)') + ' center/contain no-repeat', 'important');
                savePeripheralsState(state);
                // micro-efeito de clique (sem delay na troca de imagem)
                btn.style.transform = 'scale(0.98)';
                setTimeout(() => { btn.style.transform = ''; }, 50);
            } else {
                // Demais botões: apenas alterna visual/persistência genérica
                const wasEnabled = !!state[role];
                const nowEnabled = !wasEnabled;
                state[role] = nowEnabled;
                applyPeripheralVisual(btn, nowEnabled);
                savePeripheralsState(state);
                btn.style.transform = 'scale(0.98)';
                setTimeout(() => { btn.style.transform = ''; }, 80);
            }
        });

        // Ajusta labels/ícones iniciais
        if (role === 'ovoscopia') {
            const label = document.getElementById('label-ovoscopia');
            if (label) label.textContent = enabled ? 'Magna Visio' : 'Ovoscopia';
            // Aplica imagem inicial diretamente
            btn.style.setProperty('background', (enabled
                ? 'url(/static/images/pages/icons/comandos/icone_habilita_verde_invertido.png)'
                : 'url(/static/images/pages/icons/comandos/icone_habilita_azul.png)') + ' center/contain no-repeat', 'important');
        } else if (role === 'crack') {
            const label = document.getElementById('label-crack');
            if (label) label.textContent = 'Crack';
            // Aplica imagem inicial diretamente
            btn.style.setProperty('background', (enabled
                ? 'url(/static/images/pages/icons/comandos/icone_habilita_verde_invertido.png)'
                : 'url(/static/images/pages/icons/comandos/icone_habilita_desabilitado.png)') + ' center/contain no-repeat', 'important');
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPeripherals);
} else {
    // DOM já disponível
    setTimeout(initPeripherals, 0);
}

// ========== Delegation de segurança para Jog (garante captura mesmo se bindings falharem) ==========
document.addEventListener('click', async function(e){
    try{
        const t = e.target;
        if(!t) return;
        const isJogEl = (t.id === 'jog1') || (t.closest && (t.closest('label[for="jog1"]') || t.closest('.jog-switch')));
        if(!isJogEl) return;
        e.preventDefault();
        e.stopPropagation();
        console.log('[JOG] delegation click capturado');
        const ok = await writeJogBitOne();
        if(!ok){ console.warn('[JOG] delegation: escrita falhou'); }
        await syncJogFromPLC();
    }catch(_){ /* noop */ }
}, true);

// Helpers para teste manual no console
window.writeJogBitOne = writeJogBitOne;
window.syncJogFromPLC = syncJogFromPLC;
window.setupJogAcumuladora = setupJogAcumuladora;

// ========== Resumo do Gráfico no Grid 10 ==========
(function setupMiniClassesChart() {
    let miniChart = null;

    function ensureChartJs() {
        return new Promise((resolve, reject) => {
            if (typeof window.Chart !== 'undefined') return resolve();
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
            script.onload = () => (typeof window.Chart !== 'undefined') ? resolve() : reject(new Error('Chart não disponível'));
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    function getPLCNamesOrNull() {
        try {
            const arr = Array.isArray(window.classificationLabels) ? window.classificationLabels : null;
            if (!arr || arr.length < 7) return null;
            return arr
                .filter(l => /^C[1-7]$/.test(l.id))
                .sort((a,b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))
                .map(l => (l.name && l.name !== l.id) ? l.name : l.id);
        } catch(_) { return null; }
    }

    function getDataFromSummary(summary) {
        const plcNames = getPLCNamesOrNull();
        const labels = plcNames || (summary || []).map(s => s.className);
        const real = (summary || []).map(s => s.real || 0);
        const prog = (summary || []).map(s => s.programmed || 0);
        const colors = (summary || []).map(s => s.color || '#888');
        return { labels, real, prog, colors };
    }

    function createMiniChart(summary) {
        const canvas = document.getElementById('mini-classes-chart');
        if (!canvas) return;
        const ctx = canvas.getContext && canvas.getContext('2d');
        if (!ctx) return;

        const { labels, real, prog, colors } = getDataFromSummary(summary);

        if (miniChart) { miniChart.destroy(); miniChart = null; }
        miniChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Real', data: real, backgroundColor: '#6c757d', borderColor: '#495057', borderWidth: 1, borderRadius: 6, barPercentage: 0.9, categoryPercentage: 0.9 },
                    { label: 'Prog.', data: prog, backgroundColor: colors, borderColor: colors, borderWidth: 1, borderRadius: 6, barPercentage: 0.9, categoryPercentage: 0.9 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                layout: {
                    padding: { top: 4, bottom: 4, left: 4, right: 4 }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#2c3e50', font: { size: 10, weight: 'bold' } } },
                    y: {
                        beginAtZero: true,
                        min: 0,
                        max: 700,
                        title: { display: false },
                        grid: { display: true, color: 'rgba(0,0,0,0.08)' },
                        ticks: { stepSize: 100, color: '#2c3e50', font: { size: 9 } }
                    }
                },
                animation: { duration: 400 }
            }
        });
    }

    function updateMiniChart(summary) {
        if (!miniChart) return createMiniChart(summary);
        const { labels, real, prog, colors } = getDataFromSummary(summary);
        miniChart.data.labels = labels;
        miniChart.data.datasets[0].data = real;
        miniChart.data.datasets[1].data = prog;
        miniChart.data.datasets[1].backgroundColor = colors;
        miniChart.data.datasets[1].borderColor = colors;
        miniChart.update('none');
    }

    function initOnce() {
        const canvas = document.getElementById('mini-classes-chart');
        if (!canvas) return;
        ensureChartJs().then(() => {
            const summary = (typeof window.getGraphicsSummary === 'function') ? window.getGraphicsSummary() : [];
            createMiniChart(summary);
            window.addEventListener('graphics-data-updated', (e) => updateMiniChart(e && e.detail));
            // Atualiza labels assim que a classificação fornecer nomes
            window.addEventListener('classification-labels-updated', () => {
                try { updateMiniChart((typeof window.getGraphicsSummary === 'function') ? window.getGraphicsSummary() : []); } catch(_) {}
            });
            // Clique no mini-gráfico abre a tela completa de gráficos
            try {
                const container = document.querySelector('.mini-classes-chart-container');
                if (container && !container.dataset.openBind) {
                    container.style.cursor = 'pointer';
                    container.addEventListener('click', function() {
                        if (typeof window.showGraphics === 'function') {
                            window.showGraphics();
                        }
                    });
                    container.dataset.openBind = '1';
                }
            } catch(_) { /* noop */ }
        }).catch((e) => console.warn('Mini chart: falha ao carregar Chart.js', e));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initOnce);
    } else {
        setTimeout(initOnce, 0);
    }
})();
