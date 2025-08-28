# run.py
from app import create_app, socketio
import os

app = create_app()

if __name__ == "__main__":
    host = os.environ.get('APP_HOST', '127.0.0.1')
    port = int(os.environ.get('APP_PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', '1') == '1'
    socketio.run(app, host=host, port=port, debug=debug)
