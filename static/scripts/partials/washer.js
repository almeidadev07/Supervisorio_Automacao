// washer.js - Versão Corrigida baseada no input.js funcional

function setupGauge(sliderId, gaugeId, textId, limiteId) {
    const slider = document.getElementById(sliderId);
    const gauge = document.getElementById(gaugeId);
    const valueText = document.getElementById(textId);
    const limiteText = document.getElementById(limiteId);
    
    if (!slider || !gauge || !valueText || !limiteText) {
        console.error('❌ Elementos não encontrados para:', {
            sliderId, gaugeId, textId, limiteId
        });
        return;
    }
    
    console.log('✅ Configurando gauge:', sliderId);
    
    slider.addEventListener("input", () => {
        const val = slider.value;
        console.log(`📊 Atualizando ${sliderId} para: ${val}%`);
        
        valueText.textContent = `${val}%`;
        limiteText.textContent = `${val}%`;
        
        // Esta é a sintaxe correta que funciona no input.js
        gauge.style.background = `conic-gradient(#00cc66 0% ${val}%, #eee ${val}% 100%)`;
    });
    
    // Inicializa com valor 0
    const initialVal = slider.value;
    valueText.textContent = `${initialVal}%`;
    limiteText.textContent = `${initialVal}%`;
    gauge.style.background = `conic-gradient(#00cc66 0% ${initialVal}%, #eee ${initialVal}% 100%)`;
}

function inicializarWasher() {
    console.log('🚀 Tela Lavadora Inicializada');
    // Inicializa bindings do Sugador de Gotas
    setupSugadorBindings();
}

function getBit(value, bit) {
    return ((Number(value) >>> 0) & (1 << bit)) !== 0;
}

async function readTags(names) {
    const res = await fetch(`/api/read_tags?names=${encodeURIComponent(names.join(','))}`, { cache: 'no-store' }).then(r=>r.json()).catch(()=>null);
    if (!res || !res.ok || !res.values) return {};
    return res.values;
}

async function writeTag(name, value) {
    await fetch('/api/write_tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [name]: value })
    }).catch(()=>{});
}

function setupSugadorBindings() {
    const root = document.getElementById('sugador-gotas');
    if (!root) return;
    const imgGray = root.querySelector('.motor-gray');
    const imgGreen = root.querySelector('.motor-green');
    const imgBlue = root.querySelector('.motor-blue');
    const imgRed = root.querySelector('.motor-red');
    const imgAuto = root.querySelector('.mode-auto');
    const imgManual = root.querySelector('.mode-manual');
    const imgPowerOn = root.querySelector('.power-on');
    const imgPowerOff = root.querySelector('.power-off');

    const TAG_CMD = 'LS400_DB50_SUGADOR_GOTAS_CMD';
    const TAG_ALM = 'LS400_DB50_SUGADOR_GOTAS_ALARMES_BAIXO';

    function renderByTags(values) {
        const vCmd = Number(values[TAG_CMD] || 0) >>> 0;
        const vAlm = Number(values[TAG_ALM] || 0) >>> 0;

        const bitAuto = getBit(vCmd, 5);
        const bitRun = getBit(vCmd, 8);
        const bitOk = getBit(vCmd, 15);
        const bitAlm = getBit(vAlm, 8);

        // Prioridade do motor: vermelho (alarme) > verde (ok) > azul (em execução) > cinza
        imgRed.style.display = bitAlm ? 'block' : 'none';
        imgGreen.style.display = (!bitAlm && bitOk) ? 'block' : 'none';
        imgBlue.style.display = (!bitAlm && !bitOk && bitRun) ? 'block' : 'none';
        imgGray.style.display = (!bitAlm && !bitOk && !bitRun) ? 'block' : 'none';

        // Auto/Manual (bit5): 1=Auto, 0=Manual
        imgAuto.style.display = bitAuto ? 'block' : 'none';
        imgManual.style.display = bitAuto ? 'none' : 'block';

        // Power (bit8): 1=Ligado, 0=Desligado
        imgPowerOn.style.display = bitRun ? 'block' : 'none';
        imgPowerOff.style.display = bitRun ? 'none' : 'block';

        // Exibe a linha de botões após primeiro render para evitar flash
        const controlsRow = root.querySelector('.controls-row');
        if (controlsRow && controlsRow.style.visibility !== 'visible') {
            controlsRow.style.visibility = 'visible';
        }
    }

    // Toggle Auto/Manual (bit5)
    root.querySelector('.mode-toggle').addEventListener('click', async () => {
        const values = await readTags([TAG_CMD]);
        let v = Number(values[TAG_CMD] || 0) >>> 0;
        v = v ^ (1 << 5);
        await writeTag(TAG_CMD, v);
        const after = await readTags([TAG_CMD, TAG_ALM]);
        renderByTags(after);
    });

    // Toggle Liga/Desliga (bit8)
    root.querySelector('.power-toggle').addEventListener('click', async () => {
        const values = await readTags([TAG_CMD]);
        let v = Number(values[TAG_CMD] || 0) >>> 0;
        v = v ^ (1 << 8);
        await writeTag(TAG_CMD, v);
        const after = await readTags([TAG_CMD, TAG_ALM]);
        renderByTags(after);
    });

    // Poll tags e renderiza
    setInterval(async () => {
        const values = await readTags([TAG_CMD, TAG_ALM]);
        renderByTags(values);
    }, 1000);
}

// Exporta a função para o escopo global
window.inicializarWasher = inicializarWasher;

