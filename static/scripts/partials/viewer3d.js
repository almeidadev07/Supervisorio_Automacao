/**
 * Visualizador 3D - Carrega e exibe modelos GLB/GLTF
 * Permite rotacionar, mover e interagir com objetos 3D
 */

let scene, camera, renderer, controls, model = null;
let isInitialized = false;

// Função para carregar Three.js e dependências
function loadThreeJS() {
    return new Promise((resolve, reject) => {
        // Verifica se já está carregado
        if (window.THREE && window.THREE.OrbitControls && window.THREE.GLTFLoader) {
            console.log('[VIEWER3D] Three.js já carregado');
            resolve();
            return;
        }

        // Carrega Three.js via CDN (versão UMD compatível)
        const threeScript = document.createElement('script');
        threeScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
        threeScript.onload = () => {
            // Carrega OrbitControls (usa unpkg que é mais confiável)
            const controlsScript = document.createElement('script');
            controlsScript.src = 'https://unpkg.com/three@0.128.0/examples/js/controls/OrbitControls.js';
            controlsScript.onload = () => {
                // Carrega GLTFLoader
                const loaderScript = document.createElement('script');
                loaderScript.src = 'https://unpkg.com/three@0.128.0/examples/js/loaders/GLTFLoader.js';
                loaderScript.onload = () => {
                    console.log('[VIEWER3D] Three.js e dependências carregadas');
                    resolve();
                };
                loaderScript.onerror = () => {
                    console.warn('[VIEWER3D] Erro ao carregar GLTFLoader, tentando alternativa...');
                    // Tenta alternativa via jsDelivr
                    const altLoader = document.createElement('script');
                    altLoader.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';
                    altLoader.onload = () => {
                        console.log('[VIEWER3D] GLTFLoader carregado via alternativa');
                        resolve();
                    };
                    altLoader.onerror = () => reject(new Error('Erro ao carregar GLTFLoader'));
                    document.head.appendChild(altLoader);
                };
                document.head.appendChild(loaderScript);
            };
            controlsScript.onerror = () => {
                console.warn('[VIEWER3D] Erro ao carregar OrbitControls, tentando alternativa...');
                // Tenta alternativa via jsDelivr
                const altControls = document.createElement('script');
                altControls.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js';
                altControls.onload = () => {
                    // Continua com GLTFLoader
                    const loaderScript = document.createElement('script');
                    loaderScript.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';
                    loaderScript.onload = () => {
                        console.log('[VIEWER3D] Dependências carregadas via alternativa');
                        resolve();
                    };
                    loaderScript.onerror = () => reject(new Error('Erro ao carregar GLTFLoader'));
                    document.head.appendChild(loaderScript);
                };
                altControls.onerror = () => reject(new Error('Erro ao carregar OrbitControls'));
                document.head.appendChild(altControls);
            };
            document.head.appendChild(controlsScript);
        };
        threeScript.onerror = () => reject(new Error('Erro ao carregar Three.js'));
        document.head.appendChild(threeScript);
    });
}

// Inicializa a cena 3D
function initViewer3D() {
    const canvas = document.getElementById('viewer3d-canvas');
    if (!canvas) {
        console.warn('[VIEWER3D] Canvas não encontrado, tentando novamente...');
        setTimeout(initViewer3D, 500);
        return;
    }
    
    // Se já foi inicializado, limpa a cena anterior antes de reinicializar
    if (isInitialized && scene) {
        console.log('[VIEWER3D] Reinicializando...');
        // Limpa a cena anterior
        while(scene.children.length > 0) {
            scene.remove(scene.children[0]);
        }
        if (renderer) {
            renderer.dispose();
        }
        if (controls) {
            controls.dispose();
        }
        isInitialized = false;
        model = null;
    }

    // Carrega Three.js primeiro
    loadThreeJS()
        .then(() => {
            // Cria a cena
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0xffffff); // Fundo branco

            // Cria a câmera
            const container = canvas.parentElement;
            const width = container.clientWidth || 400;
            const height = container.clientHeight || 300;

            camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
            camera.position.set(0, 0, 5);

            // Cria o renderer
            renderer = new THREE.WebGLRenderer({ 
                canvas: canvas,
                antialias: true 
            });
            renderer.setSize(width, height);
            renderer.setPixelRatio(window.devicePixelRatio);
            renderer.shadowMap.enabled = true;

            // Adiciona luzes - configuração para máxima clareza e mínimas sombras
            // Luz ambiente (ilumina tudo uniformemente - principal para reduzir sombras)
            const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
            scene.add(ambientLight);

            // Luz direcional principal (sem sombras para evitar áreas escuras)
            const directionalLight = new THREE.DirectionalLight(0xffffff, 1.8);
            directionalLight.position.set(5, 10, 5);
            directionalLight.castShadow = false; // Desabilita sombras
            scene.add(directionalLight);

            // Luz direcional secundária (preenche sombras)
            const directionalLight2 = new THREE.DirectionalLight(0xffffff, 1.2);
            directionalLight2.position.set(-5, 5, -5);
            scene.add(directionalLight2);

            // Luz direcional frontal (iluminação frontal adicional)
            const directionalLight3 = new THREE.DirectionalLight(0xffffff, 1.0);
            directionalLight3.position.set(0, 0, 10);
            scene.add(directionalLight3);

            // Luz pontual superior (iluminação extra de cima)
            const pointLight = new THREE.PointLight(0xffffff, 1.5);
            pointLight.position.set(0, 10, 0);
            scene.add(pointLight);

            // Luz pontual lateral esquerda
            const pointLight2 = new THREE.PointLight(0xffffff, 1.2);
            pointLight2.position.set(-5, 5, -5);
            scene.add(pointLight2);

            // Luz pontual lateral direita
            const pointLight3 = new THREE.PointLight(0xffffff, 1.2);
            pointLight3.position.set(5, 5, 5);
            scene.add(pointLight3);

            // Adiciona controles de órbita (permite rotacionar e mover)
            try {
                if (typeof THREE.OrbitControls !== 'undefined') {
                    controls = new THREE.OrbitControls(camera, renderer.domElement);
                } else if (window.OrbitControls) {
                    controls = new window.OrbitControls(camera, renderer.domElement);
                } else {
                    throw new Error('OrbitControls não encontrado');
                }
                
                controls.enableDamping = true;
                controls.dampingFactor = 0.05;
                controls.enableZoom = true;
                controls.enablePan = true;
                controls.autoRotate = false;
                controls.minDistance = 1;
                controls.maxDistance = 50;
                console.log('[VIEWER3D] Controles de órbita configurados');
            } catch (error) {
                console.warn('[VIEWER3D] OrbitControls não disponível:', error);
            }

            // Grid e eixos removidos conforme solicitado

            // Loop de animação
            function animate() {
                requestAnimationFrame(animate);
                
                if (controls) {
                    controls.update();
                }
                
                renderer.render(scene, camera);
            }
            animate();

            // Ajusta tamanho quando a janela redimensiona
            window.addEventListener('resize', () => {
                const container = canvas.parentElement;
                const width = container.clientWidth || 400;
                const height = container.clientHeight || 300;
                
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
                renderer.setSize(width, height);
            });

            isInitialized = true;
            console.log('[VIEWER3D] Visualizador 3D inicializado com sucesso');

            // Carrega automaticamente o modelo padrão
            loadDefaultModel();
        })
        .catch(error => {
            console.error('[VIEWER3D] Erro ao inicializar:', error);
        });
}

// Carrega o modelo padrão (embaladora.glb)
function loadDefaultModel() {
    if (!scene || !renderer) {
        console.warn('[VIEWER3D] Cena não inicializada, aguardando...');
        setTimeout(loadDefaultModel, 500);
        return;
    }

    const modelPath = '/static/3D/embadora.glb';
    console.log('[VIEWER3D] Carregando modelo padrão:', modelPath);
    loadGLBModelFromURL(modelPath);
}

// Carrega um modelo GLB/GLTF a partir de um arquivo selecionado
function loadGLBModelFromFile(file) {
    if (!scene || !renderer) {
        console.error('[VIEWER3D] Cena não inicializada');
        return;
    }

    const fileURL = URL.createObjectURL(file);
    console.log('[VIEWER3D] Carregando modelo do arquivo:', file.name);
    loadGLBModelFromURL(fileURL, true);
}

// Carrega um modelo GLB/GLTF a partir de uma URL
function loadGLBModelFromURL(url, isBlobURL = false) {
    if (!scene || !renderer) {
        console.error('[VIEWER3D] Cena não inicializada');
        return;
    }

    // Remove modelo anterior se existir
    if (model) {
        scene.remove(model);
        model.traverse((child) => {
            if (child.isMesh) {
                child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            }
        });
        model = null;
    }

    let loader;
    if (THREE.GLTFLoader) {
        loader = new THREE.GLTFLoader();
    } else if (window.GLTFLoader) {
        loader = new window.GLTFLoader();
    } else {
        console.error('[VIEWER3D] GLTFLoader não encontrado');
        alert('Erro: GLTFLoader não está disponível. Verifique o console para mais detalhes.');
        return;
    }

    console.log('[VIEWER3D] Carregando modelo da URL:', url);

    loader.load(
        url,
        (gltf) => {
            model = gltf.scene;
            
            // Calcula o centro e ajusta a posição
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            
            // Move o modelo para o centro
            model.position.sub(center);
            
            // Ajusta a escala se necessário (para caber na cena)
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 5) {
                const scale = 5 / maxDim;
                model.scale.multiplyScalar(scale);
            }

            // Adiciona à cena
            scene.add(model);

            // Ajusta a câmera para visualizar o modelo com zoom mais próximo e centralizado
            // Usa o tamanho final do modelo (após escala)
            const finalMaxDim = Math.max(size.x * model.scale.x, size.y * model.scale.y, size.z * model.scale.z);
            // Distância para zoom próximo
            const distance = finalMaxDim * 0.6;
            // Posiciona a câmera em um ângulo simétrico para centralizar o objeto
            // Usa valores iguais em X e Y para garantir centralização
            const cameraDistance = distance;
            camera.position.set(cameraDistance, cameraDistance, cameraDistance);
            // Garante que a câmera olha para o centro (0, 0, 0)
            camera.lookAt(0, 0, 0);
            
            if (controls) {
                // Define o alvo no centro do objeto
                controls.target.set(0, 0, 0);
                // Ajusta os limites de zoom para permitir aproximar mais
                controls.minDistance = finalMaxDim * 0.2;
                controls.maxDistance = finalMaxDim * 2;
                // Força atualização dos controles para centralizar
                controls.update();
            }

            console.log('[VIEWER3D] Modelo carregado com sucesso');
            
            // Libera a URL do objeto se for um blob URL
            if (isBlobURL) {
                URL.revokeObjectURL(url);
            }
        },
        (progress) => {
            if (progress && progress.total) {
                const percent = (progress.loaded / progress.total) * 100;
                console.log(`[VIEWER3D] Carregando: ${percent.toFixed(2)}%`);
            }
        },
        (error) => {
            console.error('[VIEWER3D] Erro ao carregar modelo:', error);
            console.error('[VIEWER3D] URL tentada:', url);
            // Não exibe alerta, apenas loga o erro para não interromper a experiência
            // O modelo pode não estar disponível ainda
            if (isBlobURL) {
                URL.revokeObjectURL(url);
            }
        }
    );
}

// Exporta a função de inicialização para ser chamada quando a tela for exibida
window.initViewer3D = initViewer3D;

