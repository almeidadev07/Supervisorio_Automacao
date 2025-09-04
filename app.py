import os
import sys
import importlib.util
from flask import send_from_directory, make_response

# Carrega o pacote 'app' (diretório) sob um nome alternativo para evitar conflito com este arquivo 'app.py'
_pkg_dir = os.path.join(os.path.dirname(__file__), 'app')
_init_path = os.path.join(_pkg_dir, '__init__.py')
_spec = importlib.util.spec_from_file_location('supervisorio_app', _init_path, submodule_search_locations=[_pkg_dir])
supervisorio_app = importlib.util.module_from_spec(_spec)
sys.modules['supervisorio_app'] = supervisorio_app
_spec.loader.exec_module(supervisorio_app)

# Cria a aplicação usando a factory do pacote e obtém o socketio
app = supervisorio_app.create_app()
socketio = supervisorio_app.socketio

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
        print(f"[PDF] ✅ PDF servido com sucesso: {filename}")
        return response
    except Exception as e:
        print(f"[PDF] ❌ Erro ao servir PDF {filename}: {e}")
        return f"Erro ao carregar PDF: {e}", 404

if __name__ == "__main__":
    host = os.environ.get('APP_HOST', '127.0.0.1')
    port = int(os.environ.get('APP_PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', '1') == '1'
    socketio.run(app, host=host, port=port, debug=debug)