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

// Função para testar se o PDF está acessível
async function testPDFAccess(pdfFile) {
    const fullPath = `/static/pdfs/${encodeURIComponent(pdfFile)}`;
    console.log(`🔍 Testando acesso ao PDF: ${fullPath}`);
    
    try {
        const response = await fetch(fullPath, { method: 'HEAD' });
        console.log(`📊 Status da resposta: ${response.status}`);
        
        if (response.ok) {
            console.log(`✅ PDF acessível: ${pdfFile}`);
            return true;
        } else {
            console.error(`❌ PDF não acessível: ${pdfFile} (Status: ${response.status})`);
            return false;
        }
    } catch (error) {
        console.error(`❌ Erro ao testar acesso ao PDF: ${error.message}`);
        return false;
    }
}

// Função principal para carregar o PDF
async function loadPDF(pdfFile, buttonText) {
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
    console.log(`🔗 Caminho completo: ${fullPath}`);

    // Testa se o PDF está acessível antes de criar o iframe
    const isAccessible = await testPDFAccess(pdfFile);
    if (!isAccessible) {
        showError(
            `PDF Não Encontrado`,
            `O arquivo "${pdfFile}" não foi encontrado no servidor.\n\nCaminho tentado: ${fullPath}\n\nVerifique se o arquivo existe no diretório static/pdfs/`
        );
        document.getElementById('current-pdf-title').textContent = "PDF não encontrado";
        return;
    }

    // Remove o iframe antigo, se existir
    if (pdfIframe) {
        pdfIframe.remove();
        pdfIframe = null;
    }

    // Cria um novo iframe
    pdfIframe = document.createElement('iframe');
    pdfIframe.className = 'pdf-frame';
    pdfIframe.style.display = 'none'; // Começa oculto
    pdfIframe.style.width = '100%';
    pdfIframe.style.height = '100%';
    pdfIframe.style.border = 'none';

    // Adiciona o iframe ao container
    pdfContainer.appendChild(pdfIframe);

    // Define o src para iniciar o carregamento
    pdfIframe.src = fullPath;
    console.log(`🔄 Iframe criado e src definido: ${fullPath}`);

    // Timeout para detectar se o PDF não carrega
    const loadTimeout = setTimeout(() => {
        console.warn(`⏰ Timeout ao carregar PDF: ${pdfFile}`);
        showError(
            `Timeout ao Carregar "${buttonText}"`,
            `O arquivo "${pdfFile}" demorou muito para carregar. Verifique se o arquivo existe e se não está corrompido.`
        );
        document.getElementById('current-pdf-title').textContent = "Timeout no carregamento";
    }, 10000); // 10 segundos de timeout

    // Gerencia o sucesso ou falha do carregamento
    pdfIframe.onload = () => {
        clearTimeout(loadTimeout);
        console.log(`✅ PDF carregado com sucesso: ${fullPath}`);
        pdfIframe.style.display = 'block';
        document.getElementById('loading-state').style.display = 'none'; // Garante que o loading suma
        document.getElementById('current-pdf-title').textContent = buttonText;
    };

    pdfIframe.onerror = () => {
        clearTimeout(loadTimeout);
        console.error(`❌ Erro ao carregar o iframe para: ${fullPath}`);
        showError(
            `Erro ao Carregar "${buttonText}"`,
            `Não foi possível carregar o arquivo "${pdfFile}". Verifique se o arquivo existe e se o caminho está correto.\n\nCaminho tentado: ${fullPath}`
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

// Função global para testar o carregamento de PDFs
window.testPDFLoading = function(pdfName = 'Painel_Classificadora.pdf') {
    console.log(`🧪 Testando carregamento do PDF: ${pdfName}`);
    
    const testButton = {
        dataset: { pdf: pdfName },
        textContent: `Teste - ${pdfName}`
    };
    
    loadPDF(pdfName, `Teste - ${pdfName}`);
};

// Função global para testar acesso aos PDFs (sem abrir em nova aba)
window.testPDFAccess = async function(pdfName = 'Painel_Classificadora.pdf') {
    console.log(`🔍 Testando acesso ao PDF: ${pdfName}`);
    
    const fullPath = `/static/pdfs/${encodeURIComponent(pdfName)}`;
    console.log(`🔗 URL: ${window.location.origin}${fullPath}`);
    
    try {
        const response = await fetch(fullPath, { method: 'GET' });
        console.log(`📊 Status: ${response.status}`);
        
        if (response.ok) {
            console.log(`✅ PDF acessível via fetch`);
            return true;
        } else {
            console.error(`❌ PDF não acessível (Status: ${response.status})`);
            return false;
        }
    } catch (error) {
        console.error(`❌ Erro ao testar acesso: ${error.message}`);
        return false;
    }
};

// Função global para testar servidor Flask
window.testFlaskServer = async function() {
    console.log('🔍 Testando servidor Flask...');
    
    try {
        // Testa a rota principal
        const mainResponse = await fetch('/');
        console.log(`📊 Rota principal (/) - Status: ${mainResponse.status}`);
        
        // Testa a rota de PDFs
        const pdfResponse = await fetch('/static/pdfs/Painel_Classificadora.pdf');
        console.log(`📊 Rota PDFs - Status: ${pdfResponse.status}`);
        
        if (pdfResponse.ok) {
            console.log('✅ Servidor Flask funcionando corretamente');
            console.log('🔄 Testando carregamento do PDF no visualizador...');
            testPDFLoading('Painel_Classificadora.pdf');
        } else {
            console.error('❌ Servidor Flask com problema na rota de PDFs');
            console.log('🔄 Verifique os logs do servidor para mais detalhes');
        }
        
    } catch (error) {
        console.error('❌ Erro ao testar servidor Flask:', error.message);
    }
};

// Função global para listar PDFs disponíveis
window.listAvailablePDFs = function() {
    console.log('📋 PDFs disponíveis no diretório:');
    console.log('Painel_Classificadora.pdf');
    console.log('2. Diagrama Elétrico - Remoto Ovoscopia.pdf');
    console.log('3. B3124552 - Painel Pesagem 12LI-LP 400CX Trif. 220V REV3.pdf');
    console.log('4. B3124522 - Embaladora E1 400CX Trif. 220V.Rev.02.pdf');
    console.log('5. B3124523 - Embaladora E2 400CX Trif. 220V.Rev.02.pdf');
    console.log('6. B3124990 - CONJ. PAINEL AUT. REMOTA 12SI 220V.pdf');
    console.log('7. Diagrama Elétrico - Caixa de Passagem - Potência.pdf');
    console.log('8. Diagrama Elétrico - Caixa de Passagem - Controle.pdf');
    console.log('9. Diagrama Elétrico - Casinha de Solenoide.pdf');
    console.log('10. Diagrama Elétrico - Denester Magna.pdf');
    console.log('11. Diagrama Elétrico - Remotas Embaladora.pdf');
    console.log('12. Diagrama Elétrico - Remotos Esteiras Inteligentes.pdf');
    console.log('13. Diagrama Elétrico - Tomadas Embaladora.pdf');
    console.log('14. Diagrama Elétrico - Tomadas Pesagem.pdf');
};

// Exporta a função para o escopo global para que possa ser chamada pelo main.js
window.inicializarDiagrama = inicializarDiagrama;
