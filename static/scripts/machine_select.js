// machine_select.js (versão avançada com detecção automática)
document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  const btnChangeMachine = document.getElementById('btn-change-machine');
  const modal = document.getElementById('machine-modal');
  const select = document.getElementById('machine-select');
  const btnConfirm = document.getElementById('btn-confirm-machine');
  const btnCancel = document.getElementById('btn-cancel-machine');
  const statusDiv = document.getElementById('machine-modal-status');

  let activeMachine = null;
  let machinesList = [];

  function showModal() {
    modal.classList.remove('hidden');
    statusDiv.textContent = '';
  }

  function hideModal() {
    modal.classList.add('hidden');
  }

  function setUIVisibility(machineFeatures) {
    const containers = {
      'diagram-container': 'diagram',
      'weight-range-container': 'weight_range',
      'balance-container': 'balance',
      'classification-container': 'classification',
      'input-container': 'input',
      'washer-container': 'washer'
    };

    Object.entries(containers).forEach(([id, feature]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.display = machineFeatures[feature] ? 'block' : 'none';
    });
  }

  async function loadMachines() {
    try {
      const res = await fetch('/api/machines');
      machinesList = await res.json();
      select.innerHTML = '';

      machinesList.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.name;
        opt.textContent = `${m.name} (${m.embaladoras} embaladoras)`;
        select.appendChild(opt);
      });

      await updateActiveMachine();
    } catch (err) {
      console.error('Erro ao carregar máquinas:', err);
      statusDiv.textContent = 'Erro ao carregar máquinas';
    }
  }

  async function updateActiveMachine() {
    try {
      const activeRes = await fetch('/api/machines/features');
      const activeData = await activeRes.json();
      if (activeData.ok !== false && activeData.machine) {
        activeMachine = activeData.machine;
        select.value = activeMachine;
        setUIVisibility(activeData.features || {});
      }
    } catch (err) {
      console.error('Erro ao obter máquina ativa:', err);
    }
  }

  async function setMachine(machineName) {
    statusDiv.textContent = 'Conectando...';
    btnConfirm.disabled = true;
    btnCancel.disabled = true;

    try {
      const res = await fetch('/api/plc/set_machine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: machineName })
      });
      const data = await res.json();

      if ((res.ok && data.ok !== false) || data.status !== 'failed') {
        statusDiv.textContent = `Máquina "${machineName}" conectada com sucesso!`;
        await updateActiveMachine();
        setTimeout(hideModal, 1000);
      } else {
        const msg = data.msg || data.error || 'Falha ao conectar';
        statusDiv.textContent = `Erro: ${msg}`;
      }
    } catch (err) {
      console.error(err);
      statusDiv.textContent = 'Erro na requisição';
    } finally {
      btnConfirm.disabled = false;
      btnCancel.disabled = false;
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

  socket.on('force_reload', () => {
    console.log('Forçar reload solicitado');
    location.reload();
  });

  // Inicializa
  loadMachines();
});
