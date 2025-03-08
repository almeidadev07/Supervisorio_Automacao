// Função para carregar scripts dinamicamente
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
            console.log(`Script ${src} carregado com sucesso!`);
            resolve();
        };
        script.onerror = () => reject(new Error(`Erro ao carregar ${src}`));
        document.head.appendChild(script);
    });
}

// Função para exibir o grid
function showGrid() {
    // Exibe o grid e oculta o conteúdo do alarme
    document.getElementById('grid-container').style.display = 'block';
    document.getElementById('alarm-container').style.display = 'none';
}

// Função para exibir o conteúdo do alarme
function showAlarm() {
    // Exibe o conteúdo do alarme e oculta o grid
    document.getElementById('grid-container').style.display = 'none';
    document.getElementById('alarm-container').style.display = 'block';
    
    // Inicializa os alarmes caso ainda não tenha sido feito
    if (window.inicializarAlarmes) {
        console.log('Inicializando alarmes a partir de showAlarm()');
        window.inicializarAlarmes();
    } else {
        console.error('Função inicializarAlarmes não encontrada!');
    }
}

// Carregar os scripts de forma assíncrona
Promise.all([
    loadScript('/static/scripts/partials/menu.js'),
    loadScript('/static/scripts/partials/grid.js'),
    loadScript('/static/scripts/partials/alarm.js') // Carrega o alarm.js
])
.then(() => {
    console.log('Todos os scripts carregados com sucesso!');
    
    // Verificar se a função do velocímetro existe antes de chamá-la
    if (typeof inicializarVelocimetro === 'function') {
        inicializarVelocimetro();
    } else {
        console.warn('Função inicializarVelocimetro não encontrada!');
    }
    
    // Inicializar alarmes se a função existir
    if (typeof window.inicializarAlarmes === 'function') {
        console.log('Inicializando alarmes após carregamento de scripts');
        window.inicializarAlarmes();
    } else {
        console.error('Função inicializarAlarmes não disponível após carregamento!');
    }
})
.catch(error => console.error('Erro ao carregar scripts:', error));


document.addEventListener('DOMContentLoaded', function() {
    showGrid(); // Ensure the grid is displayed correctly on initial load
});
// Exporta funções para o escopo global
window.showGrid = showGrid;
window.showAlarm = showAlarm;