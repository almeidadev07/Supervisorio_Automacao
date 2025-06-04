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
        const fixedPositions = state.classesOvos.map((classe, index) => ({
            id: classe.id,
            top: index * 40 + 10,
            cor: classe.cor
        }));
    
        return fixedPositions.map(position => {
            const selectedClass = classes.find(c => c.id === position.id);
            if (selectedClass) {
                return `
                    <div class="egg-class-item tipo-${selectedClass.tipo}" style="
                        color: ${position.cor};
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
                    <div class="color-box" style="width: 20px; height: 20px; background-color: ${classe.cor}; border-radius: 50%;"></div>
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
    function handleClassSelection(embId, classeId, tipo) {
        console.log('Selection:', embId, classeId, tipo);
    
        const embaladora = state.embaladoras.find(e => e.id === embId);
        const classe = state.classesOvos.find(c => c.id === classeId);
        
        if (!embaladora || !classe) return;
    
        const embIndex = state.embaladoras.findIndex(e => e.id === embId);
        if (embIndex === -1) return;
    
        const novasClasses = [...state.embaladoras[embIndex].classes];
        const existingClassIndex = novasClasses.findIndex(c => c.id === classeId);
        
        if (existingClassIndex !== -1 && novasClasses[existingClassIndex].tipo === tipo) {
            novasClasses.splice(existingClassIndex, 1);
            
            const button = document.querySelector(`.type-btn[data-emb="${embId}"][data-class="${classeId}"][data-type="${tipo}"]`);
            if (button) {
                button.classList.remove('selected');
            }
        } else {
            if (existingClassIndex !== -1) {
                novasClasses.splice(existingClassIndex, 1);
            }
            
            novasClasses.push({ ...classe, tipo });
            
            const buttons = document.querySelectorAll(`.type-btn[data-emb="${embId}"][data-class="${classeId}"]`);
            buttons.forEach(btn => {
                btn.classList.remove('selected');
            });
            
            const selectedButton = document.querySelector(`.type-btn[data-emb="${embId}"][data-class="${classeId}"][data-type="${tipo}"]`);
            if (selectedButton) {
                selectedButton.classList.add('selected');
            }
        }
    
        state.embaladoras[embIndex].classes = novasClasses;
        renderGrid();
    }
    function handleSalvarPreset() {
        const nomePreset = document.getElementById('recipe-name').value.trim();
        if (!nomePreset) return;
        const editingId = document.getElementById('recipe-name').dataset.editing;
        
        if (editingId) {
            const index = state.presets.findIndex(p => p.id === Number(editingId));
            if (index !== -1) {
                state.presets[index] = {
                    ...state.presets[index],
                    nome: nomePreset,
                    configuracao: state.embaladoras.map(emb => ({
                        id: emb.id,
                        classes: [...emb.classes]
                    }))
                };
            }
            delete document.getElementById('recipe-name').dataset.editing;
        } else {
            const novoPreset = {
                id: Date.now(),
                nome: nomePreset,
                configuracao: state.embaladoras.map(emb => ({
                    id: emb.id,
                    classes: [...emb.classes]
                }))
            };
            state.presets.push(novoPreset);
        }
        renderPresets();
        document.getElementById('recipe-name').value = '';
    }
    function renderPresets() {
        const presetList = document.getElementById('recipe-list');
        if (!presetList) return;
        presetList.innerHTML = state.presets.map(preset => `
            <div class="recipe-item">
                <span>${preset.nome}</span>
                <div class="recipe-actions">
                    <button class="btn-action btn-edit" data-id="${preset.id}">Editar</button>
                    <button class="btn-action btn-load" data-id="${preset.id}">Carregar</button>
                    <button class="btn-action btn-delete" data-id="${preset.id}">Excluir</button>
                </div>
            </div>
        `).join('');
        
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
        if (preset) {
            state.embaladoras = state.embaladoras.map(emb => {
                const config = preset.configuracao.find(c => c.id === emb.id);
                return config ? { ...emb, classes: [...config.classes] } : { ...emb, classes: [] };
            });
            renderGrid();
            const modal = document.getElementById('recipe-modal');
            modal.classList.remove('show');
        }
    }
    function handleDeletePreset(presetId) {
        state.presets = state.presets.filter(p => p.id !== Number(presetId));
        renderPresets();
    }
    function handleEditPreset(presetId) {
        const preset = state.presets.find(p => p.id === Number(presetId));
        if (preset) {
            document.getElementById('recipe-name').value = preset.nome;
            document.getElementById('recipe-name').dataset.editing = presetId;
        }
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