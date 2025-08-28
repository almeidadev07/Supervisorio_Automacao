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
  modal.classList.remove('hidden');
  modal.classList.add('show');
  const select = document.getElementById('machine-select');
  if(preselect) select.value = preselect;
}

async function initMachinePicker(){
  const statusEl = document.getElementById('machine-modal-status');
  try {
    const machines = await fetchMachines();
    const select = document.getElementById('machine-select');
    select.innerHTML = machines.map(m => `<option value="${m.name}">${m.name} (${m.embaladoras} embaladoras)</option>`).join('');
  } catch(err){
    if(statusEl){ statusEl.textContent = 'Erro ao carregar máquinas. Inicie o servidor correto (run.py)'; }
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
    modal.classList.remove('show');
    modal.classList.add('hidden');
  };
  document.getElementById('btn-cancel-machine').onclick = ()=>{
    const modal = document.getElementById('machine-modal');
    modal.classList.remove('show');
    modal.classList.add('hidden');
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
    document.getElementById('machine-name').innerText = name;
    document.getElementById('conn-status').innerText = 'conectando...';
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
      if(modal){ modal.classList.remove('hidden'); modal.classList.add('show'); }
    });
  }
  initMachinePicker();
  // Garante que o modal usa a classe .show para aparecer conforme CSS global
  const modal = document.getElementById('machine-modal');
  if(modal && !modal.classList.contains('hidden') && !modal.classList.contains('show')){
    modal.classList.add('show');
  }
});
