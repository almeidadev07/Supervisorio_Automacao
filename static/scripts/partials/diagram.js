// static/scripts/partials/diagram.js

// Variáveis globais para controlar o estado do visualizador de PDF
let currentPdfPath = null;
let currentPdfName = null;
let pdfIframe = null;

// Função para mostrar um estado específico (inicial, carregando, erro)
function showState(state) {
    document.getElementById('initial-state').style.display = 'none';
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('error-state').style.display = 'none';
    if (pdfIframe) pdfIframe.style.display = 'none';

    document.getElementById(`${state}-state`).style.display = 'flex';
}

// Função para exibir uma mensagem de erro
function showError(title, details) {
    document.getElementById('error-state').querySelector('.title').textContent = title;
    document.getElementById('error-message-content').textContent = details;
    showState('error');
}

// Função principal para carregar o PDF
function loadPDF(pdfFile, buttonText) {
    console.log(`📄 Tentando carregar: ${pdfFile}`);
    
    const pdfContainer = document.getElementById('pdf-container');
    if (!pdfContainer) {
        console.error("❌ Container de PDF não encontrado!");
        return;
    }

    // Define o estado global
    currentPdfPath = pdfFile;
    currentPdfName = buttonText;

    // Mostra o loading e atualiza o título
    showState('loading');
    document.getElementById('current-pdf-title').textContent = `Carregando: ${buttonText}...`;

    // O caminho para os PDFs é fixo, o que simplifica o código.
    // Certifique-se de que seus PDFs estão em /static/pdfs/
    const fullPath = `/static/pdfs/${encodeURIComponent(pdfFile)}`;

    // Remove o iframe antigo, se existir
    if (pdfIframe) {
        pdfIframe.remove();
        pdfIframe = null;
    }

    // Cria um novo iframe
    pdfIframe = document.createElement('iframe');
    pdfIframe.className = 'pdf-frame';
    pdfIframe.style.display = 'none'; // Começa oculto

    // Adiciona o iframe ao container
    pdfContainer.appendChild(pdfIframe);

    // Define o src para iniciar o carregamento
    pdfIframe.src = fullPath;

    // Gerencia o sucesso ou falha do carregamento
    pdfIframe.onload = () => {
        console.log(`✅ PDF carregado com sucesso: ${fullPath}`);
        pdfIframe.style.display = 'block';
        document.getElementById('loading-state').style.display = 'none'; // Garante que o loading suma
        document.getElementById('current-pdf-title').textContent = buttonText;
    };

    pdfIframe.onerror = () => {
        console.error(`❌ Erro ao carregar o iframe para: ${fullPath}`);
        showError(
            `Erro ao Carregar "${buttonText}"`,
            `Não foi possível carregar o arquivo em "${fullPath}". Verifique se o arquivo existe e se o caminho está correto.`
        );
        document.getElementById('current-pdf-title').textContent = "Falha no carregamento";
    };
}

// Função de inicialização do sistema de diagramas
function inicializarDiagrama() {
    console.log('🚀 Sistema de Diagramas v2.0 Inicializado');
    
    const buttons = document.querySelectorAll('.diagram-btn');
    if (buttons.length === 0) {
        console.warn('⚠️ Nenhum botão de diagrama encontrado.');
        showError("Nenhum Diagrama Encontrado", "Não há botões de diagrama configurados nesta página.");
        return;
    }

    buttons.forEach(button => {
        button.addEventListener('click', function() {
            // Remove a classe 'active' de todos os botões
            buttons.forEach(btn => btn.classList.remove('active'));
            // Adiciona a classe 'active' ao botão clicado
            this.classList.add('active');

            const pdfFile = this.dataset.pdf;
            const buttonText = this.textContent.trim();

            if (pdfFile) {
                loadPDF(pdfFile, buttonText);
            } else {
                showError("Botão Mal Configurado", `O botão "${buttonText}" não tem o atributo 'data-pdf'.`);
            }
        });
    });

    // Clica no primeiro botão para carregar o diagrama inicial automaticamente
    setTimeout(() => {
        if (buttons.length > 0) {
            console.log('🎯 Carregando primeiro diagrama automaticamente...');
            buttons[0].click();
        }
    }, 500); // Um pequeno delay para garantir que tudo esteja pronto
}

// Exporta a função para o escopo global para que possa ser chamada pelo main.js
window.inicializarDiagrama = inicializarDiagrama;
