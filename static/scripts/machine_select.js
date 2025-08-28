async function fetchMachines(){ return fetch('/api/machines').then(r=>r.json()); }
async function detect(){ return fetch('/api/detect').then(r=>r.json()); }

function showModal(preselect){
  const modal = document.getElementById('machine-modal');
  modal.classList.remove('hidden');
  const select = document.getElementById('machine-select');
  if(preselect) select.value = preselect;
}

async function initMachinePicker(){
  const machines = await fetchMachines();
  const select = document.getElementById('machine-select');
  select.innerHTML = machines.map(m => `<option value="${m.name}">${m.name} (${m.embaladoras} embaladoras)</option>`).join('');

  const urlParams = new URLSearchParams(location.search);
  const urlMachine = urlParams.get('machine');
  const saved = localStorage.getItem('supervisor_machine');

  if(urlMachine){ await setMachine(urlMachine); return; }
  if(saved){ await setMachine(saved); return; }

  const det = await detect();
  showModal(det.detected);

  document.getElementById('btn-confirm-machine').onclick = async ()=>{
    const name = select.value;
    await setMachine(name);
    document.getElementById('machine-modal').classList.add('hidden');
  };
  document.getElementById('btn-cancel-machine').onclick = ()=>{ document.getElementById('machine-modal').classList.add('hidden'); };
  document.getElementById('btn-change-machine').addEventListener('click', ()=>{ document.getElementById('machine-modal').classList.remove('hidden'); });
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

window.addEventListener('DOMContentLoaded', ()=>{ initMachinePicker(); });
