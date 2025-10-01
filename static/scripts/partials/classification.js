function inicializarClassification() {
    console.log('Inicializando Classification...');
    const state = {
        embaladoras: (() => {
            const cols = [{ id: 'IND', nome: 'IND', ativo: false, classes: [] }];
            for (let i = 1; i <= 24; i++) {
                const num = String(i).padStart(2, '0');
                cols.push({ id: `E${num}`, nome: `E${num}`, ativo: false, classes: [] });
            }
            cols.push({ id: 'SPJ', nome: 'SPJ', ativo: false, classes: [] });
            return cols;
        })(),
        classesOvos: [
            { id: 'C1', nome: 'C1', cor: '#FF3399' },
            { id: 'C2', nome: 'C2', cor: '#FFFF00' },
            { id: 'C3', nome: 'C3', cor: '#0000FF' },
            { id: 'C4', nome: 'C4', cor: '#33CC33' },
            { id: 'C5', nome: 'C5', cor: '#FF6600' },
            { id: 'C6', nome: 'C6', cor: '#33CCFF' },
            { id: 'C7', nome: 'C7', cor: '#00FF99' },
            { id: 'CRACK', nome: 'CRACK', cor: '#999999' },
            { id: 'VISIO', nome: 'VISIO', cor: '#663399' }
        ],
        selectedEmbaladora: null,
        presets: [],
        tiposOvo: ['branco', 'vermelho', 'misto'],
        dynamicLabels: Array.from({ length: 7 }, () => null)
    };

    // API helpers (reutiliza a lógica da tela de faixa de peso para nomes dinâmicos)
    const api = {
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
                    if (v === null || typeof v === 'undefined') return null;
                    return String(v || '').trim();
                });
            } catch (e) {
                console.error('Falha ao ler labels do PLC (classification):', e);
                return Array.from({ length: 7 }, () => null);
            }
        },
        async setLabel(index, text) {
            const i = Number(index) >>> 0;
            if (i > 6) return false;
            const tag = `XLCLASS_DB202_NOME_DINAMICO[${i}]`;
            try {
                const res = await fetch('/api/write_tags', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ [tag]: String(text || '') })
                });
                const data = await res.json();
                return !!(data && data.ok);
            } catch (_) {
                return false;
            }
        }
    };
    // Teclado virtual para textos das faixas
    const tecladoTexto = document.getElementById('teclado-virtual-texto');
    const tecladoTextoInput = document.getElementById('kbd-texto-input');
    let labelAtiva = null;
    let tecladoTextoMaiusculo = true;

    function abrirTecladoTexto(inputEl) {
        labelAtiva = inputEl;
        if (tecladoTexto && tecladoTextoInput) {
            tecladoTextoInput.value = inputEl.value || '';
            tecladoTexto.style.display = 'block';
            setTimeout(() => tecladoTextoInput.focus(), 0);
        }
    }

    async function fecharTecladoTexto(confirmar) {
        if (confirmar && labelAtiva && tecladoTextoInput) {
            const novo = tecladoTextoInput.value.trim();
            labelAtiva.value = novo;
        }
        if (tecladoTexto) tecladoTexto.style.display = 'none';
        labelAtiva = null;
    }

    // Alert/claw tags reader (lê ambas as tags necessárias de uma vez)
    async function getAlertAndStatus() {
        const TAG_ALERT = 'XLCLASS_DB1_PRINCIPAL_ALARME_CLASSIFICADORA';
        const TAG_STATUS = 'XLCLASS_DB1_PRINCIPAL_COMANDO_STATUS_01';
        const names = `${TAG_ALERT},${TAG_STATUS}`;
        try {
            const res = await fetch(`/api/read_tags?names=${encodeURIComponent(names)}`, { cache: 'no-store' });
            if (!res.ok) throw new Error('bad');
            const data = await res.json();
            const rawAlert = Number(data?.values?.[TAG_ALERT] ?? 0) || 0;
            const rawStatus = Number(data?.values?.[TAG_STATUS] ?? 0) || 0;
            return { rawAlert, rawStatus };
        } catch (_) {
            return { rawAlert: 0, rawStatus: 0 };
        }
    }
    function computeAlertText(rawValue) {
        const v = Number(rawValue) >>> 0;
        if (!v) return '';
        const embaladora = Math.trunc((v - 1) / 10) + 1; // 1..N
        const tipoAlerta = v % 10; // 0..9
        // Exibir como 1-based para o usuário
        switch (tipoAlerta) {
            case 1: return `MÁQUINA PARADA - EMERGÊNCIA - EMBALADORA ${embaladora}`;
            case 2: return `MÁQUINA PARADA - DESLIGA CLASSIFICADORA FRENTE - EMBALADORA ${embaladora}`;
            case 3: return `MÁQUINA PARADA - DESLIGA CLASSIFICADORA TRAZ - EMBALADORA ${embaladora}`;
            case 4: return `MÁQUINA PARADA - FALTA DE BANDEJA - EMBALADORA ${embaladora}`;
            case 5: return `MÁQUINA PARADA - ACÚMULO DE BANDEJA - EMBALADORA ${embaladora}`;
            case 6: return `MÁQUINA PARADA - ACÚMULO DE OVOS - EMBALADORA ${embaladora}`;
            case 7: return `MÁQUINA PARADA - TAMPA DO DESCEDOR ABERTA - EMBALADORA ${embaladora}`;
            case 8: return `MÁQUINA PARADA - TAMPA DA CLASSIFICADORA ABERTA - EMBALADORA ${embaladora}`;
            default: return '';
        }
    }
    function renderAlert(text, visible) {
        const el = document.getElementById('classification-alert');
        if (!el) return;
        el.textContent = text || '';
        if (visible && text && text.trim() !== '') {
            el.style.visibility = 'visible';
        } else {
            el.style.visibility = 'hidden';
        }
    }
    function renderClaw(visible) {
        const el = document.getElementById('claw-banner');
        if (!el) return;
        el.style.visibility = visible ? 'visible' : 'hidden';
    }
    function renderClawGreen(visible) {
        const el = document.getElementById('claw-banner-green');
        if (!el) return;
        el.style.visibility = visible ? 'visible' : 'hidden';
    }

    // Utils
    function arraysEqual(a, b) {
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if ((a[i] || null) !== (b[i] || null)) return false;
        }
        return true;
    }
    function renderStatus() {
        const statusRow = document.getElementById('status-row');
        if (!statusRow) return;
        
        statusRow.innerHTML = state.embaladoras.map(emb => `
            <div class="status-cell">
                <div class="status-indicator ${emb.ativo ? 'status-active' : 'status-inactive'}"></div>
            </div>
        `).join('');
    }
    function renderHeaders() {
        const headerRow = document.getElementById('header-row');
        if (!headerRow) return;
        
        headerRow.innerHTML = state.embaladoras.map(emb => `
            <div class="header-cell">${emb.nome}</div>
        `).join('');
    }
    function renderGrid() {
        const grid = document.getElementById('embaladora-grid');
        if (!grid) return;
        console.log('Renderizando grid com estado:', state.embaladoras);
        grid.innerHTML = state.embaladoras.map(emb => `
            <div class="embaladora-column" data-id="${emb.id}">
                ${renderClasses(emb.classes)}
            </div>
        `).join('');
        
        document.querySelectorAll('.embaladora-column').forEach(column => {
            column.addEventListener('click', () => {
                const embId = column.getAttribute('data-id');
                handleEmbaladoraClick(embId);
            });
        });
    }
    
    function handleEmbaladoraClick(embId) {
        console.log('Clicked embaladora:', embId);
        const embaladora = state.embaladoras.find(e => e.id === embId);
        if (embaladora) {
            state.selectedEmbaladora = embaladora;
            showClassModal(embaladora);
        }
    }
    function renderClasses(classes) {
        console.log('Renderizando classes:', classes);
        
        // Calcula posições garantindo que todos os círculos caibam dentro do card
        const cardHeight = 400; // altura do card definida no CSS
        const marginSafe = 10; // margem desejada no topo e na base
        const maxHeight = cardHeight - marginSafe * 2; // área útil vertical exata (simétrica)
        const circleSize = 30; // tamanho do círculo (mantém consistente com CSS)
        const verticalGap = 8; // espaçamento entre círculos
        const totalItems = state.classesOvos.length;
        const totalNeeded = totalItems * circleSize + (totalItems - 1) * verticalGap;
        const startTop = marginSafe + Math.max(0, Math.floor((maxHeight - totalNeeded) / 2)); // garante margem igual em cima e embaixo

        const fixedPositions = state.classesOvos.map((classe, index) => ({
            id: classe.id,
            top: Math.max(10, Math.floor(startTop + index * (circleSize + verticalGap))),
            cor: classe.cor
        }));
        return fixedPositions.map(position => {
            const selectedClass = classes.find(c => c.id === position.id);
            if (selectedClass) {
                return `
                    <div class="egg-class-item tipo-${selectedClass.tipo}" style="
                        background-color: ${position.cor};
                        top: ${position.top}px;
                        height: ${circleSize}px; width: ${circleSize}px;
                    "></div>
                `;
            }
            return '';
        }).join('');
    }
    function renderClassesList() {
        const classList = document.getElementById('classes-list');
        if (!classList) return;
        
        const html = state.classesOvos.map(classe => {
            const id = classe.id;
            const ids = ['C1','C2','C3','C4','C5','C6','C7'];
            const isRange = ids.includes(id);
            const idx = isRange ? ids.indexOf(id) : -1;
            const plcName = isRange ? (state.dynamicLabels[idx] || '#######') : classe.nome;
            return `
                <div class="egg-class">
                    <span>${id}</span>
                    <div class="egg-color" style="background-color: ${classe.cor}"></div>
                    ${isRange ? `<span>${plcName}</span>` : ''}
                </div>
            `;
        }).join('');
        classList.innerHTML = html + `
            <button id="edit-labels-btn" class="control-btn edit-labels-btn" title="Editar nomes das faixas" style="width:36px;height:36px;">
                <img src="/static/images/pages/icons/comandos/icone_editar.png" alt="Editar" />
            </button>
        `;
        
        // Adiciona event listener ao botão de editar após criá-lo
        const editLabelsBtn = document.getElementById('edit-labels-btn');
        if (editLabelsBtn) {
            editLabelsBtn.addEventListener('click', () => {
                // Pré-carrega inputs com os rótulos atuais
                const ids = ['C1','C2','C3','C4','C5','C6','C7'];
                ids.forEach((_, idx) => {
                    const inp = document.getElementById(`lbl-C${idx+1}`);
                    if (inp) inp.value = state.dynamicLabels[idx] || '';
                });
                showModal('labels-editor-modal');
            });
        }
    }
    function showClassModal(embaladora) {
        if (!embaladora) return;
        console.log('Showing modal for:', embaladora.nome);
        const modal = document.getElementById('class-modal');
        const selectedEmbSpan = document.getElementById('selected-embaladora');
        const options = document.getElementById('class-options');
        
        if (!modal || !selectedEmbSpan || !options) return;
        let displayName = embaladora.nome;
        // Formata para exibir apenas o número sem o prefixo 'E' (ex.: 'E05' -> '05')
        if (typeof displayName === 'string' && /^E\d{2}$/.test(displayName)) {
            displayName = displayName.replace(/^E/, '');
        }
        selectedEmbSpan.textContent = displayName;
        
        options.innerHTML = state.classesOvos.map(classe => {
            const existingClass = embaladora.classes.find(c => c.id === classe.id);
            const selectedType = existingClass?.tipo || '';
            const id = classe.id;
            const ids = ['C1','C2','C3','C4','C5','C6','C7'];
            const isRange = ids.includes(id);
            const idx = isRange ? ids.indexOf(id) : -1;
            const plcName = isRange ? (state.dynamicLabels[idx] || '#######') : classe.nome;
            
            return `
                <div class="class-option">
                    <span>${id}</span>
                    <div class="color-box" style="background-color: ${classe.cor};"></div>
                    ${isRange ? `<span>${plcName}</span>` : ''}
                    <div class="type-buttons">
                        <button class="type-btn type-branco ${selectedType === 'branco' ? 'selected' : ''}" 
                                data-emb="${embaladora.id}" 
                                data-class="${classe.id}" 
                                data-type="branco">
                            Branco
                        </button>
                        <button class="type-btn type-vermelho ${selectedType === 'vermelho' ? 'selected' : ''}" 
                                data-emb="${embaladora.id}" 
                                data-class="${classe.id}" 
                                data-type="vermelho">
                            Vermelho
                        </button>
                        <button class="type-btn type-misto ${selectedType === 'misto' ? 'selected' : ''}" 
                                data-emb="${embaladora.id}" 
                                data-class="${classe.id}" 
                                data-type="misto">
                            Misto
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        options.querySelectorAll('.type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const embId = e.target.getAttribute('data-emb');
                const classId = e.target.getAttribute('data-class');
                const type = e.target.getAttribute('data-type');
                handleClassSelection(embId, classId, type);
            });
        });
        modal.classList.add('show');
    }
    function handleClassSelection(embId, classId, tipo) {
        console.log('Selection:', embId, classId, tipo);
        const embaladora = state.embaladoras.find(e => e.id === embId);
        const classe = state.classesOvos.find(c => c.id === classId);
        
        if (!embaladora || !classe) return;
        const embIndex = state.embaladoras.findIndex(e => e.id === embId);
        if (embIndex === -1) return;
        const novasClasses = [...state.embaladoras[embIndex].classes];
        const existingClassIndex = novasClasses.findIndex(c => c.id === classId);
        
        if (existingClassIndex !== -1 && novasClasses[existingClassIndex].tipo === tipo) {
            // Remove a classe se clicar no mesmo tipo
            novasClasses.splice(existingClassIndex, 1);
            
            const button = document.querySelector(`.type-btn[data-emb="${embId}"][data-class="${classId}"][data-type="${tipo}"]`);
            if (button) {
                button.classList.remove('selected');
            }
        } else {
            // Remove a classe existente se houver
            if (existingClassIndex !== -1) {
                novasClasses.splice(existingClassIndex, 1);
            }
            
            // Adiciona a nova classe com o tipo selecionado
            novasClasses.push({ 
                id: classe.id,
                nome: classe.nome,
                cor: classe.cor,
                tipo: tipo
            });
            
            // Atualiza os botões visuais
            const buttons = document.querySelectorAll(`.type-btn[data-emb="${embId}"][data-class="${classId}"]`);
            buttons.forEach(btn => {
                btn.classList.remove('selected');
            });
            
            const selectedButton = document.querySelector(`.type-btn[data-emb="${embId}"][data-class="${classId}"][data-type="${tipo}"]`);
            if (selectedButton) {
                selectedButton.classList.add('selected');
            }
        }
        state.embaladoras[embIndex].classes = novasClasses;
        console.log('Estado atualizado:', state.embaladoras[embIndex]);
        renderGrid();
    }
    function handleSalvarPreset() {
        const nomePreset = document.getElementById('recipe-name').value.trim();
        if (!nomePreset) {
            alert('Por favor, insira um nome para a receita');
            return;
        }
        const editingId = document.getElementById('recipe-name').dataset.editing;
        // Cria uma cópia profunda da configuração atual
        const configuracaoAtual = state.embaladoras.map(emb => ({
            id: emb.id,
            nome: emb.nome,
            classes: emb.classes.map(classe => ({
                id: classe.id,
                nome: classe.nome,
                cor: classe.cor,
                tipo: classe.tipo
            }))
        }));
        console.log('Salvando preset com configuração:', configuracaoAtual);
        const novoPreset = {
            id: editingId ? Number(editandoId) : Date.now(),
            nome: nomePreset,
            configuracao: configuracaoAtual,
            dataCriacao: new Date().toISOString()
        };
        if (editingId) {
            const index = state.presets.findIndex(p => p.id === Number(editandoId));
            if (index !== -1) {
                state.presets[index] = novoPreset;
            }
        } else {
            state.presets.push(novoPreset);
        }
        // Salva no localStorage
        try {
            localStorage.setItem('classification_presets', JSON.stringify(state.presets));
            console.log('Presets salvos no localStorage');
        } catch (error) {
            console.error('Erro ao salvar no localStorage:', error);
        }
        renderPresets();
        document.getElementById('recipe-name').value = '';
        delete document.getElementById('recipe-name').dataset.editing;
        
        // Feedback visual
        const saveBtn = document.getElementById('save-recipe-btn');
        const originalText = saveBtn.textContent;
        saveBtn.textContent = 'Salvo!';
        saveBtn.style.backgroundColor = '#22c55e';
        setTimeout(() => {
            saveBtn.textContent = originalText;
            saveBtn.style.backgroundColor = '';
        }, 1500);
    }
    function renderPresets() {
        const presetList = document.getElementById('recipe-list');
        if (!presetList) return;
        
        presetList.innerHTML = state.presets.map(preset => {
            const embaladorasConfiguradas = preset.configuracao.filter(emb => emb.classes.length > 0).length;
            const totalClasses = preset.configuracao.reduce((acc, emb) => acc + emb.classes.length, 0);
            
            return `
                <div class="recipe-item">
                    <div>
                        <strong>${preset.nome}</strong>
                        <br>
                        <small>${embaladorasConfiguradas} embaladoras • ${totalClasses} classes configuradas</small>
                    </div>
                    <div class="recipe-actions">
                        <button class="btn-action btn-edit" data-id="${preset.id}">Editar</button>
                        <button class="btn-action btn-load" data-id="${preset.id}">Carregar</button>
                        <button class="btn-action btn-delete" data-id="${preset.id}">Excluir</button>
                    </div>
                </div>
            `;
        }).join('');
        
        // Event listeners para os botões
        presetList.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', () => {
                handleEditPreset(btn.getAttribute('data-id'));
            });
        });
        
        presetList.querySelectorAll('.btn-load').forEach(btn => {
            btn.addEventListener('click', () => {
                handleLoadPreset(btn.getAttribute('data-id'));
            });
        });
        
        presetList.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                handleDeletePreset(btn.getAttribute('data-id'));
            });
        });
    }
    function handleLoadPreset(presetId) {
        const preset = state.presets.find(p => p.id === Number(presetId));
        if (!preset) {
            console.error('Preset não encontrado:', presetId);
            return;
        }
        console.log('Carregando preset:', preset);

        // Limpa todas as classes primeiro
        state.embaladoras.forEach(emb => {
            emb.classes = [];
        });

        // Aplica as configurações do preset
        preset.configuracao.forEach(configEmb => {
            const emb = state.embaladoras.find(e => e.id === configEmb.id);
            if (emb && Array.isArray(configEmb.classes)) {
                // Copia todas as propriedades, inclusive tipo
                emb.classes = configEmb.classes.map(classe => ({
                    id: classe.id,
                    nome: classe.nome,
                    cor: classe.cor,
                    tipo: classe.tipo
                }));
            }
        });

        // Força atualização do grid e dos botões
        renderGrid();
        renderStatus();
        renderHeaders();
        renderClassesList();

        hideModal('recipe-modal');
        showNotification('Receita carregada com sucesso!');
    }
    function handleEditPreset(presetId) {
        const preset = state.presets.find(p => p.id === Number(presetId));
        if (!preset) return;
        const nameInput = document.getElementById('recipe-name');
        nameInput.value = preset.nome;
        nameInput.dataset.editing = presetId;
        const saveBtn = document.getElementById('save-recipe-btn');
        saveBtn.textContent = 'Atualizar';
    }
    function handleDeletePreset(presetId) {
        if (confirm('Tem certeza que deseja excluir esta receita?')) {
            state.presets = state.presets.filter(p => p.id !== Number(presetId));
            localStorage.setItem('classification_presets', JSON.stringify(state.presets));
            renderPresets();
            showNotification('Receita excluída com sucesso!');}
    }
    function showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('show');
    }
    function hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('show');
    }
    function setupEventListeners() {
        document.querySelectorAll('.close-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) hideModal(modal.id);
            });
        });
        const recipeBtn = document.getElementById('recipe-btn');
        if (recipeBtn) {
            recipeBtn.addEventListener('click', () => {
                showModal('recipe-modal');
            });
        }
        const saveRecipeBtn = document.getElementById('save-recipe-btn');
        if (saveRecipeBtn) {
            saveRecipeBtn.addEventListener('click', handleSalvarPreset);
        }
        const clearBtn = document.getElementById('clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                state.embaladoras.forEach(emb => emb.classes = []);
                renderGrid();
            });
        }
        const labelsModal = document.getElementById('labels-editor-modal');
        if (labelsModal) {
            const cancelBtn = document.getElementById('labels-cancel');
            if (cancelBtn) cancelBtn.addEventListener('click', () => hideModal('labels-editor-modal'));
            const form = document.getElementById('labels-editor-form');
            if (form) {
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const inputs = [
                        document.getElementById('lbl-C1'),
                        document.getElementById('lbl-C2'),
                        document.getElementById('lbl-C3'),
                        document.getElementById('lbl-C4'),
                        document.getElementById('lbl-C5'),
                        document.getElementById('lbl-C6'),
                        document.getElementById('lbl-C7')
                    ];
                    // Escreve em série para simplificar (pode ser paralelizado se necessário)
                    let ok = true;
                    for (let i = 0; i < inputs.length; i++) {
                        const success = await api.setLabel(i, inputs[i]?.value ?? '');
                        if (!success) ok = false;
                    }
                    if (!ok) {
                        alert('Falha ao salvar algumas faixas no PLC.');
                    }
                    // Atualiza estado e UI
                    const labels = await api.getLabels();
                    if (Array.isArray(labels) && labels.length === 7) {
                        state.dynamicLabels = labels.map(v => (v && v.trim() !== '' ? v.trim() : null));
                        renderGrid();
                        renderClassesList();
                    }
                    hideModal('labels-editor-modal');
                });
                
                // Adiciona event listeners para abrir teclado virtual nos inputs
                setTimeout(() => {
                    const inputs = ['lbl-C1', 'lbl-C2', 'lbl-C3', 'lbl-C4', 'lbl-C5', 'lbl-C6', 'lbl-C7'];
                    inputs.forEach(id => {
                        const input = document.getElementById(id);
                        if (input) {
                            // Remove listeners existentes para evitar duplicação
                            input.removeEventListener('click', abrirTecladoSimples);
                            input.removeEventListener('focus', abrirTecladoSimples);
                            input.removeEventListener('touchstart', abrirTecladoSimples);

                            // Adiciona novos listeners sem bloquear o foco padrão
                            input.addEventListener('click', () => {
                                abrirTecladoSimples(input);
                            });
                            input.addEventListener('focus', () => {
                                abrirTecladoSimples(input);
                            });
                            input.addEventListener('touchstart', () => {
                                abrirTecladoSimples(input);
                            }, { passive: true });
                        }
                    });
                }, 100);
            }
        }
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) hideModal(modal.id);
            });
        });
    }

    // Initialization
    function initialize() {
        renderStatus();
        renderHeaders();
        renderGrid();
        renderClassesList();
        renderPresets();
        setupEventListeners();

        // Carrega nomes dinâmicos das classes (C1..C7) como na tela de faixa de peso
        api.getLabels().then((labels) => {
            if (Array.isArray(labels) && labels.length === 7) {
                state.dynamicLabels = labels.map(v => (v && v.trim() !== '' ? v.trim() : null));
                // Re-renderiza para refletir nomes adicionais
                renderGrid();
                renderClassesList();
            }
        });

        // Polling periódico para atualizar nomes das faixas do PLC automaticamente
        const LABEL_REFRESH_MS = 2000; // 2s (ajuste se necessário)
        let labelTimer = setInterval(async () => {
            try {
                const labels = await api.getLabels();
                if (Array.isArray(labels) && labels.length === 7) {
                    const normalized = labels.map(v => (v && v.trim() !== '' ? v.trim() : null));
                    if (!arraysEqual(state.dynamicLabels, normalized)) {
                        state.dynamicLabels = normalized;
                        renderClassesList();
                    }
                }
            } catch (_) { /* ignora erros transitórios */ }
        }, LABEL_REFRESH_MS);

        // Polling do alerta de parada
        const ALERT_REFRESH_MS = 1000;
        let lastAlertText = '';
        let lastVisible = false;
        let lastGreenVisible = false;
        let alertTimer = setInterval(async () => {
            const { rawAlert, rawStatus } = await getAlertAndStatus();
            const text = computeAlertText(rawAlert);
            const bit8Set = ((rawStatus >>> 8) & 1) === 1; // bit 8 == 1?
            const visible = (rawAlert !== 0) && !bit8Set;
            const showGreen = bit8Set; // quando bit8 = 1, mostra garra verde animada

            if (text !== lastAlertText || visible !== lastVisible || showGreen !== lastGreenVisible) {
                lastAlertText = text;
                lastVisible = visible;
                lastGreenVisible = showGreen;
                renderAlert(text, visible);
                renderClaw(visible);
                renderClawGreen(showGreen);
            }
        }, ALERT_REFRESH_MS);

        // Pausa quando aba não está visível para economizar recursos
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (labelTimer) { clearInterval(labelTimer); labelTimer = null; }
                if (alertTimer) { clearInterval(alertTimer); alertTimer = null; }
            } else if (!labelTimer) {
                labelTimer = setInterval(async () => {
                    try {
                        const labels = await api.getLabels();
                        if (Array.isArray(labels) && labels.length === 7) {
                            const normalized = labels.map(v => (v && v.trim() !== '' ? v.trim() : null));
                            if (!arraysEqual(state.dynamicLabels, normalized)) {
                                state.dynamicLabels = normalized;
                                renderClassesList();
                            }
                        }
                    } catch (_) {}
                }, LABEL_REFRESH_MS);
                if (!alertTimer) {
                    alertTimer = setInterval(async () => {
                        const { rawAlert, rawStatus } = await getAlertAndStatus();
                        const text = computeAlertText(rawAlert);
                        const bit8Set = ((rawStatus >>> 8) & 1) === 1;
                        const visible = (rawAlert !== 0) && !bit8Set;
                        const showGreen = bit8Set;
                        if (text !== lastAlertText || visible !== lastVisible || showGreen !== lastGreenVisible) {
                            lastAlertText = text;
                            lastVisible = visible;
                            lastGreenVisible = showGreen;
                            renderAlert(text, visible);
                            renderClaw(visible);
                            renderClawGreen(showGreen);
                        }
                    }, ALERT_REFRESH_MS);
                }
            }
        });

        // Simulate active status updates
        setInterval(() => {
            state.embaladoras = state.embaladoras.map(emb => ({
                ...emb,
                ativo: Math.random() > 0.3
            }));
            renderStatus();
        }, 5000);
    }

    // Start initialization
    initialize();
}

// Funções para o teclado virtual simples
let currentInput = null;
let suppressKeyboardOpenUntil = 0;

function abrirTecladoSimples(inputEl) {
    if (Date.now() < suppressKeyboardOpenUntil) {
        return;
    }
    console.log('Abrindo teclado para:', inputEl.id);
    currentInput = inputEl;
    const teclado = document.getElementById('simple-keyboard');
    const input = document.getElementById('keyboard-input');
    
    if (teclado && input) {
        // Garante que o teclado esteja fora de contextos de empilhamento (ex.: menu)
        try {
            if (teclado.parentNode !== document.body) {
                document.body.appendChild(teclado);
            }
        } catch (_) {}
        input.value = inputEl.value || '';
        teclado.style.display = 'block';
        input.focus();
        console.log('Teclado aberto');
    } else {
        console.log('Erro: teclado ou input não encontrado');
    }
}

function fecharTecladoSimples(confirmar) {
    const teclado = document.getElementById('simple-keyboard');
    const input = document.getElementById('keyboard-input');
    
    if (confirmar && currentInput && input) {
        const novoValor = input.value.trim();
        currentInput.value = novoValor;
        try {
            currentInput.dispatchEvent(new Event('input', { bubbles: true }));
            currentInput.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (_) {}
    }
    
    if (teclado) {
        teclado.style.display = 'none';
    }
    // Evita reabrir imediatamente ao perder/ganhar foco
    suppressKeyboardOpenUntil = Date.now() + 400;
    if (currentInput) {
        try { currentInput.blur(); } catch (_) {}
    }
    currentInput = null;
}

// Event listeners para o teclado virtual simples
function setupVirtualKeyboard() {
    const teclado = document.getElementById('simple-keyboard');
    if (!teclado) return;
    if (teclado.dataset.bound === 'true') return; // evita bind duplicado
    teclado.dataset.bound = 'true';
    
    // Impede propagação para elementos atrás
    const stop = (e) => { e.stopPropagation(); };
    // Use apenas mousedown/touchstart para bloquear "fechar ao clicar fora"
    teclado.addEventListener('mousedown', stop);
    teclado.addEventListener('touchstart', stop, { passive: true });

    // Manipulação das teclas
    teclado.addEventListener('click', function(e) {
        const btn = e.target.closest('.key-btn');
        if (!btn) return;

        e.preventDefault();
        e.stopPropagation();

        const input = document.getElementById('keyboard-input');
        if (!input) return;

        const key = btn.dataset.key;
        console.log('Virtual key click:', key);

        if (key === 'backspace') {
            input.value = input.value.slice(0, -1);
        } else if (key === 'ok') {
            fecharTecladoSimples(true);
        } else if (key === 'cancel') {
            fecharTecladoSimples(false);
        } else if (key === 'space') {
            input.value += ' ';
        } else if (key) {
            input.value += key;
        }

        input.focus();
    });

    // Suporte a teclado físico quando o campo do teclado virtual estiver focado
    const kbdInput = document.getElementById('keyboard-input');
    if (kbdInput && kbdInput.dataset.bound !== 'true') {
        kbdInput.dataset.bound = 'true';
        kbdInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                fecharTecladoSimples(true);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                fecharTecladoSimples(false);
            }
        });
    }

    // Fecha ao clicar fora do teclado
    const shouldIgnoreTarget = (el) => {
        if (!el) return false;
        if (el.closest && el.closest('#simple-keyboard')) return true; // clique dentro do teclado
        // campos que disparam a abertura do teclado
        if (el.id && /^lbl-C[1-7]$/.test(el.id)) return true;
        return false;
    };
    const outsideHandler = (e) => {
        const isVisible = teclado && teclado.style.display !== 'none';
        if (!isVisible) return;
        const target = e.target;
        if (shouldIgnoreTarget(target)) return;
        fecharTecladoSimples(false);
    };
    document.addEventListener('mousedown', outsideHandler, true);
    document.addEventListener('touchstart', outsideHandler, { passive: true, capture: true });
}

// Garante inicialização mesmo se o script carregar após DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupVirtualKeyboard);
} else {
    setupVirtualKeyboard();
}

// Call the initialization function when the page loads
document.addEventListener('DOMContentLoaded', function() {
    inicializarClassification();
});