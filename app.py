import os
import sys
import socket
import importlib.util
from flask import send_from_directory, make_response, jsonify

# Carrega o pacote 'app' (diretório) sob um nome alternativo para evitar conflito com este arquivo 'app.py'
_pkg_dir = os.path.join(os.path.dirname(__file__), 'app')
_init_path = os.path.join(_pkg_dir, '__init__.py')
_spec = importlib.util.spec_from_file_location('supervisorio_app', _init_path, submodule_search_locations=[_pkg_dir])
supervisorio_app = importlib.util.module_from_spec(_spec)
sys.modules['supervisorio_app'] = supervisorio_app
_spec.loader.exec_module(supervisorio_app)

# Cria a aplicação usando a factory do pacote e obtém o socketio
app, socketio = supervisorio_app.create_app()

@app.route('/static/pdfs/<path:filename>')
def serve_pdf(filename):
    try:
        print(f"[PDF] Tentando servir: {filename}")
        # Caminho absoluto para o diretório de PDFs
        pdf_dir = os.path.join(os.path.dirname(__file__), 'static', 'pdfs')
        print(f"[PDF] Diretório PDF: {pdf_dir}")
        print(f"[PDF] Arquivo existe? {os.path.exists(os.path.join(pdf_dir, filename))}")
        
        response = make_response(send_from_directory(pdf_dir, filename))
        response.headers.pop('X-Frame-Options', None)
        response.headers['Content-Type'] = 'application/pdf'
        print(f"[PDF] PDF servido com sucesso: {filename}")
        return response
    except Exception as e:
        print(f"[PDF] ERRO ao servir PDF {filename}: {e}")
        return f"Erro ao carregar PDF: {e}", 404

@app.route('/static/3D/<path:filename>')
def serve_3d(filename):
    try:
        print(f"[3D] Tentando servir: {filename}")
        # Caminho absoluto para o diretório de arquivos 3D
        model_dir = os.path.join(os.path.dirname(__file__), 'static', '3D')
        print(f"[3D] Diretório 3D: {model_dir}")
        print(f"[3D] Arquivo existe? {os.path.exists(os.path.join(model_dir, filename))}")
        
        # Determina o Content-Type baseado na extensão
        content_type = 'application/octet-stream'
        if filename.lower().endswith('.glb'):
            content_type = 'model/gltf-binary'
        elif filename.lower().endswith('.gltf'):
            content_type = 'model/gltf+json'
        
        response = make_response(send_from_directory(model_dir, filename))
        response.headers.pop('X-Frame-Options', None)
        response.headers['Content-Type'] = content_type
        response.headers['Access-Control-Allow-Origin'] = '*'
        print(f"[3D] Arquivo 3D servido com sucesso: {filename}")
        return response
    except Exception as e:
        print(f"[3D] ERRO ao servir arquivo 3D {filename}: {e}")
        return f"Erro ao carregar arquivo 3D: {e}", 404

# ============================================
# API de Informações do Sistema
# ============================================

@app.route('/api/system/ip')
def get_system_ip():
    """Retorna o endereço IP da máquina"""
    try:
        # Tenta obter o IP conectando a um servidor externo (não faz conexão real)
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
    except Exception:
        # Fallback: usa hostname
        try:
            ip = socket.gethostbyname(socket.gethostname())
        except Exception:
            ip = "127.0.0.1"
    
    return jsonify({'ip': ip})

@app.route('/api/system/backup-version')
def get_backup_version():
    """Retorna a versão do backup/software"""
    # Versão pode ser lida de um arquivo de configuração ou definida aqui
    version = "v1.0.0"
    
    # Tenta ler de um arquivo de versão se existir
    version_file = os.path.join(os.path.dirname(__file__), 'VERSION')
    if os.path.exists(version_file):
        try:
            with open(version_file, 'r') as f:
                version = f.read().strip()
        except Exception:
            pass
    
    return jsonify({'version': version})

if __name__ == "__main__":
    host = os.environ.get('APP_HOST', '127.0.0.1')
    port = int(os.environ.get('APP_PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', '1') == '1'
    socketio.run(app, host=host, port=port, debug=debug)