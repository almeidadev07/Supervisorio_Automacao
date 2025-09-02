// machine_select.js (versão avançada com detecção automática)
document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  const btnChangeMachine = document.getElementById('btn-change-machine');
  const modal = document.getElementById('machine-modal');
  const select = document.getElementById('machine-select');
  const btnConfirm = document.getElementById('btn-confirm-machine');
  const btnCancel = document.getElementById('btn-cancel-machine');
  const statusDiv = document.getElementById('machine-modal-status');

  // Função para mostrar o modal
  function showModal() {
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('show');
      modal.style.display = 'block';
    }
  }

  // Função para esconder o modal
  function hideModal() {
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('show');
      modal.style.display = 'none';
    }
  }

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

  // Função para definir máquina ativa
  async function setMachine(machineName) {
    try {
      if (statusDiv) {
        statusDiv.textContent = 'Alterando máquina...';
        statusDiv.className = 'status loading';
      }

      const response = await fetch('/api/set_machine', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: machineName })
      });

      const result = await response.json();
      
      if (result.ok) {
        if (statusDiv) {
          statusDiv.textContent = 'Máquina alterada com sucesso!';
          statusDiv.className = 'status success';
        }
        
        // Fecha o modal após sucesso
        setTimeout(() => {
          hideModal();
        }, 1000);
      } else {
        throw new Error(result.error || 'Erro ao alterar máquina');
      }
    } catch (error) {
      console.error('Erro ao definir máquina:', error);
      if (statusDiv) {
        statusDiv.textContent = `Erro: ${error.message}`;
        statusDiv.className = 'status error';
      }
    }
  }

  // Eventos do modal
  btnChangeMachine.addEventListener('click', () => {
    showModal();
    loadMachines();
  });

  btnCancel.addEventListener('click', hideModal);

  btnConfirm.addEventListener('click', () => {
    const machineName = select.value;
    if (!machineName) return;
    setMachine(machineName);
  });

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

  // Inicializa
  loadMachines();
});
