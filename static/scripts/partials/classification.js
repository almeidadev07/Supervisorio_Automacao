function inicializarClassification() {
    console.log('Inicializando Classification...');

    // Estado inicial
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
        presets: [], // Add presets array
        tiposOvo: ['branco', 'vermelho', 'misto'] // Add egg types
    };

    // Renderização inicial
    function renderStatus() {
        const statusRow = document.getElementById('status-row');
        statusRow.innerHTML = state.embaladoras.map(emb => `
            <div class="status-cell">
                <div class="status-indicator ${emb.ativo ? 'status-active' : 'status-inactive'}"></div>
            </div>
        `).join('');
    }

    function renderHeaders() {
        const headerRow = document.getElementById('header-row');
        headerRow.innerHTML = state.embaladoras.map(emb => `
            <div class="header-cell">${emb.nome}</div>
        `).join('');
    }

    function renderGrid() {
        const grid = document.getElementById('embaladora-grid');
        if (!grid) return;
    
        grid.innerHTML = state.embaladoras.map(emb => `
            <div class="embaladora-column" data-id="${emb.id}" onclick="handleEmbaladoraClick('${emb.id}')">
                ${renderClasses(emb.classes)}
            </div>
        `).join('');
    }
    
    // Update handleEmbaladoraClick function
    window.handleEmbaladoraClick = function(embId) {
        console.log('Clicked embaladora:', embId); // Debug
        const embaladora = state.embaladoras.find(e => e.id === embId);
        if (embaladora) {
            state.selectedEmbaladora = embaladora; // Set selected embaladora
            showClassModal(embaladora);
        }
    };
    

    window.handleEmbaladoraClick = function(embId) {
        const embaladora = state.embaladoras.find(e => e.id === embId);
        if (embaladora) {
            state.selectedEmbaladora = embaladora;
            showClassModal(embaladora);
        }
    };

    function renderClasses(classes) {
        return classes.map((classe, index) => `
            <div class="egg-class-item tipo-${classe.tipo || ''}" style="
                background-color: ${classe.cor};
                top: ${index * 40}px;
            ">
                ${classe.tipo ? `<span class="tipo-indicator">${classe.tipo.charAt(0).toUpperCase()}</span>` : ''}
            </div>
        `).join('');
    }

    function renderClassesList() {
        const classList = document.getElementById('classes-list');
        classList.innerHTML = state.classesOvos.map(classe => `
            <div class="egg-class">
                <div class="egg-color" style="background-color: ${classe.cor}"></div>
                <span>${classe.nome}</span>
            </div>
        `).join('');
    }

    // Modal handling
    function showClassModal(embaladora) {
        if (!embaladora) return;
        console.log('Showing modal for:', embaladora.nome); // Debug
    
        const modal = document.getElementById('class-modal');
        const selectedEmbSpan = document.getElementById('selected-embaladora');
        const options = document.getElementById('class-options');
        
        if (!modal || !selectedEmbSpan || !options) return;
    
        selectedEmbSpan.textContent = embaladora.nome;
        
        options.innerHTML = state.classesOvos.map(classe => `
            <div class="class-option">
                <div class="color-box" style="background-color: ${classe.cor}"></div>
                <span>${classe.nome}</span>
                <div class="type-buttons">
                    <button class="type-btn" onclick="handleClassSelection('${embaladora.id}', '${classe.id}', 'branco')">
                        Branco
                    </button>
                    <button class="type-btn" onclick="handleClassSelection('${embaladora.id}', '${classe.id}', 'vermelho')">
                        Vermelho
                    </button>
                    <button class="type-btn" onclick="handleClassSelection('${embaladora.id}', '${classe.id}', 'misto')">
                        Misto
                    </button>
                </div>
            </div>
        `).join('');
    
        modal.classList.add('show');
    }
    function handleSalvarPreset() {
        const nomePreset = document.getElementById('recipe-name').value.trim();
        if (!nomePreset) return;

        const novoPreset = {
            id: Date.now(),
            nome: nomePreset,
            configuracao: state.embaladoras.map(emb => ({
                id: emb.id,
                classes: [...emb.classes]
            }))
        };

        state.presets.push(novoPreset);
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
                    <button onclick="handleEditPreset(${preset.id})" class="btn-action btn-edit">Editar</button>
                    <button onclick="handleLoadPreset(${preset.id})" class="btn-action btn-load">Carregar</button>
                    <button onclick="handleDeletePreset(${preset.id})" class="btn-action btn-delete">Excluir</button>
                </div>
            </div>
        `).join('');
    }


    window.handleClassSelection = function (embId, classeId, tipo) {
        console.log('Selection:', embId, classeId, tipo); // Debug log
    
        // Find the selected embaladora and class
        const embaladora = state.embaladoras.find(e => e.id === embId);
        const classe = state.classesOvos.find(c => c.id === classeId);
    
        if (!embaladora || !classe) {
            console.error('Not found:', !embaladora ? 'embaladora' : 'classe');
            return;
        }
    
        // Find the index of the selected embaladora
        const embIndex = state.embaladoras.findIndex(e => e.id === embId);
        if (embIndex === -1) return;
    
        // Clone the current classes for the selected embaladora
        const novasClasses = [...state.embaladoras[embIndex].classes];
    
        // Check if the exact class and type already exists
        const existingClassWithSameType = novasClasses.findIndex(c =>
            c.id === classeId && c.tipo === tipo
        );
    
        if (existingClassWithSameType !== -1) {
            // If the same class and type exists, remove it (toggle off)
            novasClasses.splice(existingClassWithSameType, 1);
        } else {
            // Check if the class exists with a different type
            const existingClassIndex = novasClasses.findIndex(c => c.id === classeId);
    
            if (existingClassIndex !== -1) {
                // Update the existing class with the new type
                novasClasses[existingClassIndex] = { ...classe, tipo };
            } else {
                // Add the new class with the selected type
                novasClasses.push({ ...classe, tipo });
            }
        }
    
        // Sort the classes to maintain fixed positions
        novasClasses.sort((a, b) => {
            const aIndex = state.classesOvos.findIndex(c => c.id === a.id);
            const bIndex = state.classesOvos.findIndex(c => c.id === b.id);
            return aIndex - bIndex;
        });
    
        // Update the state for the selected embaladora
        state.embaladoras[embIndex].classes = novasClasses;
    
        // Re-render the grid to reflect the changes
        renderGrid();
    
        // Close the modal
        const modal = document.getElementById('class-modal');
        if (modal) modal.classList.remove('show');
    };

    window.handleLoadPreset = function(presetId) {
        const preset = state.presets.find(p => p.id === presetId);
        if (preset) {
            state.embaladoras = state.embaladoras.map(emb => {
                const config = preset.configuracao.find(c => c.id === emb.id);
                return config ? { ...emb, classes: [...config.classes] } : { ...emb, classes: [] };
            });
            renderGrid();
            const modal = document.getElementById('recipe-modal');
            modal.classList.remove('show');
        }
    };

    window.handleDeletePreset = function(presetId) {
        state.presets = state.presets.filter(p => p.id !== presetId);
        renderPresets();
    };

    window.handleEditPreset = function(presetId) {
        const preset = state.presets.find(p => p.id === presetId);
        if (preset) {
            document.getElementById('recipe-name').value = preset.nome;
            // Mark as editing
            document.getElementById('recipe-name').dataset.editing = presetId;
        }
    };

    // Update save button handler
    document.getElementById('save-recipe-btn').addEventListener('click', () => {
        const nameInput = document.getElementById('recipe-name');
        const name = nameInput.value.trim();
        const editingId = nameInput.dataset.editing;

        if (!name) return;

        const config = state.embaladoras.map(emb => ({
            id: emb.id,
            classes: [...emb.classes]
        }));

        if (editingId) {
            // Update existing
            const index = state.presets.findIndex(p => p.id === Number(editingId));
            if (index !== -1) {
                state.presets[index] = {
                    ...state.presets[index],
                    nome: name,
                    configuracao: config
                };
            }
            delete nameInput.dataset.editing;
        } else {
            // Add new
            state.presets.push({
                id: Date.now(),
                nome: name,
                configuracao: config
            });
        }

        nameInput.value = '';
        renderPresets();
    });

    function showClassModal(embaladora) {
        const modal = document.getElementById('class-modal');
        const selectedEmbSpan = document.getElementById('selected-embaladora');
        const options = document.getElementById('class-options');
        
        if (!modal || !selectedEmbSpan || !options) return;

        state.selectedEmbaladora = embaladora; // Make sure to set selected embaladora
        selectedEmbSpan.textContent = embaladora.nome;
        
        options.innerHTML = state.classesOvos.map(classe => `
            <div class="class-option">
                <div class="color-box" style="background-color: ${classe.cor}"></div>
                <span>${classe.nome}</span>
                <div class="type-buttons">
                    <button class="type-btn" onclick="window.handleClassSelection('${embaladora.id}', '${classe.id}', 'branco')">
                        Branco
                    </button>
                    <button class="type-btn" onclick="window.handleClassSelection('${embaladora.id}', '${classe.id}', 'vermelho')">
                        Vermelho
                    </button>
                    <button class="type-btn" onclick="window.handleClassSelection('${embaladora.id}', '${classe.id}', 'misto')">
                        Misto
                    </button>
                </div>
            </div>
        `).join('');

        modal.classList.add('show');
    }

    // Remove the duplicate handleClassSelection function and keep only this global version
    window.handleClassSelection = function(embId, classeId, tipo) {
        console.log('Selection:', embId, classeId, tipo); // Debug log

        const embaladora = state.embaladoras.find(e => e.id === embId);
        const classe = state.classesOvos.find(c => c.id === classeId);
        
        if (!embaladora || !classe) {
            console.log('Not found:', !embaladora ? 'embaladora' : 'classe');
            return;
        }

        const embIndex = state.embaladoras.findIndex(e => e.id === embId);
        if (embIndex === -1) return;

        // Add or update class
        const novasClasses = [...state.embaladoras[embIndex].classes];
        const classeIndex = novasClasses.findIndex(c => c.id === classeId);
        
        if (classeIndex !== -1) {
            novasClasses[classeIndex] = { ...classe, tipo };
        } else {
            novasClasses.push({ ...classe, tipo });
        }

        state.embaladoras[embIndex].classes = novasClasses;
        renderGrid();
        
        const modal = document.getElementById('class-modal');
        if (modal) modal.classList.remove('show');
    };
    // Atualiza função renderClasses para mostrar indicador de tipo
    function renderClasses(classes) {
        // Create a map of all possible positions
        const fixedPositions = state.classesOvos.map((classe, index) => ({
            id: classe.id,
            top: index * 40 + 10, // Starting from 10px, 40px spacing
            cor: classe.cor
        }));
    
        // Generate all slots, filling with selected classes where they exist
        return fixedPositions.map(position => {
            const selectedClass = classes.find(c => c.id === position.id);
            if (selectedClass) {
                return `
                    <div class="egg-class-item tipo-${selectedClass.tipo}" style="
                        background-color: ${position.cor};
                        top: ${position.top}px;
                    "></div>
                `;
            }
            return ''; // Empty slot
        }).join('');
    }

    // Modal handling
    function showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('show');
    }

    function hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('show');
    }

    // Event Handlers
    function setupEventListeners() {
        // Close buttons
        document.querySelectorAll('.close-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) hideModal(modal.id);
            });
        });

        // Recipe button
        document.getElementById('recipe-btn').addEventListener('click', () => {
            showModal('recipe-modal');
        });

        // Save recipe button
        document.getElementById('save-recipe-btn').addEventListener('click', handleSalvarPreset);

        // Clear button
        document.getElementById('clear-btn').addEventListener('click', () => {
            state.embaladoras.forEach(emb => emb.classes = []);
            renderGrid();
        });

        // Click outside modal to close
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

// Export to global scope
window.inicializarClassification = inicializarClassification;
window.handleClassSelection = handleClassSelection;
window.handleLoadPreset = handleLoadPreset;
window.carregarPreset = carregarPreset;
window.excluirPreset = excluirPreset;