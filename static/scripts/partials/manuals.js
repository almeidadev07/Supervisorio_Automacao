// static/scripts/partials/manuals.js

// ============================================
// GERENCIAMENTO DE EVENT LISTENERS
// ============================================
let manualsEventListeners = [];
let manualsInitTimeout = null;

function registerManualEventListener(element, event, handler) {
    if (element) {
        element.addEventListener(event, handler);
        manualsEventListeners.push({ element, event, handler });
    }
}

// Função de cleanup
function cleanupManuals() {
    console.log('[MANUALS] 🧹 Iniciando cleanup...');
    
    // Remove todos os event listeners registrados
    manualsEventListeners.forEach(({ element, event, handler }) => {
        if (element) {
            element.removeEventListener(event, handler);
        }
    });
    manualsEventListeners = [];
    
    // Limpa timeout de inicialização
    if (manualsInitTimeout) {
        clearTimeout(manualsInitTimeout);
        manualsInitTimeout = null;
    }
    
    console.log('[MANUALS] ✅ Cleanup concluído');
}

window.cleanupManuals = cleanupManuals;

// Variáveis globais para controlar o estado do visualizador de PDF
let manualPdfPath = null;
let manualPdfName = null;
let manualPdfIframe = null;

// Função para mostrar um estado específico (inicial, carregando, erro)
function showManualState(state) {
    const states = ['initial', 'loading', 'error'];
    states.forEach((key) => {
        const el = document.getElementById(`manual-${key}-state`);
        if (el) el.style.display = 'none';
    });
    if (manualPdfIframe) manualPdfIframe.style.display = 'none';

    const target = document.getElementById(`manual-${state}-state`);
    if (target) target.style.display = 'flex';
}

// Função para exibir uma mensagem de erro
function showManualError(title, details) {
    const errorState = document.getElementById('manual-error-state');
    if (errorState) {
        const titleEl = errorState.querySelector('.title');
        const detailsEl = document.getElementById('manual-error-message-content');
        if (titleEl) titleEl.textContent = title;
        if (detailsEl) detailsEl.textContent = details;
    }
    showManualState('error');
}

// Função para testar se o PDF está acessível
async function testManualPDFAccess(pdfFile) {
    const fullPath = `/static/pdfs/${encodeURIComponent(pdfFile)}`;
    console.log(`🔍 Testando acesso ao PDF: ${fullPath}`);
    
    try {
        const response = await fetch(fullPath, { method: 'HEAD' });
        console.log(`📊 Status da resposta: ${response.status}`);
        
        if (response.ok) {
            console.log(`✅ PDF acessível: ${pdfFile}`);
            return true;
        }
        console.error(`❌ PDF não acessível: ${pdfFile} (Status: ${response.status})`);
        return false;
    } catch (error) {
        console.error(`❌ Erro ao testar acesso ao PDF: ${error.message}`);
        return false;
    }
}

// Função principal para carregar o PDF
async function loadManualPDF(pdfFile, buttonText) {
    console.log(`📄 Tentando carregar manual: ${pdfFile}`);
    
    const pdfContainer = document.getElementById('manual-pdf-container');
    if (!pdfContainer) {
        console.error('❌ Container de PDF dos manuais não encontrado!');
        return;
    }

    // Define o estado global
    manualPdfPath = pdfFile;
    manualPdfName = buttonText;

    // Mostra o loading e atualiza o título
    showManualState('loading');
    const titleEl = document.getElementById('manual-current-pdf-title');
    if (titleEl) {
        titleEl.textContent = `Carregando: ${buttonText}...`;
    }

    // PDFs ficam em /static/pdfs/
    const fullPath = `/static/pdfs/${encodeURIComponent(pdfFile)}`;
    console.log(`🔗 Caminho completo: ${fullPath}`);

    // Testa se o PDF está acessível antes de criar o iframe
    const isAccessible = await testManualPDFAccess(pdfFile);
    if (!isAccessible) {
        showManualError(
            'PDF Não Encontrado',
            `O arquivo "${pdfFile}" não foi encontrado no servidor.\n\nCaminho tentado: ${fullPath}\n\nVerifique se o arquivo existe no diretório static/pdfs/`
        );
        if (titleEl) titleEl.textContent = 'PDF não encontrado';
        return;
    }

    // Remove o iframe antigo, se existir
    if (manualPdfIframe) {
        manualPdfIframe.remove();
        manualPdfIframe = null;
    }

    // Cria um novo iframe
    manualPdfIframe = document.createElement('iframe');
    manualPdfIframe.className = 'pdf-frame';
    manualPdfIframe.style.display = 'none';
    manualPdfIframe.style.width = '100%';
    manualPdfIframe.style.height = '100%';
    manualPdfIframe.style.border = 'none';

    // Adiciona o iframe ao container
    pdfContainer.appendChild(manualPdfIframe);

    // Define o src para iniciar o carregamento
    const viewerParams = '#toolbar=0&navpanes=0&scrollbar=0&view=FitH';
    manualPdfIframe.src = `${fullPath}${viewerParams}`;
    console.log(`🔄 Iframe criado e src definido: ${manualPdfIframe.src}`);

    const loadTimeout = setTimeout(() => {
        console.warn(`⏰ Timeout ao carregar PDF: ${pdfFile}`);
        showManualError(
            `Timeout ao Carregar "${buttonText}"`,
            `O arquivo "${pdfFile}" demorou muito para carregar. Verifique se o arquivo existe e se não está corrompido.`
        );
        if (titleEl) titleEl.textContent = 'Timeout no carregamento';
    }, 10000);

    manualPdfIframe.onload = () => {
        clearTimeout(loadTimeout);
        console.log(`✅ PDF carregado com sucesso: ${fullPath}`);
        manualPdfIframe.style.display = 'block';
        const loadingEl = document.getElementById('manual-loading-state');
        if (loadingEl) loadingEl.style.display = 'none';
        if (titleEl) titleEl.textContent = buttonText;
    };

    manualPdfIframe.onerror = () => {
        clearTimeout(loadTimeout);
        console.error(`❌ Erro ao carregar o iframe para: ${fullPath}`);
        showManualError(
            `Erro ao Carregar "${buttonText}"`,
            `Não foi possível carregar o arquivo "${pdfFile}". Verifique se o arquivo existe e se o caminho está correto.\n\nCaminho tentado: ${fullPath}`
        );
        if (titleEl) titleEl.textContent = 'Falha no carregamento';
    };
}

// Função de inicialização do sistema de manuais
function inicializarManuais() {
    console.log('🚀 Sistema de Manuais Inicializado');
    
    cleanupManuals();
    
    const buttons = document.querySelectorAll('.manual-btn');
    if (buttons.length === 0) {
        console.warn('⚠️ Nenhum botão de manual encontrado.');
        showManualError('Nenhum Manual Encontrado', 'Não há botões de manual configurados nesta página.');
        return;
    }

    buttons.forEach(button => {
        const clickHandler = function() {
            buttons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');

            const pdfFile = this.dataset.pdf;
            const buttonText = this.textContent.trim();

            if (pdfFile) {
                loadManualPDF(pdfFile, buttonText);
            } else {
                showManualError('Botão Mal Configurado', `O botão "${buttonText}" não tem o atributo 'data-pdf'.`);
            }
        };
        registerManualEventListener(button, 'click', clickHandler.bind(button));
    });

    manualsInitTimeout = setTimeout(() => {
        if (buttons.length > 0) {
            console.log('🎯 Carregando primeiro manual automaticamente...');
            buttons[0].click();
        }
    }, 500);
}

window.inicializarManuais = inicializarManuais;
