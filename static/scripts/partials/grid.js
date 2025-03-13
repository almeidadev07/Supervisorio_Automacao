let draggedButton = null;

// Funções de arrastar e soltar
document.querySelectorAll('.draggable-btn').forEach(button => {
    button.addEventListener('dragstart', (e) => {
        draggedButton = e.currentTarget;
        draggedButton.style.opacity = '0.5';
        document.querySelectorAll('.draggable-btn').forEach(btn => {
            if (btn !== draggedButton) btn.classList.add('inactive');
        });
    });

    button.addEventListener('dragend', () => {
        draggedButton.style.opacity = '1';
        document.querySelectorAll('.draggable-btn').forEach(btn => btn.classList.remove('inactive'));
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



// Funções do teclado virtual
let valorDigitado = "";
let deveSubstituir = false;
const teclado = document.getElementById("teclado-virtual");
let intervaloAjuste;

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

    // Atualização periódica dos velocímetros e contadores
    setInterval(() => {
        // Atualiza velocímetros
        document.querySelectorAll('.velocimetro-texto').forEach(texto => {
            const valorAleatorio = Math.floor(Math.random() * 400);
            const ponteiro = texto.closest('.draggable-btn').querySelector('.ponteiro[data-tipo="real"]');

            if (ponteiro) {
                texto.querySelector('.valor').textContent = valorAleatorio;
                atualizarPonteiro(ponteiro, valorAleatorio);
            }
        });

        // Atualiza contadores de alarme
        atualizarContadoresAlarme();
    }, 2000);
}

// Inicialização
document.addEventListener("DOMContentLoaded", inicializarVelocimetro);
