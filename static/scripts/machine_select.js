// machine_select.js (versão avançada com detecção automática)

// ============================================================================
// ✅ MODO DE SIMULAÇÃO PARA TESTES (chamar via console do navegador)
// ============================================================================
// 
// Funções disponíveis no console:
//   simularMaquina('200CX')  - Simula máquina 200CX (6 linhas balança)
//   simularMaquina('400CX')  - Simula máquina 400CX (12 linhas balança)
//   simularMaquina('700CX')  - Simula máquina 700CX (18 linhas balança)
//   simularEmbaladoras(12)   - Simula quantidade de embaladoras (classificação)
//   voltarNormal()           - Volta ao estado normal (remove simulação)
//
// NOTA: Tipo de máquina (linhas balança) e embaladoras são INDEPENDENTES
// ============================================================================

window.simularMaquina = function(machineType) {
  const validMachines = ['200CX', '400CX', '700CX'];
  const type = machineType.toUpperCase();
  
  if (!validMachines.includes(type)) {
    console.error('❌ Máquina inválida. Use: 200CX, 400CX ou 700CX');
    return;
  }
  
  // Salva modo de simulação e tipo de máquina
  localStorage.setItem('supervisor_simulation_mode', 'true');
  localStorage.setItem('supervisor_machine_type', type);
  
  const linhas = type === '200CX' ? 6 : type === '400CX' ? 12 : 18;
  console.log(`✅ SIMULAÇÃO ATIVADA: ${type} (${linhas} linhas na balança)`);
  console.log('📍 Recarregando página para aplicar...');
  
  // Recarrega para aplicar
  setTimeout(() => location.reload(), 500);
};

window.simularEmbaladoras = function(quantity) {
  if (quantity < 1 || quantity > 24) {
    console.error('❌ Quantidade inválida. Use entre 1 e 24');
    return;
  }
  
  // Salva modo de simulação e quantidade de embaladoras
  localStorage.setItem('supervisor_simulation_mode', 'true');
  localStorage.setItem('supervisor_embaladora_quantity', quantity.toString());
  
  console.log(`✅ SIMULAÇÃO ATIVADA: ${quantity} embaladoras (tela classificação)`);
  console.log('📍 Recarregando página para aplicar...');
  
  // Recarrega para aplicar
  setTimeout(() => location.reload(), 500);
};

window.voltarNormal = function() {
  localStorage.removeItem('supervisor_simulation_mode');
  localStorage.removeItem('supervisor_machine_type');
  localStorage.removeItem('supervisor_embaladora_quantity');
  console.log('✅ SIMULAÇÃO DESATIVADA - Voltando ao normal');
  console.log('📍 Recarregando página...');
  setTimeout(() => location.reload(), 500);
};

// Mostra aviso se estiver em modo de simulação
if (localStorage.getItem('supervisor_simulation_mode') === 'true') {
  console.warn('⚠️ MODO DE SIMULAÇÃO ATIVO');
  console.warn('Para voltar ao normal, execute: voltarNormal()');
  
  // Adiciona indicador visual
  setTimeout(() => {
    const indicator = document.createElement('div');
    indicator.id = 'simulation-indicator';
    indicator.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: #ff6b00;
      color: white;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: bold;
      font-size: 12px;
      z-index: 99999;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    indicator.textContent = '🧪 MODO SIMULAÇÃO';
    indicator.title = 'Clique para desativar ou execute voltarNormal() no console';
    indicator.onclick = () => window.voltarNormal();
    document.body.appendChild(indicator);
  }, 1000);
}

document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  const btnChangeMachine = document.getElementById('btn-change-machine');
  const modal = document.getElementById('machine-modal');
  const select = document.getElementById('machine-select');
  const btnConfirm = document.getElementById('btn-confirm-machine');
  const btnCancel = document.getElementById('btn-cancel-machine');
  const btnTest = document.getElementById('btn-test-machine');
  const btnResetFactory = document.getElementById('btn-reset-factory');
  const statusDiv = document.getElementById('machine-modal-status');
  const embaladoraQuantity = document.getElementById('embaladora-quantity');
  const themeToggle = document.getElementById('theme-toggle');
  const machineSelectGrid = document.querySelector('.machine-select-grid');

  // Checkboxes de visibilidade
  const checkboxMagnaOvoscopia = document.getElementById('checkbox-magna-ovoscopia');
  const checkboxCrack = document.getElementById('checkbox-crack');
  const checkboxNebulizador = document.getElementById('checkbox-nebulizador');
  const checkboxLampadaUV = document.getElementById('checkbox-lampada-uv');
  const checkboxEscova = document.getElementById('checkbox-escova');
  const checkboxAlimentador = document.getElementById('checkbox-alimentador');
  
  // Chave para localStorage
  const GRID_VISIBILITY_KEY = 'supervisor_grid_visibility';
  const EMBALADORA_QUANTITY_KEY = 'supervisor_embaladora_quantity';
  const THEME_KEY = 'supervisor_theme';
  const INITIAL_SETUP_KEY = 'supervisor_initial_setup_done';

  function getMachineButtons() {
    return Array.from(document.querySelectorAll('.machine-select-btn'));
  }

  function ensureSelectOption(value) {
    if (!select || !value) return;
    const exists = Array.from(select.options).some(opt => opt.value === value);
    if (!exists) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    }
  }

  function syncMachineButtons(selectedValue) {
    const value = selectedValue || select?.value || '';
    getMachineButtons().forEach((btn) => {
      const isSelected = btn.getAttribute('data-machine') === value;
      btn.classList.toggle('is-selected', isSelected);
      btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    });
  }

  function setMachineSelectionDisabled(disabled) {
    if (select) {
      select.disabled = !!disabled;
    }
    getMachineButtons().forEach((btn) => {
      btn.disabled = !!disabled;
      btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      btn.tabIndex = disabled ? -1 : 0;
    });
    if (machineSelectGrid) {
      machineSelectGrid.classList.toggle('is-disabled', !!disabled);
    }
  }

  function getCurrentTheme() {
    return localStorage.getItem(THEME_KEY) || 'dark';
  }

  function updateThemeLogo(theme) {
    const logo = document.querySelector('.logo-display[data-light-src][data-dark-src]');
    if (!logo) return;
    const isLight = theme === 'light';
    const target = isLight ? logo.getAttribute('data-light-src') : logo.getAttribute('data-dark-src');
    if (target && logo.getAttribute('src') !== target) {
      logo.setAttribute('src', target);
    }
  }

  function applyTheme(theme) {
    const safeTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = safeTheme;
    if (document.body) {
      document.body.dataset.theme = safeTheme;
    }
    localStorage.setItem(THEME_KEY, safeTheme);
    updateThemeLogo(safeTheme);
    try {
      document.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: safeTheme } }));
    } catch (_) {}
  }

  function markInitialSetupDone() {
    try {
      localStorage.setItem(INITIAL_SETUP_KEY, '1');
    } catch (_) {}
  }

  function clearInitialSetupDone() {
    try {
      localStorage.removeItem(INITIAL_SETUP_KEY);
    } catch (_) {}
  }

  // Aplica tema ao carregar
  applyTheme(getCurrentTheme());
  if (themeToggle) {
    themeToggle.checked = getCurrentTheme() === 'dark';
    themeToggle.addEventListener('change', () => {
      const nextTheme = themeToggle.checked ? 'dark' : 'light';
      applyTheme(nextTheme);
    });
  }

  getMachineButtons().forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const value = btn.getAttribute('data-machine');
      if (!value) return;
      ensureSelectOption(value);
      if (select) {
        select.value = value;
        syncMachineButtons(value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });

  if (select) {
    select.addEventListener('change', () => {
      syncMachineButtons(select.value);
    });
  }
  
  function dispatchMachineTypeChanged(oldType, newType, source) {
    if (!newType || oldType === newType) return;
    const event = new CustomEvent('machineTypeChanged', {
      detail: {
        oldType: oldType || null,
        newType,
        source: source || 'unknown',
        timestamp: Date.now()
      }
    });
    document.dispatchEvent(event);
  }

  function setActionButtonsDisabled(disabled) {
    [btnConfirm, btnTest].forEach((btn) => {
      if (!btn) return;
      btn.disabled = disabled;
      btn.style.opacity = disabled ? '0.6' : '1';
      btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
    });
  }
  
  // Armazena valores iniciais quando o modal é aberto (para restaurar no cancelar)
  let initialSettings = null;
  let initialQuantity = null;
  let initialMachine = null;
  let initialTheme = null;

  // Função para salvar configurações de visibilidade
  function saveVisibilitySettings() {
    // Busca os elementos diretamente do DOM para garantir que estejam disponíveis
    const checkboxMagnaOvoscopiaEl = document.getElementById('checkbox-magna-ovoscopia');
    const checkboxCrackEl = document.getElementById('checkbox-crack');
    const checkboxNebulizadorEl = document.getElementById('checkbox-nebulizador');
    const checkboxLampadaUVEl = document.getElementById('checkbox-lampada-uv');
    const checkboxEscovaEl = document.getElementById('checkbox-escova');
    const checkboxAlimentadorEl = document.getElementById('checkbox-alimentador');
    const embaladoraQuantityEl = document.getElementById('embaladora-quantity');
    
    const settings = {
      perifericos: true, // Sempre true, pois o botão de periféricos sempre existe
      magnaOvoscopia: checkboxMagnaOvoscopiaEl?.checked ?? true,
      crack: checkboxCrackEl?.checked ?? true,
      nebulizador: checkboxNebulizadorEl?.checked ?? true,
      lampadaUV: checkboxLampadaUVEl?.checked ?? true,
      escova: checkboxEscovaEl?.checked ?? true,
      alimentador: checkboxAlimentadorEl?.checked ?? true
    };
    localStorage.setItem(GRID_VISIBILITY_KEY, JSON.stringify(settings));
    try {
      localStorage.setItem('alarm_circle_alimentador_hidden', settings.alimentador ? '0' : '1');
    } catch (_) {}
    
      // Salva quantidade de embaladora e dispara evento
      if (embaladoraQuantityEl) {
        const oldQuantity = localStorage.getItem(EMBALADORA_QUANTITY_KEY);
        const newQuantity = embaladoraQuantityEl.value;
        localStorage.setItem(EMBALADORA_QUANTITY_KEY, newQuantity);
        
        // Dispara evento customizado para atualizar telas de Janelas e Painéis
        if (oldQuantity !== newQuantity) {
          console.log(`[MACHINE_SELECT] Quantidade de embaladoras alterada: ${oldQuantity} -> ${newQuantity}`);
          const event = new CustomEvent('embaladoraQuantityChanged', {
            detail: {
              oldQuantity: parseInt(oldQuantity) || 24,
              newQuantity: parseInt(newQuantity) || 24,
              timestamp: Date.now()
            }
          });
          document.dispatchEvent(event);
          
          // Também atualiza diretamente as telas se as funções estiverem disponíveis
          if (window.filterEmbaladoraButtons) {
            window.filterEmbaladoraButtons();
          }
          if (window.filterEmbaladoraPanels) {
            window.filterEmbaladoraPanels();
          }
        }
      }
      
      // Aplica as configurações no grid
      if (window.applyGridVisibility) {
        window.applyGridVisibility(settings);
      }
      
      console.log('[MACHINE_SELECT] Configurações de visibilidade salvas:', settings);
    }
  
  // Função para restaurar valores iniciais (usado no cancelar)
  function restoreInitialSettings() {
    // Busca os elementos diretamente do DOM para garantir que estejam disponíveis
    const checkboxMagnaOvoscopiaEl = document.getElementById('checkbox-magna-ovoscopia');
    const checkboxCrackEl = document.getElementById('checkbox-crack');
    const checkboxNebulizadorEl = document.getElementById('checkbox-nebulizador');
    const checkboxLampadaUVEl = document.getElementById('checkbox-lampada-uv');
    const checkboxEscovaEl = document.getElementById('checkbox-escova');
    const checkboxAlimentadorEl = document.getElementById('checkbox-alimentador');
    const embaladoraQuantityEl = document.getElementById('embaladora-quantity');
    const selectEl = document.getElementById('machine-select');
    
    if (initialSettings) {
      if (checkboxMagnaOvoscopiaEl) checkboxMagnaOvoscopiaEl.checked = initialSettings.magnaOvoscopia;
      if (checkboxCrackEl) checkboxCrackEl.checked = initialSettings.crack;
      if (checkboxNebulizadorEl) checkboxNebulizadorEl.checked = initialSettings.nebulizador;
      if (checkboxLampadaUVEl) checkboxLampadaUVEl.checked = initialSettings.lampadaUV;
      if (checkboxEscovaEl) checkboxEscovaEl.checked = initialSettings.escova;
      if (checkboxAlimentadorEl) checkboxAlimentadorEl.checked = initialSettings.alimentador;
    } else {
      // Fallback: recarrega valores salvos do localStorage
      loadVisibilitySettings();
    }
    
    if (initialQuantity && embaladoraQuantityEl) {
      embaladoraQuantityEl.value = initialQuantity;
    }
    
    if (initialMachine && selectEl) {
      selectEl.value = initialMachine;
      syncMachineButtons(initialMachine);
    } else {
      // Fallback: recarrega máquina atual do backend
      try { loadCurrentMachine(); } catch (_) {}
    }

    if (initialTheme) {
      applyTheme(initialTheme);
      if (themeToggle) {
        themeToggle.checked = initialTheme === 'dark';
      }
    }
    
    console.log('[MACHINE_SELECT] Valores iniciais restaurados');
  }
  
  // Função para capturar valores iniciais quando o modal abre
  function captureInitialSettings() {
    // Busca os elementos diretamente do DOM para garantir que estejam disponíveis
    const checkboxMagnaOvoscopiaEl = document.getElementById('checkbox-magna-ovoscopia');
    const checkboxCrackEl = document.getElementById('checkbox-crack');
    const checkboxNebulizadorEl = document.getElementById('checkbox-nebulizador');
    const checkboxLampadaUVEl = document.getElementById('checkbox-lampada-uv');
    const checkboxEscovaEl = document.getElementById('checkbox-escova');
    const checkboxAlimentadorEl = document.getElementById('checkbox-alimentador');
    const embaladoraQuantityEl = document.getElementById('embaladora-quantity');
    const selectEl = document.getElementById('machine-select');
    
    initialSettings = {
      magnaOvoscopia: checkboxMagnaOvoscopiaEl?.checked ?? true,
      crack: checkboxCrackEl?.checked ?? true,
      nebulizador: checkboxNebulizadorEl?.checked ?? true,
      lampadaUV: checkboxLampadaUVEl?.checked ?? true,
      escova: checkboxEscovaEl?.checked ?? true,
      alimentador: checkboxAlimentadorEl?.checked ?? true
    };
    
    initialQuantity = embaladoraQuantityEl?.value || '24';
    initialMachine = selectEl?.value || null;
    initialTheme = getCurrentTheme();
    
    console.log('[MACHINE_SELECT] Valores iniciais capturados:', {
      settings: initialSettings,
      quantity: initialQuantity,
      machine: initialMachine,
      theme: initialTheme
    });
  }
  
  // Função para carregar configurações de visibilidade
  function loadVisibilitySettings() {
    try {
      // Busca os elementos diretamente do DOM para garantir que estejam disponíveis
      const checkboxMagnaOvoscopiaEl = document.getElementById('checkbox-magna-ovoscopia');
      const checkboxCrackEl = document.getElementById('checkbox-crack');
      const checkboxNebulizadorEl = document.getElementById('checkbox-nebulizador');
      const checkboxLampadaUVEl = document.getElementById('checkbox-lampada-uv');
      const checkboxEscovaEl = document.getElementById('checkbox-escova');
      const checkboxAlimentadorEl = document.getElementById('checkbox-alimentador');
      const embaladoraQuantityEl = document.getElementById('embaladora-quantity');
      
      console.log('[MACHINE_SELECT] Elementos encontrados:', {
        magnaOvoscopia: !!checkboxMagnaOvoscopiaEl,
        crack: !!checkboxCrackEl,
        nebulizador: !!checkboxNebulizadorEl,
        lampadaUV: !!checkboxLampadaUVEl,
        escova: !!checkboxEscovaEl,
        alimentador: !!checkboxAlimentadorEl,
        embaladoraQuantity: !!embaladoraQuantityEl
      });
      
      const saved = localStorage.getItem(GRID_VISIBILITY_KEY);
      const savedQuantity = localStorage.getItem(EMBALADORA_QUANTITY_KEY);
      const alimentadorHidden = localStorage.getItem('alarm_circle_alimentador_hidden') === '1';
      
      console.log('[MACHINE_SELECT] Valores no localStorage:', {
        visibility: saved,
        quantity: savedQuantity
      });
      
      if (saved) {
        const settings = JSON.parse(saved);
        console.log('[MACHINE_SELECT] Carregando configurações salvas:', settings);
        
        // Aplica os valores salvos
        if (checkboxMagnaOvoscopiaEl) {
          checkboxMagnaOvoscopiaEl.checked = settings.magnaOvoscopia !== false;
          console.log('[MACHINE_SELECT] ✅ Magna Ovoscopia:', checkboxMagnaOvoscopiaEl.checked);
        }
        if (checkboxCrackEl) {
          checkboxCrackEl.checked = settings.crack !== false;
          console.log('[MACHINE_SELECT] ✅ Crack:', checkboxCrackEl.checked);
        }
        if (checkboxNebulizadorEl) {
          checkboxNebulizadorEl.checked = settings.nebulizador !== false;
          console.log('[MACHINE_SELECT] ✅ Nebulizador:', checkboxNebulizadorEl.checked);
        }
        if (checkboxLampadaUVEl) {
          checkboxLampadaUVEl.checked = settings.lampadaUV !== false;
          console.log('[MACHINE_SELECT] ✅ Lâmpada UV:', checkboxLampadaUVEl.checked);
        }
        if (checkboxEscovaEl) {
          checkboxEscovaEl.checked = settings.escova !== false;
          console.log('[MACHINE_SELECT] ✅ Escova:', checkboxEscovaEl.checked);
        }
        if (checkboxAlimentadorEl) {
          const visible = (typeof settings.alimentador === 'boolean') ? settings.alimentador : !alimentadorHidden;
          checkboxAlimentadorEl.checked = visible;
          console.log('[MACHINE_SELECT] ✅ Alimentador:', checkboxAlimentadorEl.checked);
        }
      } else {
        // Valores padrão: todos marcados
        console.log('[MACHINE_SELECT] Nenhuma configuração salva encontrada, usando valores padrão');
        if (checkboxMagnaOvoscopiaEl) checkboxMagnaOvoscopiaEl.checked = true;
        if (checkboxCrackEl) checkboxCrackEl.checked = true;
        if (checkboxNebulizadorEl) checkboxNebulizadorEl.checked = true;
        if (checkboxLampadaUVEl) checkboxLampadaUVEl.checked = true;
        if (checkboxEscovaEl) checkboxEscovaEl.checked = true;
        if (checkboxAlimentadorEl) checkboxAlimentadorEl.checked = !alimentadorHidden;
      }
      
      // Carrega quantidade de embaladora
      if (embaladoraQuantityEl && savedQuantity) {
        embaladoraQuantityEl.value = savedQuantity;
        console.log('[MACHINE_SELECT] ✅ Quantidade de embaladora carregada:', savedQuantity);
      } else if (embaladoraQuantityEl) {
        // Valor padrão: 24
        embaladoraQuantityEl.value = '24';
        console.log('[MACHINE_SELECT] Usando quantidade padrão de embaladora: 24');
      } else {
        console.warn('[MACHINE_SELECT] ⚠️ Elemento embaladora-quantity não encontrado');
      }
      
      // Verifica se os valores foram aplicados corretamente
      setTimeout(() => {
        console.log('[MACHINE_SELECT] Verificação final dos valores aplicados:', {
          magnaOvoscopia: checkboxMagnaOvoscopiaEl?.checked,
          crack: checkboxCrackEl?.checked,
          nebulizador: checkboxNebulizadorEl?.checked,
          lampadaUV: checkboxLampadaUVEl?.checked,
          escova: checkboxEscovaEl?.checked,
          alimentador: checkboxAlimentadorEl?.checked,
          quantity: embaladoraQuantityEl?.value
        });
      }, 100);
    } catch (error) {
      console.error('[MACHINE_SELECT] ❌ Erro ao carregar configurações de visibilidade:', error);
    }
  }

  async function resetFactorySettings() {
    try {
      const keysToClear = [
        GRID_VISIBILITY_KEY,
        EMBALADORA_QUANTITY_KEY,
        THEME_KEY,
        INITIAL_SETUP_KEY,
        'supervisor_machine_type',
        'supervisor_machine',
        'supervisor_machine_initialized',
        'supervisor_simulation_mode',
        'alarm_circle_alimentador_hidden'
      ];
      keysToClear.forEach((key) => {
        try { localStorage.removeItem(key); } catch (_) {}
      });
      clearInitialSetupDone();

      try {
        localStorage.setItem('supervisor_last_screen', 'grid');
      } catch (_) {}
      if (typeof window.showGrid === 'function') {
        try { window.showGrid(); } catch (_) {}
      }

      applyTheme('light');
      if (themeToggle) {
        themeToggle.checked = false;
      }

      loadVisibilitySettings();
      await loadMachines();
      await loadCurrentMachine();
      captureInitialSettings();

      const openWizard = () => {
        if (typeof window.showInitialSetupWizard === 'function') {
          window.showInitialSetupWizard();
        }
      };
      // Garante que a tela de início esteja visível antes de abrir o wizard
      setTimeout(openWizard, 200);
    } catch (error) {
      console.error('[MACHINE_SELECT] ❌ Erro ao restaurar configuração de fábrica:', error);
    }
  }
  
  // Função para mostrar o modal (apenas abre, sem carregar dados)
  function showModal() {
    // Busca o modal novamente caso não esteja disponível
    const modalEl = modal || document.getElementById('machine-modal');
    if (modalEl) {
      modalEl.classList.remove('hidden');
      modalEl.classList.add('show');
      modalEl.style.display = 'flex';
      if (themeToggle) {
        themeToggle.checked = getCurrentTheme() === 'dark';
      }
      
      // Garante que o botão de confirmar está habilitado quando o modal abre
      setActionButtonsDisabled(false);
    }
  }
  
  // Exporta showModal também para uso direto
  window.showModal = showModal;
  
  // Exporta função básica (será sobrescrita abaixo com a versão completa)
  // window.showMachineModal será definido após openModalWithData
  
  // Também exporta como showModal para compatibilidade
  window.showModal = showModal;

  // Função para esconder o modal
  function hideModal(restoreValues = false) {
    if (modal) {
      // Se restoreValues for true, restaura os valores iniciais (cancelar)
      if (restoreValues) {
        restoreInitialSettings();
      }
      
      modal.classList.add('hidden');
      modal.classList.remove('show');
      modal.style.display = 'none';
      
      // Reabilita o botão quando o modal fecha
      setActionButtonsDisabled(false);
      
      // Limpa mensagens de status
      if (statusDiv) {
        statusDiv.textContent = '';
        statusDiv.className = '';
      }
    }
  }
  
  // Fecha o modal ao clicar fora dele (apenas no overlay, não no conteúdo)
  if (modal) {
    modal.addEventListener('click', (e) => {
      // Fecha apenas se clicar diretamente no overlay (background), não no conteúdo
      if (e.target === modal) {
        // Restaura valores ao fechar clicando fora (comportamento de cancelar)
        hideModal(true);
      }
    });
    
    // Previne que cliques no conteúdo do modal fechem o modal
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
      modalContent.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }
  }
  
  // Fecha o modal com a tecla ESC (comportamento de cancelar)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
      hideModal(true); // true = restaurar valores (cancelar)
    }
  });

  // Função para carregar lista de máquinas
  async function loadMachines() {
    try {
      const response = await fetch('/api/machines');
      const machines = await response.json();
      
      if (select) {
        const previousValue = select.value;
        select.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '';
        placeholder.hidden = true;
        select.appendChild(placeholder);
        machines.forEach(machine => {
          const option = document.createElement('option');
          option.value = machine.name;
          option.textContent = machine.name;
          select.appendChild(option);
        });
        if (previousValue) {
          select.value = previousValue;
        }
        syncMachineButtons(select.value);
      }
    } catch (error) {
      console.error('Erro ao carregar máquinas:', error);
    }
  }

  // Função para obter máquina atual e selecioná-la
  async function loadCurrentMachine() {
    try {
      const response = await fetch('/api/current');
      const result = await response.json();
      
      if (result.ok && select) {
        // Seleciona a máquina atual no dropdown
        ensureSelectOption(result.machine);
        select.value = result.machine;
        syncMachineButtons(result.machine);
        
        // ✅ Salva o tipo de máquina atual no localStorage (para tela de balança)
        const machineTypeMatch = result.machine.match(/(200CX|400CX|700CX)/i);
        if (machineTypeMatch) {
          const currentSaved = localStorage.getItem('supervisor_machine_type');
          const newType = machineTypeMatch[1].toUpperCase();
          if (currentSaved !== newType) {
            localStorage.setItem('supervisor_machine_type', newType);
            console.log('[MACHINE_SELECT] Tipo de máquina atualizado:', newType);
            dispatchMachineTypeChanged(currentSaved, newType, 'loadCurrentMachine');
          }
        }
        
        // Adiciona indicador visual se conectada
        if (result.connected) {
          const option = select.querySelector(`option[value="${result.machine}"]`);
          if (option) {
            option.textContent = `${result.machine} (Conectada)`;
          }
        }
      }
      return result && result.ok ? result.machine : null;
    } catch (error) {
      console.error('Erro ao obter máquina atual:', error);
      return null;
    }
  }

  // ✅ FUNÇÃO: Testa se uma máquina está conectada antes de permitir seleção
  async function testMachineConnection(machineName) {
    try {
      const response = await fetch('/api/test_machine', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: machineName })
      });

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Erro ao testar conexão da máquina:', error);
      return {
        ok: false,
        connected: false,
        message: 'Erro ao verificar conexão da máquina'
      };
    }
  }

  // Função para definir máquina ativa
  async function setMachine(machineName, skipValidation = false) {
    try {
      if (statusDiv) {
        statusDiv.textContent = skipValidation
          ? 'Modo teste: ignorando validacao. Alterando maquina...'
          : 'Verificando conexão...';
        statusDiv.className = 'status loading';
      }

      // ✅ VALIDAÇÃO: Testa conexão antes de permitir seleção (exceto detecção automática)
      if (!skipValidation) {
        const testResult = await testMachineConnection(machineName);
        
        if (!testResult.ok || !testResult.connected) {
          if (statusDiv) {
            statusDiv.textContent = testResult.message || `PLC da máquina ${machineName} não está conectado`;
            statusDiv.className = 'status error';
          }
          // Reabilita os botões em caso de erro de conexão
          setActionButtonsDisabled(false);
          console.error(`[MACHINE_SELECT] ❌ ${testResult.message}`);
          return; // Não permite seleção se não estiver conectada
        }
        
        if (statusDiv) {
          statusDiv.textContent = 'Conexão OK. Alterando máquina...';
          statusDiv.className = 'status loading';
        }
      }

      const response = await fetch('/api/set_machine', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: machineName, skip_validation: skipValidation })
      });

      const result = await response.json();
      
      if (result.ok) {
        if (statusDiv) {
          statusDiv.textContent = 'Máquina alterada com sucesso!';
          statusDiv.className = 'status success';
        }
        
        // ✅ Salva o tipo de máquina no localStorage (para tela de balança)
        // Extrai o tipo da máquina (200CX, 400CX, 700CX)
        const machineTypeMatch = machineName.match(/(200CX|400CX|700CX)/i);
        if (machineTypeMatch) {
          const prevType = localStorage.getItem('supervisor_machine_type');
          const newType = machineTypeMatch[1].toUpperCase();
          if (prevType !== newType) {
            localStorage.setItem('supervisor_machine_type', newType);
            console.log('[MACHINE_SELECT] Tipo de máquina salvo:', newType);
            dispatchMachineTypeChanged(prevType, newType, 'setMachine');
          }
        }
        
        // Fecha o modal imediatamente após sucesso
        hideModal();
        
        // Solicita atualização dos clientes e recarrega a UI atual
        try {
          await fetch('/api/force_reload', { method: 'POST' }).catch(() => {});
        } catch (_) {}
        
        // Pequeno atraso para permitir troca de máquina no backend antes de recarregar
        setTimeout(() => {
          location.reload();
        }, 500);
      } else {
        // Reabilita os botões em caso de erro
        setActionButtonsDisabled(false);
        throw new Error(result.error || 'Erro ao alterar máquina');
      }
    } catch (error) {
      console.error('Erro ao definir máquina:', error);
      if (statusDiv) {
        statusDiv.textContent = `Erro: ${error.message}`;
        statusDiv.className = 'status error';
      }
      // Reabilita os botões em caso de erro
      setActionButtonsDisabled(false);
    }
  }

  // Função auxiliar para abrir modal com todas as configurações
  async function openModalWithData() {
    console.log('[MACHINE_SELECT] Abrindo modal com dados...');

    if (select) {
      setMachineSelectionDisabled(true);
      select.innerHTML = '';
      const loadingOpt = document.createElement('option');
      loadingOpt.value = '';
      loadingOpt.textContent = 'Carregando...';
      select.appendChild(loadingOpt);
    }
    
    // Primeiro abre o modal para garantir que os elementos estejam no DOM
    showModal();
    
    // Aguarda múltiplos frames para garantir que o DOM esteja completamente atualizado
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    
    // Agora carrega as configurações salvas do localStorage
    console.log('[MACHINE_SELECT] Carregando configurações salvas no modal...');
    loadVisibilitySettings();
    
    // Carrega a máquina atual antes de preencher a lista para evitar flash
    const currentMachine = await loadCurrentMachine();
    await loadMachines();
    if (select) {
      if (currentMachine) {
        select.value = currentMachine;
      }
      syncMachineButtons(select.value);
      setMachineSelectionDisabled(false);
    }
    
    // Aguarda mais um pouco para garantir que os valores foram aplicados
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Captura os valores iniciais DEPOIS de carregar tudo (para restaurar no cancelar)
    captureInitialSettings();
    
    // Destaque visual na opção conectada e evita reconfirmação desnecessária
    try {
      const cur = await fetch('/api/current').then(r => r.json()).catch(()=>null);
      if (cur && cur.ok && select) {
        Array.from(select.options).forEach(opt => {
          // Limpa marcadores anteriores
          opt.textContent = opt.value;
          opt.classList.remove('connected');
          if (opt.value === cur.machine) {
            opt.textContent = `${opt.value} (Conectada)`;
            opt.classList.add('connected');
          }
        });
        // Atualiza o título do botão se já está na mesma máquina, mas NÃO desabilita
        // O botão deve estar sempre habilitado para permitir salvar alterações de checkboxes/quantidade
        if (btnConfirm) {
          const isSameMachine = (select.value === cur.machine);
          btnConfirm.title = isSameMachine ? 'Máquina já conectada (pode salvar outras alterações)' : 'Confirmar alterações';
        }
        if (btnTest) {
          btnTest.title = 'Modo teste: ignora validacao de PLC/ping';
        }
        setActionButtonsDisabled(false);
        // Reage a mudanças no select para atualizar título
        select.addEventListener('change', () => {
          if (!btnConfirm) return;
          const isSameMachine = (select.value === cur.machine);
          btnConfirm.title = isSameMachine ? 'Máquina já conectada (pode salvar outras alterações)' : 'Confirmar alterações';
          setActionButtonsDisabled(false);
        }, { once: true });
      }
    } catch(_) {}
  }

  // Eventos do modal - apenas se o botão do topo ainda existir
  if (btnChangeMachine) {
    btnChangeMachine.addEventListener('click', openModalWithData);
  }
  
  // Atualiza a função exportada para usar a nova função auxiliar
  // Usa uma função wrapper para garantir que funcione mesmo se chamada antes do DOM estar pronto
  window.showMachineModal = async function() {
    try {
      // Verifica se os elementos necessários existem
      if (!modal || !select) {
        console.warn('Elementos do modal não encontrados, tentando abrir modal diretamente...');
        const modalEl = document.getElementById('machine-modal');
        if (modalEl) {
          modalEl.classList.remove('hidden');
          modalEl.classList.add('show');
          modalEl.style.display = 'flex';
        }
        return;
      }
      
      // Chama a função completa
      await openModalWithData();
    } catch (error) {
      console.error('Erro ao abrir modal de configuração:', error);
      // Fallback: tenta abrir o modal diretamente
      const modalEl = document.getElementById('machine-modal');
      if (modalEl) {
        modalEl.classList.remove('hidden');
        modalEl.classList.add('show');
        modalEl.style.display = 'flex';
      }
    }
  };
  window.showMachineModalCore = openModalWithData;

  if (btnCancel) {
    btnCancel.addEventListener('click', () => {
      // Restaura valores iniciais ao cancelar
      hideModal(true);
    });
  }

  if (btnResetFactory) {
    btnResetFactory.addEventListener('click', async () => {
      const confirmed = window.confirm('Restaurar de fábrica? Isso limpará as configurações atuais e reabrirá o assistente inicial.');
      if (!confirmed) return;
      await resetFactorySettings();
      hideModal(false);
    });
  }

  async function handleConfirmClick(skipValidation = false, forceSave = false) {
    const actionLabel = skipValidation ? 'Teste' : 'Confirmar';
    console.log(`[MACHINE_SELECT] Bot?o ${actionLabel} clicado`);
    
    if ((btnConfirm && btnConfirm.disabled) || (btnTest && btnTest.disabled)) {
      console.warn('[MACHINE_SELECT] Bot?o j? est? desabilitado');
      return;
    }
    
    const machineName = select?.value;
    if (!machineName) {
      if (statusDiv) {
        statusDiv.textContent = 'Por favor, selecione uma m?quina';
        statusDiv.className = 'status error';
      }
      console.warn('[MACHINE_SELECT] Nenhuma m?quina selecionada');
      return;
    }
    
    console.log('[MACHINE_SELECT] M?quina selecionada:', machineName);
    
    // Desabilita os bot?es durante o processamento
    setActionButtonsDisabled(true);
    
    try {
      // Verifica se a m?quina mudou
      const machineChanged = (machineName !== initialMachine);
      
      // Verifica se h? altera??es nos checkboxes ou quantidade
      // Busca os elementos diretamente do DOM para garantir que estejam dispon?veis
      const checkboxMagnaOvoscopiaEl = document.getElementById('checkbox-magna-ovoscopia');
      const checkboxCrackEl = document.getElementById('checkbox-crack');
      const checkboxNebulizadorEl = document.getElementById('checkbox-nebulizador');
      const checkboxLampadaUVEl = document.getElementById('checkbox-lampada-uv');
      const checkboxEscovaEl = document.getElementById('checkbox-escova');
      const checkboxAlimentadorEl = document.getElementById('checkbox-alimentador');
      const embaladoraQuantityEl = document.getElementById('embaladora-quantity');
      
      const currentSettings = {
        magnaOvoscopia: checkboxMagnaOvoscopiaEl?.checked ?? true,
        crack: checkboxCrackEl?.checked ?? true,
        nebulizador: checkboxNebulizadorEl?.checked ?? true,
        lampadaUV: checkboxLampadaUVEl?.checked ?? true,
        escova: checkboxEscovaEl?.checked ?? true,
        alimentador: checkboxAlimentadorEl?.checked ?? true
      };
      const settingsChanged = !initialSettings || 
        JSON.stringify(currentSettings) !== JSON.stringify(initialSettings);
      
      const quantityChanged = (embaladoraQuantityEl?.value || '24') !== (initialQuantity || '24');
      
      const hasChanges = forceSave || machineChanged || settingsChanged || quantityChanged;
      
      if (!hasChanges) {
        // N?o h? altera??es, apenas fecha o modal
        if (statusDiv) {
          statusDiv.textContent = 'Nenhuma altera??o para salvar';
          statusDiv.className = 'status';
        }
        setTimeout(() => {
          hideModal(false);
        }, 1000);
        setActionButtonsDisabled(false);
        return;
      }
      
      // SEMPRE salva as configura??es de visibilidade e quantidade (mesmo sem mudar m?quina)
      saveVisibilitySettings();
      console.log('[MACHINE_SELECT] Configura??es de visibilidade e quantidade salvas');
      
      // Se a m?quina mudou, processa a mudan?a de m?quina
      if (machineChanged) {
        await setMachine(machineName, skipValidation);
        markInitialSetupDone();
      } else {
        // Se n?o mudou a m?quina, apenas fecha o modal ap?s salvar
        if (statusDiv) {
          statusDiv.textContent = 'Configura??es salvas com sucesso!';
          statusDiv.className = 'status success';
        }
        
        markInitialSetupDone();
        setTimeout(() => {
          hideModal(false); // false = n?o restaurar valores (j? salvamos)
        }, 500);
        
        // Reabilita os bot?es
        setActionButtonsDisabled(false);
      }
    } catch (error) {
      console.error('[MACHINE_SELECT] Erro ao processar:', error);
      // Reabilita os bot?es em caso de erro
      setActionButtonsDisabled(false);
    }
  }

  window.supervisorSettings = {
    keys: {
      GRID_VISIBILITY_KEY,
      EMBALADORA_QUANTITY_KEY,
      THEME_KEY,
      INITIAL_SETUP_KEY
    },
    elements: {
      select,
      embaladoraQuantity,
      themeToggle
    },
    getCurrentTheme,
    applyTheme,
    syncMachineButtons,
    setMachineSelectionDisabled,
    loadMachines,
    loadCurrentMachine,
    loadVisibilitySettings,
    saveVisibilitySettings,
    captureInitialSettings,
    restoreInitialSettings,
    handleConfirmClick,
    resetFactorySettings,
    markInitialSetupDone,
    clearInitialSetupDone
  };

  if (btnConfirm) {
    btnConfirm.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleConfirmClick(false);
    });
  } else {
    console.error('[MACHINE_SELECT] Bot?o de confirmar n?o encontrado!');
  }

  if (btnTest) {
    btnTest.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleConfirmClick(true);
    });
  }

  // NOTA: Removidos os listeners automáticos de save
  // Agora as alterações são salvas APENAS quando o botão Confirmar é clicado
  // Isso permite que o usuário faça alterações e cancele sem salvar

  // Socket.IO: telemetria em tempo real
  socket.on('telemetry', (data) => {
    console.log('Telemetria:', data);
  });

  socket.on('plc_connection_changed', async (data) => {
    console.log('Conexão PLC mudou:', data.connected);

    // Atualiza automaticamente a lista de máquinas e UI
    if (data.connected) {
      await loadMachines();
    }
  });

  socket.on('force_reload', (data) => {
    console.log('Forçar reload solicitado:', data);
    // Pequeno delay para garantir que a mudança foi processada
    setTimeout(() => {
      location.reload();
    }, 500);
  });

  socket.on('plc_detected', (data) => {
    console.log('[MACHINE_SELECT] 🔔 Evento plc_detected recebido:', data);
    if (data && data.machine) {
      console.log(`[MACHINE_SELECT] ✅ PLC ${data.machine} detectado automaticamente!`);
      
      // Evita reload se já foi feito recentemente
      const lastReload = localStorage.getItem('lastReload');
      const now = Date.now();
      if (lastReload && (now - parseInt(lastReload)) < 5000) {
        console.log('[MACHINE_SELECT] ⚠️ Reload ignorado - muito recente');
        return;
      }
      
      console.log(`[MACHINE_SELECT] 🎯 Atualizando lista de máquinas e recarregando...`);
      // Atualiza a lista de máquinas e recarrega a página
      loadMachines().then(() => {
        setTimeout(() => {
          console.log('[MACHINE_SELECT] 🔄 Executando reload da página...');
          localStorage.setItem('lastReload', now.toString());
          location.reload();
        }, 1000);
      });
    }
  });

  // Inicializa
  loadMachines();
  
  // Carrega as configurações salvas quando a página carrega
  // Usa um pequeno delay para garantir que todos os elementos do DOM estejam prontos
  setTimeout(() => {
    console.log('[MACHINE_SELECT] Carregando configurações salvas na inicialização...');
    loadVisibilitySettings();
  }, 100);
});
