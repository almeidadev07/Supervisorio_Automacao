/**
 * Visualizador 3D - Carrega e exibe modelos GLB/GLTF
 * Permite rotacionar, mover e interagir com objetos 3D
 */

let scene, camera, renderer, controls, model = null;
let isInitialized = false;
let animationFrameId = null; // Para controlar o loop de anima??o
let resizeHandler = null; // Para remover o listener de resize

function setViewer3DStatus(message, type = 'info') {
    const el = document.getElementById('viewer3d-status');
    if (!el) return;
    if (!message) {
        el.textContent = '';
        el.classList.add('hidden');
        el.classList.remove('error');
        return;
    }
    el.textContent = message;
    el.classList.remove('hidden');
    if (type == 'error') {
        el.classList.add('error');
    } else {
        el.classList.remove('error');
    }
}

function checkModelUrl(url) {
    return fetch(url, { method: 'HEAD', cache: 'no-store' })
        .then((res) => ({ ok: res.ok, status: res.status, statusText: res.statusText }))
        .catch((err) => ({ ok: true, skipped: true, error: err }));
}


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
    
    // Se já foi inicializado, limpa completamente antes de reinicializar
    if (isInitialized) {
        console.log('[VIEWER3D] Reinicializando... limpando recursos anteriores');
        cleanupViewer3D();
        // Aguarda um pouco para garantir que o cleanup foi concluído
        // e então reinicializa
        setTimeout(() => {
            // Força reinicialização completa
            isInitialized = false;
            scene = null;
            camera = null;
            renderer = null;
            controls = null;
            model = null;
            // Chama novamente para inicializar do zero
            initViewer3D();
        }, 150);
        return;
    }

    setViewer3DStatus('Carregando visualizador 3D...');
    // Carrega Three.js primeiro
    loadThreeJS()
        .then(() => {
            setViewer3DStatus('Carregando modelo 3D...');
            // Cria a cena
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0xffffff); // Fundo branco

            // Cria a câmera
            const container = canvas.parentElement;
            const width = container.clientWidth || 400;
            const height = container.clientHeight || 300;

            camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
            camera.position.set(0, 0, 5);

            // Cria o renderer (configuração focada em desempenho e abertura mais rápida)
            renderer = new THREE.WebGLRenderer({ 
                canvas: canvas,
                // Desabilita antialias para reduzir carga da GPU e acelerar renderização
                antialias: false 
            });
            renderer.setSize(width, height);
            // Usa pixel ratio fixo para evitar imagens muito pesadas em monitores de alta densidade
            renderer.setPixelRatio(1);
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
                animationFrameId = requestAnimationFrame(animate);
                
                if (controls) {
                    controls.update();
                }
                
                if (renderer && scene && camera) {
                    renderer.render(scene, camera);
                }
            }
            animate();

            // Ajusta tamanho quando a janela redimensiona
            resizeHandler = () => {
                if (!canvas || !camera || !renderer) return;
                const container = canvas.parentElement;
                const width = container.clientWidth || 400;
                const height = container.clientHeight || 300;
                
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
                renderer.setSize(width, height);
            };
            window.addEventListener('resize', resizeHandler);

            isInitialized = true;
            console.log('[VIEWER3D] Visualizador 3D inicializado com sucesso');

            // Carrega automaticamente o modelo padrão
            loadDefaultModel();
        })
        .catch(error => {
            console.error('[VIEWER3D] Erro ao inicializar:', error);
        });
}

// Carrega o modelo padrão
function loadDefaultModel() {
    if (!scene || !renderer) {
        console.warn('[VIEWER3D] Cena não inicializada, aguardando...');
        setTimeout(loadDefaultModel, 500);
        return;
    }

    // Usa o modelo padrÃ£o disponível em "static/3D"
    // Arquivo atual: "embadora.glb"
    const modelPath = '/static/3D/embadora_tampa_fechada.glb';
    console.log('[VIEWER3D] Carregando modelo padrão:', modelPath);
    loadGLBModelFromURL(modelPath);
}


// Ajusta camera/controles para enquadrar o modelo
function frameModelToView(target) {
    if (!camera || !renderer || !scene || !target) return;

    const box = new THREE.Box3().setFromObject(target);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    if (!isFinite(maxDim) || maxDim <= 0) {
        camera.position.set(0, 0, 5);
        camera.lookAt(0, 0, 0);
        if (controls) {
            controls.target.set(0, 0, 0);
            controls.update();
        }
        renderer.render(scene, camera);
        return;
    }

    const fov = camera.fov * (Math.PI / 180);
    let distance = (maxDim / 2) / Math.tan(fov / 2);
    distance *= 1.25; // margem

    // Posiciona a câmera em ângulo para dar perspectiva (diagonal suave)
    camera.position.set(
        center.x + distance * 0.65,
        center.y + distance * 0.35,
        center.z + distance * 0.85
    );
    camera.near = Math.max(0.1, distance / 100);
    camera.far = Math.max(1000, distance * 100);
    camera.updateProjectionMatrix();
    camera.lookAt(center);

    if (controls) {
        controls.target.copy(center);
        controls.minDistance = maxDim * 0.3;
        controls.maxDistance = maxDim * 6;
        controls.update();
    }

    renderer.render(scene, camera);
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

    checkModelUrl(url).then((info) => {
        if (info && info.ok === false && info.status && info.status !== 405) {
            const msg = `Erro ao carregar modelo 3D (HTTP ${info.status})`;
            console.error('[VIEWER3D] ' + msg, info.statusText || '');
            setViewer3DStatus(msg, 'error');
            return;
        }

        // Carrega via fetch + parse para evitar problemas com XHR
        let origCreateImageBitmap = null;
        const resourcePath = (typeof url === 'string' && url.includes('/')) ? url.slice(0, url.lastIndexOf('/') + 1) : '';
        fetch(url, { cache: 'no-store', timeoutMs: 0 })
            .then((res) => {
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }
                return res.arrayBuffer();
            })
            .then((data) => {
                origCreateImageBitmap = window.createImageBitmap;
                try { window.createImageBitmap = undefined; } catch (_) {}
                loader.parse(
                    data,
                    resourcePath,
                    (gltf) => {
                        model = gltf.scene;
                        
                        // Calcula o centro e ajusta a posicao
                        const box = new THREE.Box3().setFromObject(model);
                        const center = box.getCenter(new THREE.Vector3());
                        const size = box.getSize(new THREE.Vector3());
                        
                        // Move o modelo para o centro
                        model.position.sub(center);
                        
                        // Ajusta a escala se necessario (para caber na cena)
                        const maxDim = Math.max(size.x, size.y, size.z);
                        if (maxDim > 5) {
                            const scale = 5 / maxDim;
                            model.scale.multiplyScalar(scale);
                        }

                        // Adiciona a cena
                        scene.add(model);

                        // Enquadra o modelo na camera
                        frameModelToView(model);
                        setViewer3DStatus('');

                        if (origCreateImageBitmap) window.createImageBitmap = origCreateImageBitmap;

                        console.log('[VIEWER3D] Modelo carregado com sucesso');
                        
                        // Libera a URL do objeto se for um blob URL
                        if (isBlobURL) {
                            URL.revokeObjectURL(url);
                        }
                    },
                    (error) => {
                        console.error('[VIEWER3D] Erro ao parsear modelo:', error);
                        setViewer3DStatus('Erro ao parsear modelo 3D', 'error');
                        if (origCreateImageBitmap) window.createImageBitmap = origCreateImageBitmap;
                        if (isBlobURL) {
                            URL.revokeObjectURL(url);
                        }
                    }
                );
            })
            .catch((err) => {
                const msg = err?.message ? `Erro ao carregar modelo 3D (${err.message})` : 'Erro ao carregar modelo 3D';
                console.error('[VIEWER3D] Erro ao carregar modelo:', err);
                console.error('[VIEWER3D] URL tentada:', url);
                setViewer3DStatus(msg, 'error');
                if (origCreateImageBitmap) window.createImageBitmap = origCreateImageBitmap;
                if (isBlobURL) {
                    URL.revokeObjectURL(url);
                }
            });
    });


}

// Função de cleanup para limpar recursos quando sair da tela
function cleanupViewer3D() {
    console.log('[VIEWER3D] Fazendo cleanup...');
    
    // Para o loop de animação
    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    if (renderer && renderer.setAnimationLoop) {
        renderer.setAnimationLoop(null);
    }
    
    // Remove listener de resize
    if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
    }
    
    // Remove o modelo da cena e libera recursos
    if (model && scene) {
        scene.remove(model);
        model.traverse((child) => {
            if (child.isMesh) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => {
                            if (mat.map) mat.map.dispose();
                            mat.dispose();
                        });
                    } else {
                        if (child.material.map) child.material.map.dispose();
                        child.material.dispose();
                    }
                }
            }
        });
        model = null;
    }
    
    // Limpa a cena (exceto luzes)
    if (scene) {
        const objectsToRemove = [];
        scene.traverse((child) => {
            if (child !== model && !child.isLight && !child.isCamera) {
                objectsToRemove.push(child);
            }
        });
        objectsToRemove.forEach(obj => scene.remove(obj));
    }
    
    // Remove controles
    if (controls) {
        controls.dispose();
        controls = null;
    }
    
    // Limpa o renderer
    if (renderer) {
        // Limpa o canvas
        const canvas = renderer.domElement;
        if (canvas && canvas.parentNode) {
            // Remove event listeners do canvas
            const newCanvas = canvas.cloneNode(true);
            canvas.parentNode.replaceChild(newCanvas, canvas);
        }
        renderer.dispose();
        renderer = null;
    }
    
    // Limpa variáveis (IMPORTANTE: resetar isInitialized por último)
    scene = null;
    camera = null;
    isInitialized = false; // ✅ Resetar a flag para permitir reinicialização
    
    console.log('[VIEWER3D] Cleanup concluído - pronto para reinicialização');
}

// Exporta as funções para serem chamadas externamente
window.initViewer3D = initViewer3D;
window.cleanupViewer3D = cleanupViewer3D;
