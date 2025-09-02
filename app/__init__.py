import os
import json
from flask import Flask, render_template
from flask_socketio import SocketIO

# importa os blueprints
from .controllers.machines_controller import machines_bp
from .controllers.setups_controller import setups_bp

# socketio global
socketio = SocketIO(cors_allowed_origins="*")


def create_app():
    app = Flask(__name__, 
                template_folder='../templates',
                static_folder='../static')
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'supervisorio123')

    # Inicializa socketio com a app
    socketio.init_app(app, cors_allowed_origins="*")

    # Rota principal serve o dashboard
    @app.route("/")
    def index():
        from flask import render_template
        return render_template("dashboard.html")

    # --- Carrega configuração das máquinas ---
    config_path = os.path.join(os.path.dirname(__file__), 'data', 'machines_config.json')
    if os.path.exists(config_path):
        with open(config_path, 'r') as f:
            app.machines = json.load(f)
    else:
        print("[WARNING] machines_config.json não encontrado, usando lista vazia")
        app.machines = []

    # --- Inicializa PLCController ---
    from .services.plc_controller import PLCController
    app.plc_controller = PLCController(socketio, app.machines)
    app.comm_map = {}

    # --- Registra blueprints ---
    try:
        app.register_blueprint(machines_bp, url_prefix='/api')
        app.register_blueprint(setups_bp, url_prefix='/api')
    except AssertionError as e:
        print(f"[WARNING] Blueprint já registrado: {e}")

    # --- Tenta conectar automaticamente usando detecção inteligente ---
    from .utils import get_local_ip, find_machine_config, detect_by_reachable_plc
    
    # Primeiro tenta detectar por IP local
    local_ip = get_local_ip()
    print(f"[INIT] IP local detectado: {local_ip}")
    cfg = find_machine_config(local_ip, app.machines)
    print(f"[INIT] Máquina detectada por IP local: {cfg['name'] if cfg else 'Nenhuma'}")
    if cfg:
        try:
            ok, msg = app.plc_controller.set_active_machine(cfg)
            if ok:
                print(f"[INIT] PLC ativo por IP local: {cfg['name']} ({cfg.get('default_plc_ip')})")
            else:
                print(f"[INIT] Falha ao conectar {cfg['name']} por IP local: {msg}")
                cfg = None
        except Exception as e:
            print(f"[INIT] Erro ao conectar {cfg['name']} por IP local: {e}")
            cfg = None
    
    # Se não conseguiu por IP local, tenta detectar por PLC alcançável
    if not cfg:
        detected_name, reachable = detect_by_reachable_plc(app.machines)
        if detected_name:
            cfg = next((m for m in app.machines if m['name'] == detected_name), None)
            if cfg:
                try:
                    ok, msg = app.plc_controller.set_active_machine(cfg)
                    if ok:
                        print(f"[INIT] PLC ativo por detecção: {cfg['name']} ({cfg.get('default_plc_ip')})")
                    else:
                        print(f"[INIT] Falha ao conectar {cfg['name']} por detecção: {msg}")
                except Exception as e:
                    print(f"[INIT] Erro ao conectar {cfg['name']} por detecção: {e}")
    
    # Se ainda não conseguiu, tenta a primeira máquina (fallback)
    if not cfg and app.machines:
        cfg = app.machines[0]
        try:
            ok, msg = app.plc_controller.set_active_machine(cfg)
            if ok:
                print(f"[INIT] PLC ativo por fallback: {cfg['name']} ({cfg.get('default_plc_ip')})")
            else:
                print(f"[INIT] Falha ao conectar {cfg['name']} por fallback: {msg}")
        except Exception as e:
            print(f"[INIT] Erro ao conectar {cfg['name']} por fallback: {e}")

    return app
