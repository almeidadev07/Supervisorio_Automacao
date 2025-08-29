# app/__init__.py
import json
import os
from flask import Flask, render_template
from .extensions import socketio, cors
from .services.plc_controller import PLCController
from .controllers.setups_controller import setups_bp
from .controllers.machines_controller import machines_bp

def create_app():
    app = Flask(__name__, static_folder='../static', template_folder='../templates')
    # CORS
    cors.init_app(app)
    # SocketIO
    socketio.init_app(app, cors_allowed_origins='*', async_mode='eventlet')

    # load machines config
    cfg_path = os.path.join(os.getcwd(), 'config', 'machines_config.json')
    try:
        with open(cfg_path, 'r') as f:
            machines = json.load(f)
    except Exception:
        machines = []

    # instantiate a PLCController (shared service)
    plc_controller = PLCController(socketio, machines)
    # attach to app for controllers to access
    app.plc_controller = plc_controller
    app.machines = machines

    # load communication map
    comm_map_path = os.path.join(os.getcwd(), 'config', 'comm_map.json')
    try:
        with open(comm_map_path, 'r') as f:
            app.comm_map = json.load(f)
    except Exception:
        app.comm_map = {}
    plc_controller.set_comm_map(app.comm_map)

    # register blueprints
    app.register_blueprint(setups_bp, url_prefix='/api')
    app.register_blueprint(machines_bp, url_prefix='/api')

    # index route to serve dashboard
    @app.route('/')
    @app.route('/index')
    def index():
        return render_template('dashboard.html')

    # create data dir if needed
    data_dir = os.path.join(os.getcwd(), 'data')
    os.makedirs(data_dir, exist_ok=True)

    return app

# export socketio for run.py
# socketio is defined in app.extensions
