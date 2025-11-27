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
  const statusDiv = document.getElementById('machine-modal-status');
  const embaladoraQuantity = document.getElementById('embaladora-quantity');
  
  // Checkboxes de visibilidade
  const checkboxMagnaOvoscopia = document.getElementById('checkbox-magna-ovoscopia');
  const checkboxCrack = document.getElementById('checkbox-crack');
  const checkboxNebulizador = document.getElementById('checkbox-nebulizador');
  const checkboxLampadaUV = document.getElementById('checkbox-lampada-uv');
  const checkboxEscova = document.getElementById('checkbox-escova');
  
  // Chave para localStorage
  const GRID_VISIBILITY_KEY = 'supervisor_grid_visibility';
  const EMBALADORA_QUANTITY_KEY = 'supervisor_embaladora_quantity';
  
  // Armazena valores iniciais quando o modal é aberto (para restaurar no cancelar)
  let initialSettings = null;
  let initialQuantity = null;
  let initialMachine = null;

  // Função para salvar configurações de visibilidade
  function saveVisibilitySettings() {
    const settings = {
      perifericos: true, // Sempre true, pois o botão de periféricos sempre existe
      magnaOvoscopia: checkboxMagnaOvoscopia?.checked ?? true,
      crack: checkboxCrack?.checked ?? true,
      nebulizador: checkboxNebulizador?.checked ?? true,
      lampadaUV: checkboxLampadaUV?.checked ?? true,
      escova: checkboxEscova?.checked ?? true
    };
    localStorage.setItem(GRID_VISIBILITY_KEY, JSON.stringify(settings));
    
    // Salva quantidade de embaladora
    if (embaladoraQuantity) {
      localStorage.setItem(EMBALADORA_QUANTITY_KEY, embaladoraQuantity.value);
    }
    
    // Aplica as configurações no grid
    if (window.applyGridVisibility) {
      window.applyGridVisibility(settings);
    }
    
    console.log('[MACHINE_SELECT] Configurações de visibilidade salvas:', settings);
  }
  
  // Função para restaurar valores iniciais (usado no cancelar)
  function restoreInitialSettings() {
    if (initialSettings) {
      if (checkboxMagnaOvoscopia) checkboxMagnaOvoscopia.checked = initialSettings.magnaOvoscopia;
      if (checkboxCrack) checkboxCrack.checked = initialSettings.crack;
      if (checkboxNebulizador) checkboxNebulizador.checked = initialSettings.nebulizador;
      if (checkboxLampadaUV) checkboxLampadaUV.checked = initialSettings.lampadaUV;
      if (checkboxEscova) checkboxEscova.checked = initialSettings.escova;
    }
    
    if (initialQuantity && embaladoraQuantity) {
      embaladoraQuantity.value = initialQuantity;
    }
    
    if (initialMachine && select) {
      select.value = initialMachine;
    }
    
    console.log('[MACHINE_SELECT] Valores iniciais restaurados');
  }
  
  // Função para capturar valores iniciais quando o modal abre
  function captureInitialSettings() {
    initialSettings = {
      magnaOvoscopia: checkboxMagnaOvoscopia?.checked ?? true,
      crack: checkboxCrack?.checked ?? true,
      nebulizador: checkboxNebulizador?.checked ?? true,
      lampadaUV: checkboxLampadaUV?.checked ?? true,
      escova: checkboxEscova?.checked ?? true
    };
    
    initialQuantity = embaladoraQuantity?.value || '24';
    initialMachine = select?.value || null;
    
    console.log('[MACHINE_SELECT] Valores iniciais capturados:', {
      settings: initialSettings,
      quantity: initialQuantity,
      machine: initialMachine
    });
  }
  
  // Função para carregar configurações de visibilidade
  function loadVisibilitySettings() {
    try {
      const saved = localStorage.getItem(GRID_VISIBILITY_KEY);
      if (saved) {
        const settings = JSON.parse(saved);
        if (checkboxMagnaOvoscopia) checkboxMagnaOvoscopia.checked = settings.magnaOvoscopia !== false;
        if (checkboxCrack) checkboxCrack.checked = settings.crack !== false;
        if (checkboxNebulizador) checkboxNebulizador.checked = settings.nebulizador !== false;
        if (checkboxLampadaUV) checkboxLampadaUV.checked = settings.lampadaUV !== false;
        if (checkboxEscova) checkboxEscova.checked = settings.escova !== false;
      } else {
        // Valores padrão: todos marcados
        if (checkboxMagnaOvoscopia) checkboxMagnaOvoscopia.checked = true;
        if (checkboxCrack) checkboxCrack.checked = true;
        if (checkboxNebulizador) checkboxNebulizador.checked = true;
        if (checkboxLampadaUV) checkboxLampadaUV.checked = true;
        if (checkboxEscova) checkboxEscova.checked = true;
      }
      
      // Carrega quantidade de embaladora
      const savedQuantity = localStorage.getItem(EMBALADORA_QUANTITY_KEY);
      if (embaladoraQuantity && savedQuantity) {
        embaladoraQuantity.value = savedQuantity;
      } else if (embaladoraQuantity) {
        // Valor padrão: 24
        embaladoraQuantity.value = '24';
      }
    } catch (error) {
      console.error('Erro ao carregar configurações de visibilidade:', error);
    }
  }
  
  // Função para mostrar o modal
  function showModal() {
    if (modal) {
      // Carrega as configurações salvas primeiro
      loadVisibilitySettings();
      
      // Captura os valores iniciais ANTES de permitir alterações
      captureInitialSettings();
      
      modal.classList.remove('hidden');
      modal.classList.add('show');
      modal.style.display = 'block';
      
      // Garante que o botão de confirmar está habilitado quando o modal abre
      if (btnConfirm) {
        btnConfirm.disabled = false;
        btnConfirm.style.opacity = '1';
        btnConfirm.style.cursor = 'pointer';
      }
    }
  }

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
      if (btnConfirm) {
        btnConfirm.disabled = false;
        btnConfirm.style.opacity = '1';
        btnConfirm.style.cursor = 'pointer';
      }
      
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
        select.innerHTML = '';
        machines.forEach(machine => {
          const option = document.createElement('option');
          option.value = machine.name;
          option.textContent = machine.name;
          select.appendChild(option);
        });
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
        select.value = result.machine;
        
        // ✅ Salva o tipo de máquina atual no localStorage (para tela de balança)
        const machineTypeMatch = result.machine.match(/(200CX|400CX|700CX)/i);
        if (machineTypeMatch) {
          const currentSaved = localStorage.getItem('supervisor_machine_type');
          const newType = machineTypeMatch[1].toUpperCase();
          if (currentSaved !== newType) {
            localStorage.setItem('supervisor_machine_type', newType);
            console.log('[MACHINE_SELECT] Tipo de máquina atualizado:', newType);
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
    } catch (error) {
      console.error('Erro ao obter máquina atual:', error);
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
        statusDiv.textContent = 'Verificando conexão...';
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
          // Reabilita o botão em caso de erro de conexão
          if (btnConfirm) {
            btnConfirm.disabled = false;
            btnConfirm.style.opacity = '1';
            btnConfirm.style.cursor = 'pointer';
          }
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
          localStorage.setItem('supervisor_machine_type', machineTypeMatch[1].toUpperCase());
          console.log('[MACHINE_SELECT] Tipo de máquina salvo:', machineTypeMatch[1].toUpperCase());
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
        // Reabilita o botão em caso de erro
        if (btnConfirm) {
          btnConfirm.disabled = false;
          btnConfirm.style.opacity = '1';
          btnConfirm.style.cursor = 'pointer';
        }
        throw new Error(result.error || 'Erro ao alterar máquina');
      }
    } catch (error) {
      console.error('Erro ao definir máquina:', error);
      if (statusDiv) {
        statusDiv.textContent = `Erro: ${error.message}`;
        statusDiv.className = 'status error';
      }
      // Reabilita o botão em caso de erro
      if (btnConfirm) {
        btnConfirm.disabled = false;
        btnConfirm.style.opacity = '1';
        btnConfirm.style.cursor = 'pointer';
      }
    }
  }

  // Eventos do modal
  btnChangeMachine.addEventListener('click', async () => {
    showModal();
    await loadMachines();
    await loadCurrentMachine();
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
          btnConfirm.disabled = false; // Sempre habilitado para permitir salvar checkboxes/quantidade
          btnConfirm.style.opacity = '1';
          btnConfirm.style.cursor = 'pointer';
        }
        // Reage a mudanças no select para atualizar título
        select.addEventListener('change', () => {
          if (!btnConfirm) return;
          const isSameMachine = (select.value === cur.machine);
          btnConfirm.title = isSameMachine ? 'Máquina já conectada (pode salvar outras alterações)' : 'Confirmar alterações';
          btnConfirm.disabled = false; // Sempre habilitado
          btnConfirm.style.opacity = '1';
          btnConfirm.style.cursor = 'pointer';
        }, { once: true });
      }
    } catch(_) {}
  });

  if (btnCancel) {
    btnCancel.addEventListener('click', () => {
      // Restaura valores iniciais ao cancelar
      hideModal(true);
    });
  }

  if (btnConfirm) {
    btnConfirm.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[MACHINE_SELECT] Botão Confirmar clicado');
      
      // Desabilita o botão temporariamente para evitar cliques múltiplos
      if (btnConfirm.disabled) {
        console.warn('[MACHINE_SELECT] Botão já está desabilitado');
        return;
      }
      
      const machineName = select?.value;
      if (!machineName) {
        if (statusDiv) {
          statusDiv.textContent = 'Por favor, selecione uma máquina';
          statusDiv.className = 'status error';
        }
        console.warn('[MACHINE_SELECT] Nenhuma máquina selecionada');
        return;
      }
      
      console.log('[MACHINE_SELECT] Máquina selecionada:', machineName);
      
      // Desabilita o botão durante o processamento
      btnConfirm.disabled = true;
      btnConfirm.style.opacity = '0.6';
      btnConfirm.style.cursor = 'not-allowed';
      
      try {
        // Verifica se a máquina mudou
        const machineChanged = (machineName !== initialMachine);
        
        // Verifica se há alterações nos checkboxes ou quantidade
        const currentSettings = {
          magnaOvoscopia: checkboxMagnaOvoscopia?.checked ?? true,
          crack: checkboxCrack?.checked ?? true,
          nebulizador: checkboxNebulizador?.checked ?? true,
          lampadaUV: checkboxLampadaUV?.checked ?? true,
          escova: checkboxEscova?.checked ?? true
        };
        const settingsChanged = !initialSettings || 
          JSON.stringify(currentSettings) !== JSON.stringify(initialSettings);
        
        const quantityChanged = (embaladoraQuantity?.value || '24') !== (initialQuantity || '24');
        
        const hasChanges = machineChanged || settingsChanged || quantityChanged;
        
        if (!hasChanges) {
          // Não há alterações, apenas fecha o modal
          if (statusDiv) {
            statusDiv.textContent = 'Nenhuma alteração para salvar';
            statusDiv.className = 'status';
          }
          setTimeout(() => {
            hideModal(false);
          }, 1000);
          btnConfirm.disabled = false;
          btnConfirm.style.opacity = '1';
          btnConfirm.style.cursor = 'pointer';
          return;
        }
        
        // SEMPRE salva as configurações de visibilidade e quantidade (mesmo sem mudar máquina)
        saveVisibilitySettings();
        console.log('[MACHINE_SELECT] Configurações de visibilidade e quantidade salvas');
        
        // Se a máquina mudou, processa a mudança de máquina
        if (machineChanged) {
          await setMachine(machineName);
        } else {
          // Se não mudou a máquina, apenas fecha o modal após salvar
          if (statusDiv) {
            statusDiv.textContent = 'Configurações salvas com sucesso!';
            statusDiv.className = 'status success';
          }
          
          setTimeout(() => {
            hideModal(false); // false = não restaurar valores (já salvamos)
          }, 500);
          
          // Reabilita o botão
          btnConfirm.disabled = false;
          btnConfirm.style.opacity = '1';
          btnConfirm.style.cursor = 'pointer';
        }
      } catch (error) {
        console.error('[MACHINE_SELECT] Erro ao processar:', error);
        // Reabilita o botão em caso de erro
        btnConfirm.disabled = false;
        btnConfirm.style.opacity = '1';
        btnConfirm.style.cursor = 'pointer';
      }
    });
  } else {
    console.error('[MACHINE_SELECT] Botão de confirmar não encontrado!');
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
});
