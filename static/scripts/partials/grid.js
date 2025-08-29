let draggedButton = null;

// Funções de arrastar e soltar

// Trava para só permitir drag após segurar por 1 segundo
let dragTimeout = null;
let allowDrag = false;

document.querySelectorAll('.draggable-btn').forEach(button => {
    // Impede drag imediato
    button.addEventListener('mousedown', (e) => {
        allowDrag = false;
        dragTimeout = setTimeout(() => {
            allowDrag = true;
            // Inicia drag programaticamente se mouse ainda está pressionado
            button.setAttribute('draggable', 'true');
        }, 1000); // 1 segundo
    });

    button.addEventListener('mouseup', (e) => {
        clearTimeout(dragTimeout);
        button.removeAttribute('draggable');
    });

    button.addEventListener('mouseleave', (e) => {
        clearTimeout(dragTimeout);
        button.removeAttribute('draggable');
    });

    button.addEventListener('dragstart', (e) => {
        if (!allowDrag) {
            e.preventDefault();
            return;
        }
        draggedButton = e.currentTarget;
        draggedButton.style.opacity = '0.5';
        document.querySelectorAll('.draggable-btn').forEach(btn => {
            if (btn !== draggedButton) btn.classList.add('inactive');
        });
        allowDrag = false;
    });

    button.addEventListener('dragend', () => {
        draggedButton.style.opacity = '1';
        document.querySelectorAll('.draggable-btn').forEach(btn => btn.classList.remove('inactive'));
        button.removeAttribute('draggable');
        allowDrag = false;
    });

    button.addEventListener('dragover', (e) => e.preventDefault());

    button.addEventListener('drop', (e) => {
        e.preventDefault();
        const target = e.currentTarget;
        if (draggedButton && target !== draggedButton) {
            const parent = target.parentNode;
            const temp = document.createElement('div');
            parent.insertBefore(temp, target);
            parent.insertBefore(target, draggedButton);
            parent.insertBefore(draggedButton, temp);
            parent.removeChild(temp);
        }
    });
});

// Funções do velocímetro
function atualizarPonteiro(ponteiroElement, valor) {
    // Ajuste fino do cálculo de ângulo
    const anguloMin = -128;  // Posição mínima (0 Cx/h)
    const anguloMax = 65;    // Posição máxima (400 Cx/h)
    
    valor = Math.max(0, Math.min(400, valor));
    const percentual = valor / 400;
    const angulo = anguloMin + (anguloMax - anguloMin) * percentual;
    
    ponteiroElement.style.transform = `translateX(-50%) rotate(${angulo}deg)`;
}

// Atualiza a UI da velocidade real a partir de um valor numérico (cx/h)
function atualizarVelocidadeRealUI(valor){
    const valorNum = Math.max(0, Math.min(400, Number(valor) || 0));
    const valorEl = document.querySelector('#valorReal .valor');
    if (valorEl) valorEl.textContent = Math.round(valorNum);
    const ponteiro = document.getElementById('ponteiroReal');
    if (ponteiro) atualizarPonteiro(ponteiro, valorNum);
}

// Vincula Socket.IO para receber a tag real_speed_cxh
function bindTelemetryVelocidadeReal(){
    try {
        // Reutiliza conexão existente, se houver
        const socket = window.io ? (window.supervisorSocket || (window.supervisorSocket = window.io())) : null;
        if (!socket) return false;
        console.log('[GRID] Socket.IO conectado para velocidade real');
        socket.on('telemetry', data => {
            if (!data) return;
            if (data.real_speed_cxh == null) return;
            if (data && data.real_speed_cxh != null) {
                atualizarVelocidadeRealUI(data.real_speed_cxh);
                // debug leve
                // console.log('[GRID] real_speed_cxh', data.real_speed_cxh);
            }
        });
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


function abrirTeclado(e) {
    const input = e.target.closest('.velocimetro-input');
    if (input) {
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
        valor = Math.min(400, Math.max(0, valor));
        input.value = valor;
        const ponteiro = input.closest('.draggable-btn').querySelector('.ponteiro');
        if (ponteiro) atualizarPonteiro(ponteiro, valor);
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
        valor = Math.min(400, Math.max(0, valor + delta));
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
    // Sempre manter um polling leve por HTTP como segurança
    setInterval(() => {
        fetch('/api/read_tags?names=real_speed_cxh', { cache: 'no-store' })
            .then(r => r.json())
            .then(res => {
                if (res && res.ok && res.values && res.values.real_speed_cxh != null) {
                    atualizarVelocidadeRealUI(res.values.real_speed_cxh);
                }
            })
            .catch(() => {});
    }, 1000);
    // Dispara uma leitura imediata para preencher a UI rapidamente
    fetch('/api/read_tags?names=real_speed_cxh')
        .then(r => r.json())
        .then(res => {
            if (res && res.ok && res.values && res.values.real_speed_cxh != null) {
                atualizarVelocidadeRealUI(res.values.real_speed_cxh);
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
