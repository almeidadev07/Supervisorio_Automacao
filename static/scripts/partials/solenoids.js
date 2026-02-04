/**
 * Solenoids Control Screen
 * Controle de Solenoides
 */

(function() {
    'use strict';

    // Estado dos solenoides
    let solenoidStates = {};
    let controlStates = {
        'teste': false,
        'amaciar': false
    };
    let solenoidsEventListeners = [];

    function registerSolenoidsEventListener(element, event, handler) {
        if (element) {
            element.addEventListener(event, handler);
            solenoidsEventListeners.push({ element, event, handler });
        }
    }

    /**
     * Inicializa a tela de solenoides
     */
    function inicializarSolenoids() {
        console.log('🔧 Inicializando sistema de Solenoides...');
        
        // Evita duplicação de listeners
        cleanupSolenoids();

        // Carrega estados salvos
        loadSolenoidStates();
        loadControlStates();

        // Configura os botões de solenoides
        setupSolenoidButtons();

        // Configura os botões de controle
        setupControlButtons();

        // Configura os checkboxes de posição
        setupPositionCheckboxes();

        console.log('✅ Sistema de Solenoides inicializado!');
    }

    /**
     * Carrega estados dos solenoides do localStorage
     */
    function loadSolenoidStates() {
        try {
            const saved = localStorage.getItem('solenoid_states');
            if (saved) {
                solenoidStates = JSON.parse(saved);
            } else {
                // Inicializa todos como desligados
                for (let i = 1; i <= 18; i++) {
                    const id = i.toString().padStart(2, '0');
                    solenoidStates[id] = 'off';
                }
            }

            // Aplica estados nos botões
            applySolenoidStates();
        } catch (e) {
            console.error('Erro ao carregar estados dos solenoides:', e);
        }
    }

    /**
     * Carrega estados dos controles do localStorage
     */
    function loadControlStates() {
        try {
            const saved = localStorage.getItem('solenoid_control_states');
            if (saved) {
                controlStates = JSON.parse(saved);
            }
            
            // Aplica estados nos botões de controle
            applyControlStates();
        } catch (e) {
            console.error('Erro ao carregar estados dos controles:', e);
        }
    }

    /**
     * Salva estados dos solenoides no localStorage
     */
    function saveSolenoidStates() {
        try {
            localStorage.setItem('solenoid_states', JSON.stringify(solenoidStates));
        } catch (e) {
            console.error('Erro ao salvar estados dos solenoides:', e);
        }
    }

    /**
     * Salva estados dos controles no localStorage
     */
    function saveControlStates() {
        try {
            localStorage.setItem('solenoid_control_states', JSON.stringify(controlStates));
        } catch (e) {
            console.error('Erro ao salvar estados dos controles:', e);
        }
    }

    /**
     * Aplica os estados nos botões de solenoides
     */
    function applySolenoidStates() {
        const buttons = document.querySelectorAll('.solenoid-button');
        buttons.forEach(btn => {
            const item = btn.closest('.solenoid-item');
            if (item) {
                const id = item.dataset.solenoid;
                const state = solenoidStates[id] || 'off';
                btn.dataset.state = state;
                item.classList.toggle('solenoid-active', state === 'on');
            }
        });
    }

    /**
     * Aplica os estados nos botões de controle
     */
    function applyControlStates() {
        Object.keys(controlStates).forEach(action => {
            const btn = document.querySelector(`.control-btn-img[data-state]`);
            const parent = document.querySelector(`[data-action="${action}"]`);
            if (parent) {
                const imgBtn = parent.querySelector('.control-btn-img');
                if (imgBtn) {
                    imgBtn.dataset.state = controlStates[action] ? 'on' : 'off';
                }
            }
        });
    }

    /**
     * Configura os botões de solenoides
     */
    function setupSolenoidButtons() {
        const buttons = document.querySelectorAll('.solenoid-button');
        
        buttons.forEach(btn => {
            registerSolenoidsEventListener(btn, 'click', handleSolenoidClick);
        });
    }

    /**
     * Handler de clique no botão de solenoide
     */
    function handleSolenoidClick(event) {
        const btn = event.currentTarget;
        const item = btn.closest('.solenoid-item');
        if (!item) return;

        const id = item.dataset.solenoid;
        const currentState = btn.dataset.state || 'off';
        const newState = currentState === 'off' ? 'on' : 'off';

        // Atualiza estado
        btn.dataset.state = newState;
        item.classList.toggle('solenoid-active', newState === 'on');
        solenoidStates[id] = newState;

        // Salva estados
        saveSolenoidStates();

        // Envia comando para o backend (se necessário)
        sendSolenoidCommand(id, newState);

        console.log(`Solenoide SL${id} alterado para: ${newState}`);
    }

    /**
     * Envia comando de solenoide para o backend
     */
    function sendSolenoidCommand(id, state) {
        // Aqui você pode implementar a comunicação com o backend
        // Por exemplo, via fetch ou WebSocket
        
        /*
        fetch('/api/solenoid/command', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                solenoid: id,
                state: state
            })
        })
        .then(response => response.json())
        .then(data => {
            console.log('Comando enviado:', data);
        })
        .catch(error => {
            console.error('Erro ao enviar comando:', error);
        });
        */
    }

    /**
     * Configura os botões de controle (Teste, Amaciar, Posição)
     */
    function setupControlButtons() {
        const controlButtons = document.querySelectorAll('.control-btn-img');
        
        controlButtons.forEach(btn => {
            registerSolenoidsEventListener(btn, 'click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                const parent = this.closest('.control-button');
                if (!parent) return;
                
                const action = parent.dataset.action;
                const currentState = this.dataset.state || 'off';
                const newState = currentState === 'off' ? 'on' : 'off';
                
                // Atualiza estado visual
                this.dataset.state = newState;
                
                // Atualiza estado interno
                controlStates[action] = newState === 'on';
                
                // Salva estados
                saveControlStates();
                
                console.log(`Controle ${action} alterado para: ${newState}`);
                
                // Executa ação específica
                executeControlAction(action, newState === 'on');
            });
        });
    }

    /**
     * Executa ação de controle
     */
    function executeControlAction(action, isActive) {
        switch (action) {
            case 'teste':
                console.log(`Modo Teste de Solenoide: ${isActive ? 'ATIVADO' : 'DESATIVADO'}`);
                // Implementar lógica de teste
                break;
            case 'amaciar':
                console.log(`Modo Amaciar: ${isActive ? 'ATIVADO' : 'DESATIVADO'}`);
                // Implementar lógica de amaciar
                break;
        }
    }

    /**
     * Configura os checkboxes de posição
     */
    function setupPositionCheckboxes() {
        const checkboxes = document.querySelectorAll('.position-item input[type="checkbox"]');
        
        checkboxes.forEach(checkbox => {
            registerSolenoidsEventListener(checkbox, 'change', function() {
                const position = this.id.replace('pos-', '');
                const isChecked = this.checked;
                
                console.log(`Posição ${position}: ${isChecked ? 'ativada' : 'desativada'}`);
                
                // Salva estado da posição
                savePositionState(position, isChecked);
            });
        });

        // Carrega estados salvos
        loadPositionStates();
    }

    /**
     * Salva estado de posição
     */
    function savePositionState(position, state) {
        try {
            let positions = JSON.parse(localStorage.getItem('solenoid_positions') || '{}');
            positions[position] = state;
            localStorage.setItem('solenoid_positions', JSON.stringify(positions));
        } catch (e) {
            console.error('Erro ao salvar posição:', e);
        }
    }

    /**
     * Carrega estados das posições
     */
    function loadPositionStates() {
        try {
            const saved = localStorage.getItem('solenoid_positions');
            if (saved) {
                const positions = JSON.parse(saved);
                Object.keys(positions).forEach(position => {
                    const checkbox = document.getElementById(`pos-${position}`);
                    if (checkbox) {
                        checkbox.checked = positions[position];
                    }
                });
            }
        } catch (e) {
            console.error('Erro ao carregar posições:', e);
        }
    }

    /**
     * Liga todos os solenoides
     */
    function turnAllOn() {
        const buttons = document.querySelectorAll('.solenoid-button');
        buttons.forEach(btn => {
            const item = btn.closest('.solenoid-item');
            if (item) {
                const id = item.dataset.solenoid;
                btn.dataset.state = 'on';
                item.classList.add('solenoid-active');
                solenoidStates[id] = 'on';
            }
        });
        saveSolenoidStates();
        console.log('Todos os solenoides ligados');
    }

    /**
     * Desliga todos os solenoides
     */
    function turnAllOff() {
        const buttons = document.querySelectorAll('.solenoid-button');
        buttons.forEach(btn => {
            const item = btn.closest('.solenoid-item');
            if (item) {
                const id = item.dataset.solenoid;
                btn.dataset.state = 'off';
                item.classList.remove('solenoid-active');
                solenoidStates[id] = 'off';
            }
        });
        saveSolenoidStates();
        console.log('Todos os solenoides desligados');
    }

    /**
     * Cleanup da tela
     */
    function cleanupSolenoids() {
        console.log('🧹 Limpando sistema de Solenoides...');
        solenoidsEventListeners.forEach(({ element, event, handler }) => {
            if (element) {
                element.removeEventListener(event, handler);
            }
        });
        solenoidsEventListeners = [];
    }

    // Exporta funções globais
    window.inicializarSolenoids = inicializarSolenoids;
    window.cleanupSolenoids = cleanupSolenoids;
    window.turnAllSolenoidsOn = turnAllOn;
    window.turnAllSolenoidsOff = turnAllOff;

})();
