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
  const select = document.getElementById('machine-select');
  if(preselect) select.value = preselect;
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

  const urlParams = new URLSearchParams(location.search);
  const urlMachine = urlParams.get('machine');
  const saved = localStorage.getItem('supervisor_machine');

  if(urlMachine){ await setMachine(urlMachine); return; }
  if(saved){ await setMachine(saved); return; }

  try{
    const det = await detect();
    showModal(det.detected);
  } catch(err){
    if(statusEl){ statusEl.textContent = 'Detecção automática indisponível.'; }
    showModal();
  }

  document.getElementById('btn-confirm-machine').onclick = async ()=>{
    const name = select.value;
    await setMachine(name);
    const modal = document.getElementById('machine-modal');
    if(modal){
      console.log('Confirm clicked, closing modal');
      modal.classList.remove('show');
      modal.classList.add('hidden');
    }
  };
  document.getElementById('btn-cancel-machine').onclick = ()=>{
    const modal = document.getElementById('machine-modal');
    if(modal){
      console.log('Cancel clicked, closing modal');
      modal.classList.remove('show');
      modal.classList.add('hidden');
    }
  };
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
