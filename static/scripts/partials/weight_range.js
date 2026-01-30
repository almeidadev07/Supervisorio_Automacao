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

    // Helpers de API
    const api = {
        async checkPLCConnection() {
            try {
                const res = await fetch('http://localhost:8000/api/status', { cache: 'no-store' });
                if (!res.ok) return false;
                const data = await res.json();
                return data.connected === true;
            } catch (e) {
                console.error('[WEIGHT_RANGE] Erro ao verificar conexão PLC:', e);
                return false;
            }
        },
        async getPresetValues(presetIdx) {
            // presetIdx é 0..3; API espera 1..4
            const preset = Number(presetIdx) + 1;
            const url = `/api/weight_range?preset=${preset}`;
            try {
                const res = await fetch(url, { cache: 'no-store' });
                if (!res.ok) throw new Error(`GET ${url} => ${res.status}`);
                const data = await res.json();
                if (data && data.ok && Array.isArray(data.values) && data.values.length === 7) {
                    return data.values.map(v => {
                        const n = Number(v);
                        if (!isFinite(n)) return 0;
                        return Math.max(0, Math.min(150, Math.round(n)));
                    });
                }
            } catch (e) {
                console.error('Falha ao ler valores do PLC:', e);
            }
            return null;
        },
        async setPresetValues(presetIdx, values) {
            const preset = Number(presetIdx) + 1; // 1..4
            const body = { 
                preset, 
                values: values.map(v => Math.max(0, Math.min(150, Number(v) || 0)))
            };
            
            console.log(`[WEIGHT_RANGE API] Escrevendo Preset ${preset} (índice ${presetIdx}):`, body.values);
            
            try {
                const res = await fetch('/api/weight_range', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                
                const data = await res.json().catch(() => ({}));
                
                if (!res.ok || !data.ok) {
                    console.error(`[WEIGHT_RANGE API] ❌ Falha Preset ${preset}:`, res.status, data);
                    return false;
                }
                
                console.log(`[WEIGHT_RANGE API] ✅ Preset ${preset} escrito com sucesso`);
                return true;
            } catch (e) {
                console.error(`[WEIGHT_RANGE API] ❌ Erro Preset ${preset}:`, e);
                return false;
            }
        },
        async getLabels() {
            const names = Array.from({ length: 7 }, (_, i) => `XLCLASS_DB202_NOME_DINAMICO[${i}]`).join(',');
            const url = `/api/read_tags?names=${encodeURIComponent(names)}`;
            try {
                const res = await fetch(url, { cache: 'no-store' });
                if (!res.ok) throw new Error(`GET ${url} => ${res.status}`);
                const data = await res.json();
                const values = (data && data.values) || {};
                return Array.from({ length: 7 }, (_, i) => {
                    const key = `XLCLASS_DB202_NOME_DINAMICO[${i}]`;
                    const v = values[key];
                    if (v === null || typeof v === 'undefined') return '########';
                    return String(v || '');
                });
            } catch (e) {
                console.error('Falha ao ler labels do PLC:', e);
                return Array.from({ length: 7 }, () => '########');
            }
        },
        async setLabel(index, text) {
            try {
                const tag = `XLCLASS_DB202_NOME_DINAMICO[${index}]`;
                const payload = {};
                payload[tag] = String(text || '');
                const res = await fetch('/api/write_tags', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data.ok) {
                    console.error('Falha ao escrever label no PLC:', res.status, data);
                    return false;
                }
                return true;
            } catch (e) {
                console.error('Erro ao escrever label no PLC:', e);
                return false;
            }
        }
    };

    // Subscrição por tela (ativa drivers só quando a tela está aberta)
    const clientId = `weight-range-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    let heartbeatTimer = null;
    let heartbeatInFlight = false;
    let refreshLabelsInterval = null;

    function buildSubscribedTags(presetIdx) {
        const tags = [];
        // Labels DB202
        for (let i = 0; i < 7; i++) tags.push(`XLCLASS_DB202_NOME_DINAMICO[${i}]`);
        // Seleção do preset e faixas atuais
        tags.push('XLCLASS_DB229_PESAGEM_SELECAO');
        const mapa = Number(presetIdx) || 0; // 0..3
        for (let i = 1; i <= 7; i++) tags.push(`XLCLASS_DB229_PESAGEM_MAPA_${mapa}_TIPO_P${i}`);
        return tags;
    }

    async function subscribeScreen(presetIdx) {
        try {
            const res = await fetch('/api/subscribe_tags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_id: clientId, tags: buildSubscribedTags(presetIdx) })
            });
            await res.json().catch(() => ({}));
        } catch (_) {}
    }

    async function unsubscribeScreen() {
        try {
            await fetch('/api/unsubscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_id: clientId })
            });
        } catch (_) {}
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
        } catch (_) {}
        finally {
            heartbeatInFlight = false;
        }
    }

    function startHeartbeat() {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(heartbeatScreen, 15000);
    }

    function stopHeartbeat() {
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
    }

    // Elementos DOM
    const container = document.getElementById('weight-range-container');
    const mainBar = document.getElementById('main-bar');
    const segments = document.querySelectorAll('.segment');
    const inputs = Array.from(document.querySelectorAll('.weight-input'));
    const labels = Array.from(document.querySelectorAll('.faixa-label'));
    const ENABLE_LABEL_EDIT = false; // rótulos somente leitura
    // Botões removidos (auto-save)

    // Debounce
    function debounce(fn, wait) {
        let t = null;
        return function(...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), wait);
        };
    }
    
    // ✅ OTIMIZAÇÃO: Controle de escrita com bloqueio
    let isWriting = false;  // Flag para bloquear troca de preset durante escrita
    let writeStartTime = 0;  // Timestamp do início da escrita
    
    // ✅ Função para mostrar toast/popup (similar ao grid periféricos)
    function showWeightRangeToast(message, duration = 3000) {
        // Remove toast anterior se existir
        const existingToast = document.querySelector('.weight-range-toast');
        if (existingToast) {
            existingToast.remove();
        }
        
        // Cria novo toast
        const toast = document.createElement('div');
        toast.className = 'weight-range-toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.85);
            color: #fff;
            padding: 20px 40px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 500;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            animation: fadeIn 0.3s ease-in-out;
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease-in-out';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // ✅ OTIMIZAÇÃO: Escrita otimizada com bloqueio inteligente
    const writeDebounced = debounce(async () => {
        // Não escreve se estiver apenas carregando preset
        if (isLoadingPreset) {
            console.log('[WEIGHT_RANGE] Escrita cancelada - carregando preset');
            return;
        }
        
        const current = setups[activeSetup] || [];
        if (!Array.isArray(current) || current.length !== 7) return;
        
        // ✅ BLOQUEIA troca de preset durante escrita
        isWriting = true;
        writeStartTime = Date.now();
        updatePresetButtonsState();  // ✅ Atualiza visual
        
        console.log(`[WEIGHT_RANGE] 🔒 Bloqueado - Escrevendo preset ${activeSetup + 1}:`, current);
        
        try {
            // ✅ ESCRITA PARALELA NO BACKEND (mais rápida)
            const success = await api.setPresetValues(activeSetup, current);
            
            if (success) {
                const elapsed = Date.now() - writeStartTime;
                console.log(`[WEIGHT_RANGE] ✅ Escrita completa em ${elapsed}ms`);
                
                // ✅ OTIMIZAÇÃO: Aguarda apenas 1.5s (tempo real de escrita paralela)
                // Remove espera artificial de 3s - backend já é rápido agora
                if (elapsed < 1500) {
                    await new Promise(resolve => setTimeout(resolve, 1500 - elapsed));
                }
            } else {
                console.error('[WEIGHT_RANGE] ❌ Falha na escrita');
            }
        } catch (e) {
            console.error('[WEIGHT_RANGE] ❌ Erro na escrita:', e);
        } finally {
            // ✅ DESBLOQUEIA troca de preset
            isWriting = false;
            updatePresetButtonsState();  // ✅ Atualiza visual
            console.log('[WEIGHT_RANGE] 🔓 Desbloqueado');
        }
    }, 300);  // ✅ Reduzido de 400ms para 300ms

    // Setup selection
    const setupInputs = document.querySelectorAll('input[name="setup"]');
    
    // Flag para evitar escrita ao trocar de preset (apenas leitura)
    let isLoadingPreset = false;
    
    // ✅ OTIMIZAÇÃO: Adiciona indicador visual de bloqueio
    function updatePresetButtonsState() {
        setupInputs.forEach(inp => {
            const label = inp.closest('.setup-label');
            if (label) {
                if (isWriting) {
                    label.style.opacity = '0.5';
                    label.style.cursor = 'not-allowed';
                    label.style.pointerEvents = Number(inp.value) === activeSetup ? 'auto' : 'none';
                } else {
                    label.style.opacity = '1';
                    label.style.cursor = 'pointer';
                    label.style.pointerEvents = 'auto';
                }
            }
        });
    }
    
    // Seleciona visualmente o preset ativo salvo
    setupInputs.forEach(input => {
        if (Number(input.value) === activeSetup) input.checked = true;
        input.addEventListener('change', async (e) => {
            // ✅ BLOQUEIO: Impede troca de preset durante escrita
            if (isWriting) {
                e.preventDefault();
                e.stopPropagation();
                input.checked = false;
                
                // Restaura seleção visual para o preset atual
                setupInputs.forEach(inp => {
                    inp.checked = (Number(inp.value) === activeSetup);
                });
                
                // ✅ Calcula tempo restante baseado no novo tempo otimizado (1.5s)
                const elapsed = Date.now() - writeStartTime;
                const minWriteTime = 1500;  // 1.5 segundos
                const remaining = Math.ceil((minWriteTime - elapsed) / 1000);
                const seconds = remaining > 0 ? remaining : 1;
                
                showWeightRangeToast(`⏳ Aguarde ${seconds} segundo${seconds > 1 ? 's' : ''}. Aplicando valores no PLC...`);
                console.log('[WEIGHT_RANGE] Troca de preset bloqueada - escrita em andamento');
                return;
            }
            
            // ✅ OTIMIZAÇÃO: Marca que está carregando preset para não escrever
            isLoadingPreset = true;
            
            activeSetup = parseInt(input.value);
            localStorage.setItem('weight_active_setup', String(activeSetup));
            
            // ✅ FEEDBACK VISUAL: Mostra loading
            const allInputs = document.querySelectorAll('.range-input');
            allInputs.forEach(inp => inp.disabled = true);
            
            // ✅ LEITURA RÁPIDA: Carrega valores do PLC para o preset selecionado
            const plcValues = await api.getPresetValues(activeSetup);
            if (plcValues) {
                setups[activeSetup] = plcValues;
                persistSetups();
            }
            updateDisplay();
            
            // ✅ OTIMIZAÇÃO: Não escreve de volta ao trocar preset (apenas leitura)
            
            // ✅ FEEDBACK VISUAL: Remove loading
            allInputs.forEach(inp => inp.disabled = false);
            isLoadingPreset = false;
            
            console.log(`[WEIGHT_RANGE] Preset ${activeSetup + 1} carregado - pronto para edição`);
            
            // Atualiza subscrição para MAPA correto
            subscribeScreen(activeSetup);
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

    function updateDisplay(showDisconnected = false) {
        const values = setups[activeSetup];
        values.forEach((value, index) => {
            if (segments[index]) {
                const percentage = showDisconnected ? 0 : (value / MAX_TOTAL) * 100;
                segments[index].style.width = `${percentage}%`;
                updateSegmentValue(segments[index], value, showDisconnected);
            }
            if (inputs[index]) {
                // ✅ Mostra ### quando desconectado
                if (showDisconnected) {
                    inputs[index].value = '###';
                    inputs[index].setAttribute('placeholder', '###');
                } else {
                    inputs[index].value = value;
                    inputs[index].removeAttribute('placeholder');
                }
            }
        });
        updateTotal(showDisconnected);
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
                // Após arraste, escreve no PLC
                writeDebounced();
            }
        });
    }

    // Atualiza valor mostrado na barra
    function updateSegmentValue(segment, value, showDisconnected = false) {
        let valueDisplay = segment.querySelector('.segment-value');
        if (!valueDisplay) {
            valueDisplay = document.createElement('span');
            valueDisplay.className = 'segment-value';
            segment.appendChild(valueDisplay);
        }
        // ✅ Mostra ### quando desconectado
        valueDisplay.textContent = showDisconnected ? '###' : `${value}g`;
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
            writeDebounced();
        };
        input.addEventListener('change', handler);
        input.addEventListener('input', handler);
    })

    // Removido fluxo de salvar/exportar/importar via servidor; uso localStorage
    // Atualiza display (função duplicada removida - usa a primeira definição)
    // A função updateDisplay já foi definida acima com suporte a showDisconnected

    // Atualiza total
    function updateTotal(showDisconnected = false) {
        // total removido da UI
        // Parâmetro showDisconnected adicionado para compatibilidade
    }

    // Inicialização
    initializeDragEvents();
    // Subscrição quando a tela abre
    subscribeScreen(activeSetup);
    startHeartbeat();
    // Carrega do PLC o preset ativo ao iniciar
    (async () => {
        const plcValues = await api.getPresetValues(activeSetup);
        if (plcValues) {
            setups[activeSetup] = plcValues;
            persistSetups();
        }
        updateDisplay();
        // Garante sincronização da seleção no PLC
        writeDebounced();
    })();

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
    let labelsRefreshPaused = false;

    function abrirTecladoTexto(labelEl) {
        if (ENABLE_LABEL_EDIT) {
            labelAtiva = labelEl;
            if (tecladoTexto && tecladoTextoInput) {
                tecladoTextoInput.value = (labelEl && labelEl.textContent) ? labelEl.textContent.trim() : '';
                tecladoTexto.style.display = 'block';
                setTimeout(() => tecladoTextoInput.focus(), 0);
                labelsRefreshPaused = true;
            }
        }
    }
    async function fecharTecladoTexto(confirmar) {
        if (ENABLE_LABEL_EDIT) {
            if (confirmar && labelAtiva && tecladoTextoInput) {
                const novo = tecladoTextoInput.value.trim();
                const idx = labels.indexOf(labelAtiva);
                if (idx >= 0) {
                    const ok = await api.setLabel(idx, novo);
                    if (ok) {
                        labelAtiva.textContent = novo;
                    } else {
                        setTimeout(refreshLabelsFromPLC, 600);
                    }
                }
            }
            if (tecladoTexto) tecladoTexto.style.display = 'none';
            labelAtiva = null;
            labelsRefreshPaused = false;
        }
    }

    // Bind labels para abrir teclado de texto
    labels.forEach((label) => {
        if (!ENABLE_LABEL_EDIT) {
            try { label.setAttribute('tabindex', '-1'); } catch(_) {}
            try { label.setAttribute('contenteditable', 'false'); } catch(_) {}
            try { label.style.cursor = 'default'; } catch(_) {}
            try { label.style.pointerEvents = 'none'; } catch(_) {}
            // não clonar o elemento para não quebrar o array labels usado no refresh
        } else {
            label.addEventListener('focus', () => {
                abrirTecladoTexto(label);
            });
            // Também abrir ao clicar (entrar no modo de edição)
            label.addEventListener('click', () => {
                abrirTecladoTexto(label);
            });
        }
    });

    // ✅ Rastreamento de conexão PLC (DataHub ↔ PLC)
    let plcConnected = true;
    let consecutiveFailures = 0;
    let refreshLabelsInFlight = false;
    
    async function refreshLabelsFromPLC() {
        if (refreshLabelsInFlight) return;
        refreshLabelsInFlight = true;
        try {
            if (labelsRefreshPaused) return;
            
            // ✅ VERIFICA STATUS DA CONEXÃO PLC ↔ DataHub
            const isConnected = await api.checkPLCConnection();
            
            // ✅ Detecta DESCONEXÃO (PLC ↔ DataHub)
            if (!isConnected) {
                consecutiveFailures++;
                if (consecutiveFailures >= 2) {  // 2 falhas = ~4 segundos
                    if (plcConnected) {
                        // ✅ ACABOU DE DESCONECTAR
                        console.log('[WEIGHT_RANGE] ❌ Conexão PLC perdida - mostrando ###');
                        plcConnected = false;
                        
                        // Mostra ### em todos os valores
                        updateDisplay(true);
                        
                        // Limpa nomes das classes
                        labels.forEach(label => {
                            if (label) label.textContent = '';
                        });
                    }
                }
                return; // Para aqui, não tenta ler dados
            }
            
            // ✅ Detecta RECONEXÃO (PLC ↔ DataHub)
            if (!plcConnected && isConnected) {
                console.log('[WEIGHT_RANGE] 🔄 Conexão PLC restaurada - recarregando dados');
                plcConnected = true;
                consecutiveFailures = 0;
                
                // Força reload completo do preset ativo
                const plcValues = await api.getPresetValues(activeSetup);
                if (plcValues) {
                    setups[activeSetup] = plcValues;
                    persistSetups();
                    updateDisplay(false); // ✅ Mostra valores normais
                }
            } else {
                // Conexão OK
                consecutiveFailures = 0;
                plcConnected = true;
            }
            
            // ✅ Lê labels do PLC (só se conectado)
            const plcLabels = await api.getLabels();
            plcLabels.forEach((txt, i) => {
                if (!labels[i]) return;
                const val = (txt === null || typeof txt === 'undefined' || txt === '########') ? '' : String(txt);
                labels[i].textContent = val;
            });
        } finally {
            refreshLabelsInFlight = false;
        }
    }

    // ✅ CORRIGIDO: Armazena ID do intervalo para poder limpar depois
    if (refreshLabelsInterval) {
        clearInterval(refreshLabelsInterval);
    }
    refreshLabelsInterval = setInterval(refreshLabelsFromPLC, 2000);

    // Bind teclas do teclado virtual de texto
    if (tecladoTexto && ENABLE_LABEL_EDIT) {
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

    // Limpeza ao sair da tela / ocultar
    const handleVisibility = () => {
        if (document.hidden) {
            stopHeartbeat();
            unsubscribeScreen();
        } else {
            subscribeScreen(activeSetup);
            startHeartbeat();
        }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', () => {
        stopHeartbeat();
        unsubscribeScreen();
    });
    
    // ✅ CRÍTICO: Função de cleanup para evitar vazamento de memória
    window.cleanupWeightRange = function() {
        console.log('[WEIGHT_RANGE] 🧹 Limpando recursos...');
        
        // Limpa heartbeat
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
        
        // Limpa intervalo de refresh de labels
        if (refreshLabelsInterval) {
            clearInterval(refreshLabelsInterval);
            refreshLabelsInterval = null;
        }
        
        // Desinscreve da tela
        unsubscribeScreen();
        
        // Remove listener de visibilitychange
        if (handleVisibility) {
            document.removeEventListener('visibilitychange', handleVisibility);
        }
        
        console.log('[WEIGHT_RANGE] ✅ Cleanup concluído');
    };
}

// Exporta função para escopo global
window.inicializarWeightRange = inicializarWeightRange;
