// Função para carregar scripts dinamicamente
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Erro ao carregar ${src}`));
        document.head.appendChild(script);
    });
}

// Carregar os scripts de forma síncrona
Promise.all([
    loadScript('/static/scripts/partials/menu.js'),
    loadScript('/static/scripts/partials/grid.js')
])
.then(() => {
    console.log('Scripts carregados com sucesso!');
    inicializarVelocimetro(); // Chamar a função do velocímetro
})
.catch(error => console.error(error));
