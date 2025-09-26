function inicializarWeightRange() {
    console.log('Inicializando Weight Range...');

    // Configurações
    const MAX_TOTAL = 150;
    const colors = ['#FF1493', '#FFFF00', '#0000FF', '#00FF00', '#FF4500', '#00BFFF', '#00FFBF'];
    // Carrega preset ativo previamente salvo (fallback 0)
    let activeSetup = Number(localStorage.getItem('weight_active_setup') || 0);
    
    // Estado inicial
    // Carrega setups do localStorage, com defaults
    let setups = (() => {
        try {
            const raw = localStorage.getItem('weight_setups');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') return parsed;
            }
        } catch (e) { console.warn('Falha ao ler weight_setups do localStorage', e); }
        return {
            0: [25, 10, 15, 15, 10, 15, 10],
            1: [25, 10, 15, 15, 10, 15, 10],
            2: [25, 10, 15, 15, 10, 15, 10],
            3: [25, 10, 15, 15, 10, 15, 10]
        };
    })();

    // Elementos DOM
    const container = document.getElementById('weight-range-container');
    const mainBar = document.getElementById('main-bar');
    const segments = document.querySelectorAll('.segment');
    const inputs = Array.from(document.querySelectorAll('.weight-input'));
    const labels = Array.from(document.querySelectorAll('.faixa-label'));
    // Botões removidos (auto-save)

    // Setup selection
    const setupInputs = document.querySelectorAll('input[name="setup"]');
    
    // Seleciona visualmente o preset ativo salvo
    setupInputs.forEach(input => {
        if (Number(input.value) === activeSetup) input.checked = true;
        input.addEventListener('change', () => {
            activeSetup = parseInt(input.value);
            localStorage.setItem('weight_active_setup', String(activeSetup));
            updateDisplay();
        });
    });

    // Persistência
    function persistSetups() {
        try {
            localStorage.setItem('weight_setups', JSON.stringify(setups));
        } catch (e) {
            console.error('Erro ao salvar weight_setups no localStorage', e);
        }
    }

    function updateDisplay() {
        const values = setups[activeSetup];
        values.forEach((value, index) => {
            if (segments[index]) {
                const percentage = (value / MAX_TOTAL) * 100;
                segments[index].style.width = `${percentage}%`;
                updateSegmentValue(segments[index], value);
            }
            if (inputs[index]) {
                inputs[index].value = value;
            }
        });
        updateTotal();
    }


    // Inicializa eventos de arrastar
    function initializeDragEvents() {
        segments.forEach((segment, index) => {
            let isDragging = false;
            let startX;
            let startWidth;
            let nextSegment;
            const zIndex = segments.length - index; // faixa 1 = 7, faixa 2 = 6, ..., faixa 7 = 1
            segment.style.zIndex = zIndex;

            segment.addEventListener('mousedown', (e) => {
                e.preventDefault();
                isDragging = true;
                startX = e.clientX;
                startWidth = segment.offsetWidth;
                nextSegment = segments[index + 1];
                
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });

            function onMouseMove(e) {
                if (!isDragging) return;
                
                const delta = e.clientX - startX;
                const totalWidth = mainBar.offsetWidth;
                
                // Calcula nova largura mantendo entre 0 e 150g
                const currentPercentage = (startWidth + delta) / totalWidth;
                const newValue = Math.max(0, Math.min(150, Math.round(currentPercentage * MAX_TOTAL)));
                
                // Atualiza largura e valor do segmento atual
                const newPercentage = (newValue / MAX_TOTAL) * 100;
                segment.style.width = `${newPercentage}%`;
                updateInputValue(index, newValue);
                updateSegmentValue(segment, newValue);
                
                // Atualiza próximo segmento se existir
                if (nextSegment) {
                    const nextValue = Math.max(0, Math.min(150, setups[activeSetup][index + 1] - (newValue - setups[activeSetup][index])));
                    const nextPercentage = (nextValue / MAX_TOTAL) * 100;
                    nextSegment.style.width = `${nextPercentage}%`;
                    updateInputValue(index + 1, nextValue);
                    updateSegmentValue(nextSegment, nextValue);
                }
            }

            function onMouseUp() {
                isDragging = false;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            }
        });
    }

    // Atualiza valor mostrado na barra
    function updateSegmentValue(segment, value) {
        let valueDisplay = segment.querySelector('.segment-value');
        if (!valueDisplay) {
            valueDisplay = document.createElement('span');
            valueDisplay.className = 'segment-value';
            segment.appendChild(valueDisplay);
        }
        valueDisplay.textContent = `${value}g`;
    }

    // Atualiza valor do input e recalcula barras
    function updateInputValue(index, value) {
        if (inputs[index]) {
            const newValue = Math.max(0, Math.min(150, value));
            inputs[index].value = newValue;
            setups[activeSetup][index] = newValue;
            persistSetups();
            
            // Atualiza largura da barra
            const percentage = (newValue / MAX_TOTAL) * 100;
            segments[index].style.width = `${percentage}%`;
            updateSegmentValue(segments[index], newValue);
            
            updateTotal();
        }
    }

    // Eventos dos inputs
    inputs.forEach((input, index) => {
        const handler = () => {
            const value = parseInt(input.value) || 0;
            updateInputValue(index, value);
        };
        input.addEventListener('change', handler);
        input.addEventListener('input', handler);
    })

    // Removido fluxo de salvar/exportar/importar via servidor; uso localStorage
    // Atualiza display
    function updateDisplay() {
        const values = setups[activeSetup];
        values.forEach((value, index) => {
            if (segments[index]) {
                const percentage = (value / MAX_TOTAL) * 100;
                segments[index].style.width = `${percentage}%`;
                segments[index].style.left = `0`; // Agora sempre parte do zero
                updateSegmentValue(segments[index], value);
            }
            if (inputs[index]) {
                inputs[index].value = value;
            }
        });
        updateTotal();
    }

    // Atualiza total
    function updateTotal() {
        // total removido da UI
    }

    // Inicialização
    initializeDragEvents();
    updateDisplay();

    // Integração com teclado virtual existente (númerico) para os inputs de valor
    // Integra teclados globais: numérico e texto são incluídos em virtual_keyboard.html
    // Reuso do teclado numérico global (id: teclado-virtual) com API já existente em grid.js
    inputs.forEach((input) => {
        if (!input.id) input.id = `weight-input-${Math.random().toString(36).slice(2,8)}`;
        input.addEventListener('click', () => {
            try {
                if (window.abrirTeclado) abrirTeclado({ target: input });
            } catch(_) {}
        });
    });

    // Teclado virtual para textos das faixas
    const tecladoTexto = document.getElementById('teclado-virtual-texto');
    const tecladoTextoInput = document.getElementById('kbd-texto-input');
    let labelAtiva = null;
    let tecladoTextoMaiusculo = true;

    function abrirTecladoTexto(labelEl) {
        labelAtiva = labelEl;
        if (tecladoTexto && tecladoTextoInput) {
            tecladoTextoInput.value = (labelEl && labelEl.textContent) ? labelEl.textContent.trim() : '';
            tecladoTexto.style.display = 'block';
            setTimeout(() => tecladoTextoInput.focus(), 0);
        }
    }
    function fecharTecladoTexto(confirmar) {
        if (confirmar && labelAtiva && tecladoTextoInput) {
            const novo = tecladoTextoInput.value.trim();
            if (novo) labelAtiva.textContent = novo;
        }
        if (tecladoTexto) tecladoTexto.style.display = 'none';
        labelAtiva = null;
    }

    // Bind labels para abrir teclado de texto
    labels.forEach((label) => {
        label.addEventListener('focus', () => {
            abrirTecladoTexto(label);
        });
        // Também abrir ao clicar (entrar no modo de edição)
        label.addEventListener('click', () => {
            abrirTecladoTexto(label);
        });
    });

    // Bind teclas do teclado virtual de texto
    if (tecladoTexto) {
        // Evita fechar ao clicar dentro do teclado
        if (!tecladoTexto.dataset.stopInsideBound) {
            tecladoTexto.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });
            tecladoTexto.dataset.stopInsideBound = '1';
        }

        // Fecha ao clicar fora (garantia de bind único)
        if (!window._weightTextKbOutsideBound) {
            document.addEventListener('mousedown', (e) => {
                if (tecladoTexto.style.display === 'block' && !tecladoTexto.contains(e.target)) {
                    fecharTecladoTexto(false);
                }
            });
            window._weightTextKbOutsideBound = true;
        }

        // Evento de teclas com delegação, evitando múltiplos binds
        if (!tecladoTexto.dataset.bound) {
            tecladoTexto.addEventListener('click', (evt) => {
                const keyEl = evt.target.closest('.key');
                if (!keyEl || !tecladoTexto.contains(keyEl)) return;
                const isAccept = keyEl.classList.contains('key-accept');
                const isCancel = keyEl.classList.contains('key-cancel');
                const txt = keyEl.textContent;
                const isToggle = keyEl.dataset.action === 'toggle-case';
                if (isAccept) { fecharTecladoTexto(true); return; }
                if (isCancel) { fecharTecladoTexto(false); return; }
                if (isToggle) {
                    tecladoTextoMaiusculo = !tecladoTextoMaiusculo;
                    // Atualiza visual das letras do teclado
                    tecladoTexto.querySelectorAll('.key').forEach((k) => {
                        if (k.classList.contains('key-accept') || k.classList.contains('key-cancel') || k.classList.contains('key-wide')) return;
                        if (!k.textContent) return;
                        // só altera se for 1 caracter alfabético
                        if (/^[A-Za-z]$/.test(k.textContent)) {
                            k.textContent = tecladoTextoMaiusculo ? k.textContent.toUpperCase() : k.textContent.toLowerCase();
                        }
                    });
                    return;
                }
                if (txt === '⌫') {
                    tecladoTextoInput.value = tecladoTextoInput.value.slice(0, -1);
                    return;
                }
                // Adiciona mantendo estado de maiúsculas/minúsculas
                const toAdd = tecladoTextoMaiusculo ? txt.toUpperCase() : txt.toLowerCase();
                tecladoTextoInput.value += toAdd;
            });
            tecladoTexto.dataset.bound = '1';
        }
    }
}

// Exporta função para escopo global
window.inicializarWeightRange = inicializarWeightRange;