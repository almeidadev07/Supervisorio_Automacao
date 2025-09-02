async function fetchMachines(){
  const res = await fetch('/api/machines');
  if(!res.ok){ throw new Error(`GET /api/machines -> ${res.status}`); }
  const ct = res.headers.get('content-type')||'';
  if(!ct.includes('application/json')){ throw new Error('GET /api/machines -> not JSON'); }
  return res.json();
}
async function detect(){
  const res = await fetch('/api/detect');
  if(!res.ok){ throw new Error(`GET /api/detect -> ${res.status}`); }
  const ct = res.headers.get('content-type')||'';
  if(!ct.includes('application/json')){ throw new Error('GET /api/detect -> not JSON'); }
  return res.json();
}

function showModal(preselect){
  const modal = document.getElementById('machine-modal');
  console.log('Opening modal', modal);
  modal.classList.remove('hidden');
  modal.classList.add('show');
  // garante visibilidade mesmo sem CSS
  modal.style.display = 'block';
  const select = document.getElementById('machine-select');
  if(preselect) select.value = preselect;
}

function closeModal(){
  const modal = document.getElementById('machine-modal');
  if(!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('show');
  // força esconder mesmo sem CSS das classes
  modal.style.display = 'none';
}

async function initMachinePicker(){
  const statusEl = document.getElementById('machine-modal-status');
  const select = document.getElementById('machine-select');
  try {
    const machines = await fetchMachines();
    select.innerHTML = machines.map(m => `<option value="${m.name}">${m.name} (${m.embaladoras} embaladoras)</option>`).join('');
  } catch(err){
    if(statusEl){ statusEl.textContent = 'Erro ao carregar máquinas. Inicie o servidor correto (run.py)'; }
    if(select){ select.innerHTML = ''; }
  }

  // Preseleciona a máquina atual quando o modal abrir
  const changeBtn = document.getElementById('btn-change-machine');
  if (changeBtn){
    changeBtn.addEventListener('click', async (e)=>{
      e.preventDefault();
      e.stopPropagation();
      try{
        const f = await fetch('/api/features', {cache:'no-store'}).then(r=>r.json()).catch(()=>null);
        const current = f && f.machine ? f.machine : (localStorage.getItem('supervisor_machine')||'');
        if (current){ select.value = current; }
      }catch(_){ /* ignore */ }
      const modal = document.getElementById('machine-modal');
      if(modal){ modal.classList.remove('hidden'); modal.classList.add('show'); }
    });
  }

  const urlParams = new URLSearchParams(location.search);
  const urlMachine = urlParams.get('machine');
  const saved = localStorage.getItem('supervisor_machine');
  const wasInitialized = localStorage.getItem('supervisor_machine_initialized') === '1';

  if(urlMachine){ await setMachine(urlMachine); localStorage.setItem('supervisor_machine_initialized','1'); return; }
  if(saved){ await setMachine(saved); localStorage.setItem('supervisor_machine_initialized','1'); return; }

  try{
    const f = await fetch('/api/features', {cache:'no-store'}).then(r=>r.json()).catch(()=>null);
    if (f && f.machine){
      // Já há máquina ativa no servidor -> nada a fazer
      return;
    }
    const det = await detect();
    // Seleção automática apenas uma vez, no primeiro start do app
    if(!wasInitialized && det && det.detected){
      await setMachine(det.detected);
      localStorage.setItem('supervisor_machine_initialized','1');
      return;
    }
    // Sem auto seleção -> apenas mostrar modal com preselect
    showModal(det && det.detected ? det.detected : undefined);
  } catch(err){
    if(statusEl){ statusEl.textContent = 'Detecção automática indisponível.'; }
    showModal();
  }

  document.getElementById('btn-confirm-machine').onclick = async (e)=>{
    e.preventDefault();
    const name = select.value;
    await setMachine(name);
    console.log('Confirm clicked, closing modal');
    closeModal();
  };
  document.getElementById('btn-cancel-machine').onclick = (e)=>{
    e.preventDefault();
    console.log('Cancel clicked, closing modal');
    closeModal();
  };

  // Fechar com ESC
  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape') closeModal();
  });
}


async function setMachine(name){
  const res = await fetch('/api/set_machine', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({name})
  }).then(r=>r.json());
  if(res.ok){
    localStorage.setItem('supervisor_machine', name);
    const nameEl = document.getElementById('machine-name');
    if(nameEl){ nameEl.innerText = name; }
    const connEl = document.getElementById('conn-status');
    if(connEl){ connEl.innerText = 'conectando...'; }
    // Fetch and store communication map for this machine
    try {
      const cm = await fetch('/api/comm_map').then(r=>r.json());
      if(cm && cm.ok){
        localStorage.setItem('supervisor_comm_map', JSON.stringify(cm.map));
        window.supervisorCommMap = cm.map;
      }
    } catch(e) {
      console.warn('comm_map fetch failed', e);
    }
    return true;
  } else {
    alert('Erro: ' + (res.error||'unknown'));
    return false;
  }
}

window.addEventListener('DOMContentLoaded', ()=>{
  const changeBtn = document.getElementById('btn-change-machine');
  if(changeBtn){
    changeBtn.addEventListener('click', ()=>{
      const modal = document.getElementById('machine-modal');
      if(modal){ modal.classList.remove('hidden'); }
    });
  }
  initMachinePicker();
});
