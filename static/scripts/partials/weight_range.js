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

    // Inicializa eventos de arrastar
    function initializeDragEvents() {
        segments.forEach((segment, index) => {
            let isDragging = false;
            let startX;
            let startWidth;

            segment.addEventListener('mousedown', (e) => {
                isDragging = true;
                startX = e.clientX;
                startWidth = segment.offsetWidth;
                
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });

            function onMouseMove(e) {
                if (!isDragging) return;
                
                const delta = e.clientX - startX;
                const newWidth = Math.max(10, Math.min(90, startWidth + delta));
                const percentage = (newWidth / mainBar.offsetWidth) * 100;
                
                segment.style.width = `${percentage}%`;
                updateInputValue(index, Math.round((percentage / 100) * MAX_TOTAL));
            }

            function onMouseUp() {
                isDragging = false;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            }
        });
    }

    // Atualiza valor do input
    function updateInputValue(index, value) {
        if (inputs[index]) {
            inputs[index].value = value;
            setups[activeSetup][index] = value;
            updateTotal();
        }
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
            }
            if (inputs[index]) {
                inputs[index].value = value;
            }
        });
        updateTotal();
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