function inicializarWeightRange() {
    console.log('Inicializando Weight Range...'); 

    // Configuração inicial
    const MAX_TOTAL = 150;
    const colors = ['#FF1493', '#FFFF00', '#0000FF', '#00FF00', '#FF4500', '#00BFFF', '#00FFBF'];
    let activeSetup = 1;
    
    // Armazenamento de configurações
    const setups = {
        0: [],
        1: [25, 10, 15, 15, 10, 15, 10],
        2: [],
        3: []
    };

    // Criar estrutura HTML
    const container = document.getElementById('weight-range-container');
    if (!container) {
        console.error('Container weight-range-container não encontrado!');
        return;
    }

    container.innerHTML = `
        <div class="weight-range-content">
            <div class="setup-selection">
                <div class="setup-radios">
                    <input type="radio" name="setup" value="0" id="setup0">
                    <input type="radio" name="setup" value="1" id="setup1" checked>
                    <input type="radio" name="setup" value="2" id="setup2">
                    <input type="radio" name="setup" value="3" id="setup3">
                </div>
            </div>
            
            <div id="main-bar" class="weight-bar">
                ${Array(7).fill(0).map((_, i) => `
                    <div class="segment" style="width: ${(100/7)}%; background-color: ${colors[i]}"></div>
                `).join('')}
            </div>
            
            <div class="weight-inputs">
                ${Array(7).fill(0).map((_, i) => `
                    <div class="input-group">
                        <input type="number" class="weight-input" value="0" min="0" max="${MAX_TOTAL}">
                        <div class="range-value"><span>0</span>g</div>
                    </div>
                `).join('')}
            </div>
            
            <div class="total-weight">
                Total: <span id="total-weight">0</span>g
            </div>
            
            <div class="buttons">
                <button id="save-button">Salvar</button>
                <button id="export-button">Exportar</button>
                <button id="import-button">Importar</button>
            </div>
        </div>
    `;

    // Elementos DOM
    const mainBar = document.getElementById('main-bar');
    const segments = document.querySelectorAll('.segment');
    const inputs = Array.from(document.querySelectorAll('.weight-input'));
    const rangeValues = Array.from(document.querySelectorAll('.range-value span'));
    const totalWeightDisplay = document.getElementById('total-weight');
    const setupRadios = document.querySelectorAll('input[name="setup"]');
    const saveButton = document.getElementById('save-button');
    const exportButton = document.getElementById('export-button');
    const importButton = document.getElementById('import-button');

    // Inicializar eventos
    setupDragEvents();
    setupInputEvents();
    setupSetupEvents();
    setupButtonEvents();
    loadSetupsFromAPI();
    updateAllSegments();
    updateTotalWeight();

    // Funções auxiliares
    function setupDragEvents() {
        let isDragging = false;
        let currentSegment = null;
        let startX, startWidth, nextSegment, nextStartWidth;
        
        segments.forEach((segment, index) => {
            segment.addEventListener('mousedown', initDrag);
            segment.addEventListener('touchstart', initDrag);
        });

        function initDrag(e) {
            e.preventDefault();
            isDragging = true;
            currentSegment = Array.from(segments).indexOf(this);
            
            startX = e.type === 'mousedown' ? e.clientX : e.touches[0].clientX;
            startWidth = parseFloat(this.style.width);
            
            if (currentSegment < segments.length - 1) {
                nextSegment = segments[currentSegment + 1];
                nextStartWidth = parseFloat(nextSegment.style.width);
            }
            
            document.addEventListener(e.type === 'mousedown' ? 'mousemove' : 'touchmove', onMove);
            document.addEventListener(e.type === 'mousedown' ? 'mouseup' : 'touchend', onEnd);
        }

        function onMove(e) {
            if (!isDragging) return;
            
            const x = e.type === 'mousemove' ? e.clientX : e.touches[0].clientX;
            const barWidth = mainBar.clientWidth;
            const diffX = x - startX;
            const diffPercentage = (diffX / barWidth) * 100;
            
            updateSegmentsOnDrag(diffPercentage);
        }

        function onEnd() {
            isDragging = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchend', onEnd);
        }
    }

    function setupInputEvents() {
        inputs.forEach((input, index) => {
            input.addEventListener('change', function() {
                const value = Math.min(Math.max(0, parseInt(this.value) || 0), MAX_TOTAL);
                this.value = value;
                setups[activeSetup][index] = value;
                updateAllSegments();
                updateTotalWeight();
            });
        });
    }

    function updateAllSegments() {
        const currentSetupValues = setups[activeSetup];
        
        currentSetupValues.forEach((value, index) => {
            if (index < inputs.length) {
                inputs[index].value = value;
                rangeValues[index].textContent = value;
                segments[index].style.width = ((value / MAX_TOTAL) * 100) + '%';
            }
        });
    }

    function updateTotalWeight() {
        const total = setups[activeSetup].reduce((sum, val) => sum + val, 0);
        totalWeightDisplay.textContent = total;
        totalWeightDisplay.style.color = total > MAX_TOTAL ? 'red' : 'black';
    }

    function loadSetupsFromAPI() {
        fetch('/api/setups')
            .then(response => response.json())
            .then(data => {
                Object.assign(setups, data);
                updateAllSegments();
                updateTotalWeight();
            })
            .catch(error => console.error('Erro ao carregar setups:', error));
    }
}

// Exportar função para o escopo global
window.inicializarWeightRange = inicializarWeightRange;