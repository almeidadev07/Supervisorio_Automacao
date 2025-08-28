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
    response = make_response(send_from_directory('static/pdfs', filename))
    response.headers.pop('X-Frame-Options', None)
    return response

if __name__ == "__main__":
    host = os.environ.get('APP_HOST', '127.0.0.1')
    port = int(os.environ.get('APP_PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', '1') == '1'
    socketio.run(app, host=host, port=port, debug=debug)