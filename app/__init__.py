import os
import json
import time
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

    # --- Tenta conectar automaticamente apenas se houver PLCs reais disponíveis ---
    from .utils import get_local_ip, find_machine_config, detect_by_reachable_plc
    
    # Primeiro tenta detectar por IP local
    local_ip = get_local_ip()
    print(f"[INIT] IP local detectado: {local_ip}")
    cfg = find_machine_config(local_ip, app.machines)
    print(f"[INIT] Máquina detectada por IP local: {cfg['name'] if cfg else 'Nenhuma'}")
    
    # Só tenta conectar se a máquina detectada por IP local for um PLC real (não mock)
    if cfg and not cfg['name'].lower().startswith('mock'):
        try:
            ok, msg = app.plc_controller.set_active_machine(cfg)
            if ok:
                print(f"[INIT] PLC ativo por IP local: {cfg['name']} ({cfg.get('default_plc_ip')})")
                # Emite evento de detecção inicial para o frontend
                try:
                    print(f"[INIT] 🔔 Emitindo eventos Socket.IO para {cfg['name']}")
                    socketio.emit('plc_detected', {
                        'machine': cfg['name'],
                        'ip': cfg.get('default_plc_ip'),
                        'message': f'PLC {cfg["name"]} detectado na inicialização (IP local)',
                        'timestamp': time.time()
                    })
                    print(f"[INIT] ✅ Evento 'plc_detected' emitido")
                    print(f"[INIT] 🎯 Frontend notificado sobre detecção inicial de {cfg['name']}")
                except Exception as e:
                    print(f"[INIT] ❌ Erro ao notificar frontend: {e}")
            else:
                print(f"[INIT] Falha ao conectar {cfg['name']} por IP local: {msg}")
                cfg = None
        except Exception as e:
            print(f"[INIT] Erro ao conectar {cfg['name']} por IP local: {e}")
            cfg = None
    
    # Se não conseguiu por IP local, tenta detectar por PLC alcançável
    if not cfg:
        print("[INIT] Tentando detecção rápida por PLC alcançável...")
        detected_name, reachable = detect_by_reachable_plc(app.machines)
        print(f"[INIT] Resultado da detecção: {detected_name}, alcançáveis: {reachable}")
        
        if detected_name and not detected_name.lower().startswith('mock'):
            print(f"[INIT] PLC detectado: {detected_name}")
            cfg = next((m for m in app.machines if m['name'] == detected_name), None)
            if cfg:
                print(f"[INIT] Configuração encontrada para {detected_name}: IP={cfg.get('default_plc_ip')}")
                try:
                    ok, msg = app.plc_controller.set_active_machine(cfg)
                    if ok:
                        print(f"[INIT] ✅ PLC ativo por detecção: {cfg['name']} ({cfg.get('default_plc_ip')})")
                        # Emite evento de detecção inicial para o frontend
                        try:
                            print(f"[INIT] 🔔 Emitindo eventos Socket.IO para {cfg['name']}")
                            socketio.emit('plc_detected', {
                                'machine': cfg['name'],
                                'ip': cfg.get('default_plc_ip'),
                                'message': f'PLC {cfg["name"]} detectado na inicialização',
                                'timestamp': time.time()
                            })
                            print(f"[INIT] ✅ Evento 'plc_detected' emitido")
                            print(f"[INIT] 🎯 Frontend notificado sobre detecção inicial de {cfg['name']}")
                        except Exception as e:
                            print(f"[INIT] ❌ Erro ao notificar frontend: {e}")
                    else:
                        print(f"[INIT] ❌ Falha ao conectar {cfg['name']} por detecção: {msg}")
                except Exception as e:
                    print(f"[INIT] ❌ Erro ao conectar {cfg['name']} por detecção: {e}")
            else:
                print(f"[INIT] ❌ Configuração não encontrada para {detected_name}")
        else:
            print(f"[INIT] Nenhum PLC real detectado (detected_name: {detected_name})")
    
    # Se não conseguiu conectar a nenhum PLC real, não cria driver mas inicia polling
    if not cfg:
        print("[INIT] Nenhum PLC real disponível - aguardando detecção automática...")
        print("[INIT] O sistema detectará automaticamente quando um PLC for ligado")
        # Inicia o polling para detectar PLCs automaticamente
        app.plc_controller.start_polling_if_needed()

    return app
