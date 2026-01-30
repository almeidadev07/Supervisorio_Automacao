// washer.js - Versão Corrigida baseada no input.js funcional

// ============================================
// GERENCIAMENTO DE INTERVALOS E EVENT LISTENERS
// ============================================
// Arrays para rastrear todos os intervalos e listeners criados
let washerIntervals = [];
let washerEventListeners = [];

// Função auxiliar para registrar intervalos
function registerWasherInterval(intervalId) {
    washerIntervals.push(intervalId);
    return intervalId;
}

// Função auxiliar para registrar event listeners
function registerWasherEventListener(element, event, handler) {
    if (element) {
        element.addEventListener(event, handler);
        washerEventListeners.push({ element, event, handler });
    }
}

// Função de cleanup - CRÍTICA para evitar vazamento de memória
function cleanupWasher() {
    console.log('[WASHER] 🧹 Iniciando cleanup...');
    
    // Limpa todos os intervalos
    washerIntervals.forEach(intervalId => {
        if (intervalId) {
            clearInterval(intervalId);
            console.log('[WASHER] ✅ Intervalo limpo:', intervalId);
        }
    });
    washerIntervals = [];
    
    // Remove todos os event listeners registrados
    washerEventListeners.forEach(({ element, event, handler }) => {
        if (element) {
            element.removeEventListener(event, handler);
        }
    });
    washerEventListeners = [];
    
    console.log('[WASHER] ✅ Cleanup concluído');
}

// Exporta a função de cleanup globalmente
window.cleanupWasher = cleanupWasher;

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
    
    const gaugeInputHandler = () => {
        const val = slider.value;
        console.log(`📊 Atualizando ${sliderId} para: ${val}%`);
        
        valueText.textContent = `${val}%`;
        limiteText.textContent = `${val}%`;
        
        // Esta é a sintaxe correta que funciona no input.js
        gauge.style.background = `conic-gradient(#00cc66 0% ${val}%, #eee ${val}% 100%)`;
    };
    registerWasherEventListener(slider, "input", gaugeInputHandler);
    
    // Inicializa com valor 0
    const initialVal = slider.value;
    valueText.textContent = `${initialVal}%`;
    limiteText.textContent = `${initialVal}%`;
    gauge.style.background = `conic-gradient(#00cc66 0% ${initialVal}%, #eee ${initialVal}% 100%)`;
}

function inicializarWasher() {
    console.log('🚀 Tela Lavadora Inicializada');
    
    // CRÍTICO: Limpa intervalos e listeners anteriores para evitar duplicação
    cleanupWasher();
    
    // Inicializa bindings do Sugador de Gotas
    setupSugadorBindings();
    setupAquecedor1Bindings();
    setupAquecedor2Bindings();
    setupAutoLimpezaBindings();
}

function getBit(value, bit) {
    return ((Number(value) >>> 0) & (1 << bit)) !== 0;
}

function setupAquecedor1Bindings() {
    const root = document.getElementById('aquecedor-1');
    if (!root) return;
    const imgGray = root.querySelector('.motor-gray');
    const imgGreen = root.querySelector('.motor-green');
    const imgBlue = root.querySelector('.motor-blue');
    const imgRed = root.querySelector('.motor-red');
    const imgPowerOn = root.querySelector('.power-on');
    const imgPowerOff = root.querySelector('.power-off');

    const TAG_CMD = 'LS400_DB31_AQUECEDOR_1_CMD';
    const TAG_ALM = 'LS400_DB31_AQUECEDOR_1_ALARMES_BAIXO';

    let isToggling = false;
    let desiredRunState = null; // true=ligar, false=desligar, null=sem alvo
    let desiredSinceMs = 0;
    let retriedOnce = false;
    let vCmdLast = 0;           // última WORD conhecida do CMD
    let currentRun = false;     // último estado conhecido do bit8

    function renderByTags(values) {
        if (isToggling) {
            // Evita piscada durante escrita otimista
            return;
        }
        const vCmd = Number(values[TAG_CMD] || 0) >>> 0;
        const vAlm = Number(values[TAG_ALM] || 0) >>> 0;

        const bitRun = ((vCmd >> 8) & 1) === 1;   // ligado
        const bitOk  = ((vCmd >> 15) & 1) === 1;  // OK
        const bitAlm = ((vAlm >> 9) & 1) === 1;   // vermelho

        // Atualiza cache somente quando não está em toggle
        vCmdLast = vCmd;
        currentRun = bitRun;

        // Estabilização: durante janela curta, mantém UI e tenta 1 reescrita se PLC discordar
        if (desiredRunState !== null) {
            const elapsed = Date.now() - desiredSinceMs;
            if (bitRun !== desiredRunState && elapsed < 2500) {
                // Mantém UI como desejado sem piscar
                imgPowerOn.style.display = desiredRunState ? 'block' : 'none';
                imgPowerOff.style.display = desiredRunState ? 'none' : 'block';
                if (desiredRunState) {
                    imgRed.style.display = 'none';
                    imgBlue.style.display = 'block';
                    imgGreen.style.display = 'none';
                    imgGray.style.display = 'none';
                } else {
                    imgBlue.style.display = 'none';
                    if (!bitAlm && !bitOk) imgGray.style.display = 'block';
                }
                if (!retriedOnce) {
                    retriedOnce = true;
                    // Reescreve uma vez para forçar estado desejado
                    (async () => {
                        try {
                            // reescreve a partir do último valor conhecido, preservando demais bits
                            let v2 = vCmdLast >>> 0;
                            if (desiredRunState) v2 = (v2 | (1 << 8)) >>> 0; else v2 = (v2 & ~(1 << 8)) >>> 0;
                            await writeTag(TAG_CMD, v2);
                            vCmdLast = v2;
                        } catch (_) {}
                    })();
                }
                return; // não deixa o resto do render sobrepor o estado estável
            } else if (elapsed >= 2500) {
                // encerra janela de estabilização
                desiredRunState = null;
                retriedOnce = false;
            }
        }

        // Prioridade: vermelho > azul (rodando) > verde (ok) > cinza
        imgRed.style.display = bitAlm ? 'block' : 'none';
        imgBlue.style.display = (!bitAlm && bitRun) ? 'block' : 'none';
        imgGreen.style.display = (!bitAlm && !bitRun && bitOk) ? 'block' : 'none';
        imgGray.style.display = (!bitAlm && !bitRun && !bitOk) ? 'block' : 'none';

        imgPowerOn.style.display = bitRun ? 'block' : 'none';
        imgPowerOff.style.display = bitRun ? 'none' : 'block';

        // Exibe a linha de botões após primeiro render para evitar flash
        const controlsRow = root.querySelector('.controls-row');
        if (controlsRow && controlsRow.style.visibility !== 'visible') {
            controlsRow.style.visibility = 'visible';
        }
    }

    // Toggle Liga/Desliga (bit8)
    const doToggle = async () => {
        try {
            isToggling = true;
            // Define alvo com base no último estado conhecido, evitando XOR baseado em leitura transitória
            desiredRunState = !currentRun;
            desiredSinceMs = Date.now();
            retriedOnce = false;
            // Calcula novo valor preservando os demais bits
            let v = vCmdLast >>> 0;
            v = desiredRunState ? ((v | (1 << 8)) >>> 0) : ((v & ~(1 << 8)) >>> 0);
            await writeTag(TAG_CMD, v);
            vCmdLast = v;
            currentRun = desiredRunState;
            // Atualiza UI localmente para resposta imediata
            const bitRunLocal = desiredRunState;
            imgPowerOn.style.display = bitRunLocal ? 'block' : 'none';
            imgPowerOff.style.display = bitRunLocal ? 'none' : 'block';
            // Estado do motor durante escrita: prioriza azul ao ligar; cinza ao desligar (se sem alarme/ok)
            if (bitRunLocal) {
                imgRed.style.display = 'none';
                imgGreen.style.display = 'none';
                imgBlue.style.display = 'block';
                imgGray.style.display = 'none';
            } else {
                imgBlue.style.display = 'none';
                // fallback visual seguro
                if (imgRed.style.display !== 'block' && imgGreen.style.display !== 'block') {
                    imgGray.style.display = 'block';
                }
            }
            // Garantia forte: tenta até fixar o bit no PLC (retries com backoff curto)
            const ensureRunState = async (target) => {
                const maxAttempts = 8;
                for (let i = 0; i < maxAttempts; i++) {
                    await new Promise(r => setTimeout(r, 120));
                    const read = await readTags([TAG_CMD]);
                    const w = Number(read[TAG_CMD] || 0) >>> 0;
                    const run = ((w >> 8) & 1) === 1;
                    vCmdLast = w;
                    if (run === target) {
                        currentRun = run;
                        return true;
                    }
                    // reescreve mantendo demais bits
                    let nw = w >>> 0;
                    nw = target ? ((nw | (1 << 8)) >>> 0) : ((nw & ~(1 << 8)) >>> 0);
                    await writeTag(TAG_CMD, nw);
                    vCmdLast = nw;
                }
                return false;
            };
            await ensureRunState(bitRunLocal);
            // leitura final para render
            const after = await readTags([TAG_CMD, TAG_ALM]);
            renderByTags(after);
            isToggling = false;
        } catch (e) {
            console.error('Erro no toggle Aquecedor 1:', e);
            isToggling = false;
        }
    };
    const powerToggle = root.querySelector('.power-toggle');
    registerWasherEventListener(powerToggle, 'click', doToggle);
    const powerOnImg = root.querySelector('.power-on');
    const powerOffImg = root.querySelector('.power-off');
    registerWasherEventListener(powerOnImg, 'click', doToggle);
    registerWasherEventListener(powerOffImg, 'click', doToggle);

    // Exibe controles imediatamente para permitir clique sem esperar primeiro polling
    const controlsRow = root.querySelector('.controls-row');
    if (controlsRow) controlsRow.style.visibility = 'visible';

    // Primeira renderização imediata
    readTags([TAG_CMD, TAG_ALM]).then(renderByTags).catch(()=>{
        const controlsRow = root.querySelector('.controls-row');
        if (controlsRow) controlsRow.style.visibility = 'visible';
    });

    // Poll tags e renderiza - REGISTRADO para cleanup
    let aquecedor1InFlight = false;
    const aquecedor1IntervalId = setInterval(async () => {
        if (aquecedor1InFlight) return;
        aquecedor1InFlight = true;
        try {
            const values = await readTags([TAG_CMD, TAG_ALM]);
            renderByTags(values);
        } finally {
            aquecedor1InFlight = false;
        }
    }, 1000);
    registerWasherInterval(aquecedor1IntervalId);
}
async function readTags(names) {
    const res = await fetch(`/api/read_tags?names=${encodeURIComponent(names.join(','))}`, { cache: 'no-store' }).then(r=>r.json()).catch(()=>null);
    if (!res || !res.ok || !res.values) return {};
    return res.values;
}

async function writeTag(name, value) {
    await fetch('/api/write_tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [name]: value })
    }).catch(()=>{});
}

function setupSugadorBindings() {
    const root = document.getElementById('sugador-gotas');
    if (!root) return;
    const imgGray = root.querySelector('.motor-gray');
    const imgGreen = root.querySelector('.motor-green');
    const imgBlue = root.querySelector('.motor-blue');
    const imgRed = root.querySelector('.motor-red');
    const imgAuto = root.querySelector('.mode-auto');
    const imgManual = root.querySelector('.mode-manual');
    const imgPowerOn = root.querySelector('.power-on');
    const imgPowerOff = root.querySelector('.power-off');

    const TAG_CMD = 'LS400_DB50_SUGADOR_GOTAS_CMD';
    const TAG_ALM = 'LS400_DB50_SUGADOR_GOTAS_ALARMES_BAIXO';

    function renderByTags(values) {
        const vCmd = Number(values[TAG_CMD] || 0) >>> 0;
        const vAlm = Number(values[TAG_ALM] || 0) >>> 0;

        const bitAuto = getBit(vCmd, 5);
        const bitRun = getBit(vCmd, 8);
        const bitOk = getBit(vCmd, 15);
        const bitAlm = getBit(vAlm, 8);

        // Prioridade do motor: vermelho (alarme) > verde (ok) > azul (em execução) > cinza
        imgRed.style.display = bitAlm ? 'block' : 'none';
        imgGreen.style.display = (!bitAlm && bitOk) ? 'block' : 'none';
        imgBlue.style.display = (!bitAlm && !bitOk && bitRun) ? 'block' : 'none';
        imgGray.style.display = (!bitAlm && !bitOk && !bitRun) ? 'block' : 'none';

        // Auto/Manual (bit5): 1=Auto, 0=Manual
        imgAuto.style.display = bitAuto ? 'block' : 'none';
        imgManual.style.display = bitAuto ? 'none' : 'block';

        // Power (bit8): 1=Ligado, 0=Desligado
        imgPowerOn.style.display = bitRun ? 'block' : 'none';
        imgPowerOff.style.display = bitRun ? 'none' : 'block';

        // Exibe a linha de botões após primeiro render para evitar flash
        const controlsRow = root.querySelector('.controls-row');
        if (controlsRow && controlsRow.style.visibility !== 'visible') {
            controlsRow.style.visibility = 'visible';
        }
    }

    // Toggle Auto/Manual (bit5)
    const modeToggleHandler = async () => {
        const values = await readTags([TAG_CMD]);
        let v = Number(values[TAG_CMD] || 0) >>> 0;
        v = v ^ (1 << 5);
        await writeTag(TAG_CMD, v);
        const after = await readTags([TAG_CMD, TAG_ALM]);
        renderByTags(after);
    };
    registerWasherEventListener(root.querySelector('.mode-toggle'), 'click', modeToggleHandler);

    // Toggle Liga/Desliga (bit8)
    const powerToggleHandler = async () => {
        const values = await readTags([TAG_CMD]);
        let v = Number(values[TAG_CMD] || 0) >>> 0;
        v = v ^ (1 << 8);
        await writeTag(TAG_CMD, v);
        const after = await readTags([TAG_CMD, TAG_ALM]);
        renderByTags(after);
    };
    registerWasherEventListener(root.querySelector('.power-toggle'), 'click', powerToggleHandler);

    // Poll tags e renderiza - REGISTRADO para cleanup
    let sugadorInFlight = false;
    const sugadorIntervalId = setInterval(async () => {
        if (sugadorInFlight) return;
        sugadorInFlight = true;
        try {
            const values = await readTags([TAG_CMD, TAG_ALM]);
            renderByTags(values);
        } finally {
            sugadorInFlight = false;
        }
    }, 1000);
    registerWasherInterval(sugadorIntervalId);
}

function setupAquecedor2Bindings() {
    const root = document.getElementById('aquecedor-2');
    if (!root) return;
    const imgGray = root.querySelector('.motor-gray');
    const imgGreen = root.querySelector('.motor-green');
    const imgBlue = root.querySelector('.motor-blue');
    const imgRed = root.querySelector('.motor-red');
    const imgPowerOn = root.querySelector('.power-on');
    const imgPowerOff = root.querySelector('.power-off');

    const TAG_CMD = 'LS400_DB32_AQUECEDOR_2_CMD';
    const TAG_ALM = 'LS400_DB32_AQUECEDOR_2_ALARMES_BAIXO';

    let isToggling = false;
    let desiredRunState = null;
    let desiredSinceMs = 0;
    let retriedOnce = false;
    let vCmdLast = 0;
    let currentRun = false;

    function renderByTags(values) {
        if (!values) return;
        if (isToggling) return;
        const vCmd = Number(values[TAG_CMD] || 0) >>> 0;
        const vAlm = Number(values[TAG_ALM] || 0) >>> 0;

        const bitRun = ((vCmd >> 8) & 1) === 1;
        const bitOk  = ((vCmd >> 15) & 1) === 1;
        const bitAlm = ((vAlm >> 9) & 1) === 1;

        vCmdLast = vCmd;
        currentRun = bitRun;

        if (desiredRunState !== null) {
            const elapsed = Date.now() - desiredSinceMs;
            if (bitRun !== desiredRunState && elapsed < 2500) {
                imgPowerOn.style.display = desiredRunState ? 'block' : 'none';
                imgPowerOff.style.display = desiredRunState ? 'none' : 'block';
                if (desiredRunState) {
                    imgRed.style.display = 'none';
                    imgBlue.style.display = 'block';
                    imgGreen.style.display = 'none';
                    imgGray.style.display = 'none';
                } else {
                    imgBlue.style.display = 'none';
                    if (!bitAlm && !bitOk) imgGray.style.display = 'block';
                }
                if (!retriedOnce) {
                    retriedOnce = true;
                    (async () => {
                        try {
                            let v2 = vCmdLast >>> 0;
                            if (desiredRunState) v2 = (v2 | (1 << 8)) >>> 0; else v2 = (v2 & ~(1 << 8)) >>> 0;
                            await writeTag(TAG_CMD, v2);
                            vCmdLast = v2;
                        } catch (_) {}
                    })();
                }
                return;
            } else if (elapsed >= 2500) {
                desiredRunState = null;
                retriedOnce = false;
            }
        }

        imgRed.style.display = bitAlm ? 'block' : 'none';
        imgBlue.style.display = (!bitAlm && bitRun) ? 'block' : 'none';
        imgGreen.style.display = (!bitAlm && !bitRun && bitOk) ? 'block' : 'none';
        imgGray.style.display = (!bitAlm && !bitRun && !bitOk) ? 'block' : 'none';

        imgPowerOn.style.display = bitRun ? 'block' : 'none';
        imgPowerOff.style.display = bitRun ? 'none' : 'block';

        const controlsRow = root.querySelector('.controls-row');
        if (controlsRow && controlsRow.style.visibility !== 'visible') {
            controlsRow.style.visibility = 'visible';
        }
    }

    const doToggle = async () => {
        try {
            isToggling = true;
            desiredRunState = !currentRun;
            desiredSinceMs = Date.now();
            retriedOnce = false;
            let v = vCmdLast >>> 0;
            v = desiredRunState ? ((v | (1 << 8)) >>> 0) : ((v & ~(1 << 8)) >>> 0);
            await writeTag(TAG_CMD, v);
            vCmdLast = v;
            currentRun = desiredRunState;

            const bitRunLocal = desiredRunState;
            imgPowerOn.style.display = bitRunLocal ? 'block' : 'none';
            imgPowerOff.style.display = bitRunLocal ? 'none' : 'block';
            if (bitRunLocal) {
                imgRed.style.display = 'none';
                imgGreen.style.display = 'none';
                imgBlue.style.display = 'block';
                imgGray.style.display = 'none';
            } else {
                imgBlue.style.display = 'none';
                if (imgRed.style.display !== 'block' && imgGreen.style.display !== 'block') {
                    imgGray.style.display = 'block';
                }
            }

            const ensureRunState = async (target) => {
                const maxAttempts = 8;
                for (let i = 0; i < maxAttempts; i++) {
                    await new Promise(r => setTimeout(r, 120));
                    const read = await readTags([TAG_CMD]);
                    if (!read) continue;
                    const w = Number(read[TAG_CMD] || 0) >>> 0;
                    const run = ((w >> 8) & 1) === 1;
                    vCmdLast = w;
                    if (run === target) { currentRun = run; return true; }
                    let nw = w >>> 0;
                    nw = target ? ((nw | (1 << 8)) >>> 0) : ((nw & ~(1 << 8)) >>> 0);
                    await writeTag(TAG_CMD, nw);
                    vCmdLast = nw;
                }
                return false;
            };
            await ensureRunState(bitRunLocal);
            const after = await readTags([TAG_CMD, TAG_ALM]);
            renderByTags(after);
            isToggling = false;
        } catch (e) {
            console.error('Erro no toggle Aquecedor 2:', e);
            isToggling = false;
        }
    };
    const powerToggle = root.querySelector('.power-toggle');
    registerWasherEventListener(powerToggle, 'click', doToggle);
    const powerOnImg = root.querySelector('.power-on');
    const powerOffImg = root.querySelector('.power-off');
    registerWasherEventListener(powerOnImg, 'click', doToggle);
    registerWasherEventListener(powerOffImg, 'click', doToggle);

    const controlsRow = root.querySelector('.controls-row');
    if (controlsRow) controlsRow.style.visibility = 'visible';

    readTags([TAG_CMD, TAG_ALM]).then(renderByTags).catch(()=>{
        const controlsRow = root.querySelector('.controls-row');
        if (controlsRow) controlsRow.style.visibility = 'visible';
    });

    // Poll tags e renderiza - REGISTRADO para cleanup
    let aquecedor2InFlight = false;
    const aquecedor2IntervalId = setInterval(async () => {
        if (aquecedor2InFlight) return;
        aquecedor2InFlight = true;
        try {
            const values = await readTags([TAG_CMD, TAG_ALM]);
            renderByTags(values);
        } finally {
            aquecedor2InFlight = false;
        }
    }, 1000);
    registerWasherInterval(aquecedor2IntervalId);
}

function setupAutoLimpezaBindings() {
    const root = document.getElementById('auto-limpeza');
    if (!root) return;

    const TAG_CMD = 'LS400_DB40_AUTO_LIMPEZA_CMD';
    const TAG_ALM = 'LS400_DB40_AUTO_LIMPEZA_ALARMES_BAIXO';
    
    let isToggling = false;
    let desiredRunState = null;
    let desiredSinceMs = 0;
    let retriedOnce = false;
    let vCmdLast = 0;
    let currentRun = false;

    const renderByTags = (values) => {
        if (!values || isToggling) return;
        
        const w = Number(values[TAG_CMD] || 0) >>> 0;
        const alm = Number(values[TAG_ALM] || 0) >>> 0;
        vCmdLast = w;
        
        const bitGreen = ((w >> 15) & 1) === 1;
        const bitRun = ((w >> 8) & 1) === 1;
        const bitMode = ((w >> 5) & 1) === 1;
        const bitDirection = ((w >> 12) & 1) === 1;
        const bitAlarm = ((alm >> 8) & 1) === 1;
        
        console.log(`🔄 Render Auto Limpeza - bitDirection: ${bitDirection}, valor: ${w}`);
        
        currentRun = bitRun;
        
        const imgGray = root.querySelector('.motor-gray');
        const imgGreen = root.querySelector('.motor-green');
        const imgBlue = root.querySelector('.motor-blue');
        const imgRed = root.querySelector('.motor-red');
        const imgAuto = root.querySelector('.mode-auto');
        const imgManual = root.querySelector('.mode-manual');
        const imgPowerOn = root.querySelector('.power-on');
        const imgPowerOff = root.querySelector('.power-off');
        const imgDirectionSingle = root.querySelector('.direction');
        
        if (imgGray) imgGray.style.display = 'none';
        if (imgGreen) imgGreen.style.display = 'none';
        if (imgBlue) imgBlue.style.display = 'none';
        if (imgRed) imgRed.style.display = 'none';
        
        if (bitAlarm) {
            if (imgRed) imgRed.style.display = 'block';
        } else if (bitGreen) {
            if (imgGreen) imgGreen.style.display = 'block';
        } else if (bitRun) {
            if (imgBlue) imgBlue.style.display = 'block';
        } else {
            if (imgGray) imgGray.style.display = 'block';
        }
        
        if (imgAuto) imgAuto.style.display = bitMode ? 'block' : 'none';
        if (imgManual) imgManual.style.display = bitMode ? 'none' : 'block';
        if (imgPowerOn) imgPowerOn.style.display = bitRun ? 'block' : 'none';
        if (imgPowerOff) imgPowerOff.style.display = bitRun ? 'none' : 'block';
        
        // Direção: troca de src em uma única imagem
        if (imgDirectionSingle) {
            const srcAnti = imgDirectionSingle.getAttribute('data-src-anti');
            const srcHorario = imgDirectionSingle.getAttribute('data-src-horario');
            imgDirectionSingle.src = bitDirection ? srcAnti : srcHorario;
        }
    };

    const doToggleMode = async () => {
        if (isToggling) return;
        isToggling = true;
        try {
            const w = vCmdLast >>> 0;
            const bitMode = ((w >> 5) & 1) === 1;
            const nw = bitMode ? ((w & ~(1 << 5)) >>> 0) : ((w | (1 << 5)) >>> 0);
            await writeTag(TAG_CMD, nw);
            vCmdLast = nw;
            const after = await readTags([TAG_CMD, TAG_ALM]);
            renderByTags(after);
        } catch (e) {
            console.error('Erro no toggle modo Auto Limpeza:', e);
        }
        isToggling = false;
    };

    const doTogglePower = async () => {
        if (isToggling) return;
        isToggling = true;
        try {
            const w = vCmdLast >>> 0;
            const bitRun = ((w >> 8) & 1) === 1;
            const bitRunLocal = !bitRun;
            desiredRunState = bitRunLocal;
            desiredSinceMs = Date.now();
            retriedOnce = false;
            
            const nw = bitRunLocal ? ((w | (1 << 8)) >>> 0) : ((w & ~(1 << 8)) >>> 0);
            await writeTag(TAG_CMD, nw);
            vCmdLast = nw;
            
            const imgRed = root.querySelector('.motor-red');
            const imgGreen = root.querySelector('.motor-green');
            const imgBlue = root.querySelector('.motor-blue');
            const imgGray = root.querySelector('.motor-gray');
            const imgPowerOn = root.querySelector('.power-on');
            const imgPowerOff = root.querySelector('.power-off');
            
            imgPowerOn.style.display = bitRunLocal ? 'block' : 'none';
            imgPowerOff.style.display = bitRunLocal ? 'none' : 'block';
            if (bitRunLocal) {
                imgRed.style.display = 'none';
                imgGreen.style.display = 'none';
                imgBlue.style.display = 'block';
                imgGray.style.display = 'none';
            } else {
                imgBlue.style.display = 'none';
                if (imgRed.style.display !== 'block' && imgGreen.style.display !== 'block') {
                    imgGray.style.display = 'block';
                }
            }

            const ensureRunState = async (target) => {
                const maxAttempts = 8;
                for (let i = 0; i < maxAttempts; i++) {
                    await new Promise(r => setTimeout(r, 120));
                    const read = await readTags([TAG_CMD]);
                    if (!read) continue;
                    const w = Number(read[TAG_CMD] || 0) >>> 0;
                    const run = ((w >> 8) & 1) === 1;
                    vCmdLast = w;
                    if (run === target) { currentRun = run; return true; }
                    let nw = w >>> 0;
                    nw = target ? ((nw | (1 << 8)) >>> 0) : ((nw & ~(1 << 8)) >>> 0);
                    await writeTag(TAG_CMD, nw);
                    vCmdLast = nw;
                }
                return false;
            };
            await ensureRunState(bitRunLocal);
            const after = await readTags([TAG_CMD, TAG_ALM]);
            renderByTags(after);
            isToggling = false;
        } catch (e) {
            console.error('Erro no toggle power Auto Limpeza:', e);
            isToggling = false;
        }
    };

    const doToggleDirection = async () => {
        if (isToggling) return;
        isToggling = true;
        try {
            const w = vCmdLast >>> 0;
            const bitDirection = ((w >> 12) & 1) === 1;
            const nw = bitDirection ? ((w & ~(1 << 12)) >>> 0) : ((w | (1 << 12)) >>> 0);
            await writeTag(TAG_CMD, nw);
            vCmdLast = nw;
            // Atualiza imagem imediatamente (optimistic UI)
            const imgDirectionSingle = root.querySelector('.direction');
            if (imgDirectionSingle) {
                const srcAnti = imgDirectionSingle.getAttribute('data-src-anti');
                const srcHorario = imgDirectionSingle.getAttribute('data-src-horario');
                imgDirectionSingle.src = ((nw >> 12) & 1) === 1 ? srcAnti : srcHorario;
            }
            const after = await readTags([TAG_CMD, TAG_ALM]);
            renderByTags(after);
        } catch (e) {
            console.error('Erro no toggle direção Auto Limpeza:', e);
        }
        isToggling = false;
    };

    // Event listeners - REGISTRADOS para cleanup
    const modeToggle = root.querySelector('.mode-toggle');
    registerWasherEventListener(modeToggle, 'click', doToggleMode);
    
    const powerToggle = root.querySelector('.power-toggle');
    registerWasherEventListener(powerToggle, 'click', doTogglePower);
    
    const directionToggle = root.querySelector('.direction-toggle');
    registerWasherEventListener(directionToggle, 'click', doToggleDirection);

    const controlsRow = root.querySelector('.controls-row');
    const directionRow = root.querySelector('.direction-row');
    if (controlsRow) controlsRow.style.visibility = 'visible';
    if (directionRow) directionRow.style.visibility = 'visible';

    readTags([TAG_CMD, TAG_ALM]).then(renderByTags).catch(()=>{
        const controlsRow = root.querySelector('.controls-row');
        const directionRow = root.querySelector('.direction-row');
        if (controlsRow) controlsRow.style.visibility = 'visible';
        if (directionRow) directionRow.style.visibility = 'visible';
    });

    // Poll tags e renderiza - REGISTRADO para cleanup
    let autoLimpezaInFlight = false;
    const autoLimpezaIntervalId = setInterval(async () => {
        if (autoLimpezaInFlight) return;
        autoLimpezaInFlight = true;
        try {
            const values = await readTags([TAG_CMD, TAG_ALM]);
            renderByTags(values);
        } finally {
            autoLimpezaInFlight = false;
        }
    }, 1000);
    registerWasherInterval(autoLimpezaIntervalId);
}

// Exporta a função para o escopo global
window.inicializarWasher = inicializarWasher;

