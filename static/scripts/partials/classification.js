function inicializarClassification() {
    console.log('Inicializando Classification...');
    const state = {
        embaladoras: [
            { id: 'IND', nome: 'IND', ativo: false, classes: [] },
            { id: 'E01', nome: 'E01', ativo: false, classes: [] },
            { id: 'E02', nome: 'E02', ativo: false, classes: [] },
            { id: 'E03', nome: 'E03', ativo: false, classes: [] },
            { id: 'E04', nome: 'E04', ativo: false, classes: [] },
            { id: 'E05', nome: 'E05', ativo: false, classes: [] },
            { id: 'E06', nome: 'E06', ativo: false, classes: [] },
            { id: 'E07', nome: 'E07', ativo: false, classes: [] },
            { id: 'E08', nome: 'E08', ativo: false, classes: [] },
            { id: 'E09', nome: 'E09', ativo: false, classes: [] },
            { id: 'E10', nome: 'E10', ativo: false, classes: [] },
            { id: 'E11', nome: 'E11', ativo: false, classes: [] },
            { id: 'SPJ', nome: 'SPJ', ativo: false, classes: [] }
        ],
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
        tiposOvo: ['branco', 'vermelho', 'misto']
    };
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
        
        const fixedPositions = state.classesOvos.map((classe, index) => ({
            id: classe.id,
            top: index * 40 + 10,
            cor: classe.cor
        }));
        return fixedPositions.map(position => {
            const selectedClass = classes.find(c => c.id === position.id);
            if (selectedClass) {
                // Não mostra a letra do tipo na tela, apenas aplica a classe CSS
                return `
                    <div class="egg-class-item tipo-${selectedClass.tipo}" style="
                        background-color: ${position.cor};
                        top: ${position.top}px;
                    "></div>
                `;
            }
            return '';
        }).join('');
    }
    function renderClassesList() {
        const classList = document.getElementById('classes-list');
        if (!classList) return;
        
        classList.innerHTML = state.classesOvos.map(classe => `
            <div class="egg-class">
                <div class="egg-color" style="background-color: ${classe.cor}"></div>
                <span>${classe.nome}</span>
            </div>
        `).join('');
    }
    function showClassModal(embaladora) {
        if (!embaladora) return;
        console.log('Showing modal for:', embaladora.nome);
        const modal = document.getElementById('class-modal');
        const selectedEmbSpan = document.getElementById('selected-embaladora');
        const options = document.getElementById('class-options');
        
        if (!modal || !selectedEmbSpan || !options) return;
        selectedEmbSpan.textContent = embaladora.nome;
        
        options.innerHTML = state.classesOvos.map(classe => {
            const existingClass = embaladora.classes.find(c => c.id === classe.id);
            const selectedType = existingClass?.tipo || '';
            
            return `
                <div class="class-option">
                    <div class="color-box" style="background-color: ${classe.cor};"></div>
                    <span>${classe.nome}</span>
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

// Call the initialization function when the page loads
document.addEventListener('DOMContentLoaded', function() {
    inicializarClassification();
});