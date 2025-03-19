function inicializarWeightRange() {
    console.log('Inicializando Weight Range...');

    // Configurações
    const MAX_TOTAL = 150;
    const colors = ['#FF1493', '#FFFF00', '#0000FF', '#00FF00', '#FF4500', '#00BFFF', '#00FFBF'];
    let activeSetup = 1;
    
    // Estado inicial
    let setups = {
        0: [25, 10, 15, 15, 10, 15, 10],
        1: [25, 10, 15, 15, 10, 15, 10],
        2: [25, 10, 15, 15, 10, 15, 10],
        3: [25, 10, 15, 15, 10, 15, 10]
    };

    // Elementos DOM
    const container = document.getElementById('weight-range-container');
    const mainBar = document.getElementById('main-bar');
    const segments = document.querySelectorAll('.segment');
    const inputs = Array.from(document.querySelectorAll('.weight-input'));
    const saveBtn = document.getElementById('save-button');
    const exportBtn = document.getElementById('export-button');
    const importBtn = document.getElementById('import-button');

    // Setup selection
    const setupInputs = document.querySelectorAll('input[name="setup"]');
    
    setupInputs.forEach(input => {
        input.addEventListener('change', () => {
            activeSetup = parseInt(input.value);
            updateDisplay();
        });
    });

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
            
            // Atualiza largura da barra
            const percentage = (newValue / MAX_TOTAL) * 100;
            segments[index].style.width = `${percentage}%`;
            updateSegmentValue(segments[index], newValue);
            
            updateTotal();
        }
    }

    // Eventos dos inputs
    inputs.forEach((input, index) => {
        input.addEventListener('change', () => {
            const value = parseInt(input.value) || 0;
            updateInputValue(index, value);
        });
    })

    // Salvar configurações
    function saveSetups() {
        fetch('/api/setups', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(setups)
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                alert('Configurações salvas com sucesso!');
            } else {
                throw new Error(data.error || 'Erro ao salvar');
            }
        })
        .catch(error => {
            console.error('Erro:', error);
            alert('Erro ao salvar configurações: ' + error.message);
        });
    }

    // Exportar configurações
    function exportSetups() {
        window.location.href = '/api/export';
    }

    // Importar configurações
    function importSetups() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = function(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            const formData = new FormData();
            formData.append('file', file);
            
            fetch('/api/import', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    alert('Configurações importadas com sucesso!');
                    loadSetups(); // Recarrega as configurações
                } else {
                    throw new Error(data.error || 'Erro ao importar');
                }
            })
            .catch(error => {
                console.error('Erro:', error);
                alert('Erro ao importar configurações: ' + error.message);
            });
        };
        
        input.click();
    }

    // Carrega configurações do servidor
    function loadSetups() {
        fetch('/api/setups')
            .then(response => response.json())
            .then(data => {
                setups = data;
                updateDisplay();
            })
            .catch(error => {
                console.error('Erro ao carregar configurações:', error);
            });
    }
    // Atualiza display
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

    // Atualiza total
    function updateTotal() {
        const total = setups[activeSetup].reduce((sum, val) => sum + val, 0);
        const totalDisplay = document.getElementById('total-weight');
        if (totalDisplay) {
            totalDisplay.textContent = total;
            totalDisplay.style.color = total > MAX_TOTAL ? 'red' : 'black';
        }
    }

    // Inicialização
    if (saveBtn) saveBtn.addEventListener('click', saveSetups);
    if (exportBtn) exportBtn.addEventListener('click', exportSetups);
    if (importBtn) importBtn.addEventListener('click', importSetups);
    
    initializeDragEvents();
    loadSetups();
}

// Exporta função para escopo global
window.inicializarWeightRange = inicializarWeightRange;