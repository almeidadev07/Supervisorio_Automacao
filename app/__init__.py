# app/__init__.py
from flask import Flask, render_template
from flask_socketio import SocketIO
import json
import os

# Importa controladores
from .controllers.enhanced_api_controller import enhanced_api_bp, init_enhanced_controller
from .controllers.machines_controller import machines_bp
# from .controllers.setups_controller import setups_bp

def create_app():
    # Configura o caminho correto para os templates
    # Usa o diretório de trabalho atual como base
    base_dir = os.getcwd()
    template_dir = os.path.join(base_dir, 'templates')
    static_dir = os.path.join(base_dir, 'static')
    
    print(f"[DEBUG] Base dir: {base_dir}")
    print(f"[DEBUG] Template dir: {template_dir}")
    print(f"[DEBUG] Static dir: {static_dir}")
    print(f"[DEBUG] Template dir existe: {os.path.exists(template_dir)}")
    print(f"[DEBUG] Static dir existe: {os.path.exists(static_dir)}")
    
    app = Flask(__name__, 
                template_folder=template_dir,
                static_folder=static_dir)
    
    # Configurações
    app.config['SECRET_KEY'] = 'supervisorio_enhanced_2024'
    
    # Inicializa Socket.IO
    socketio = SocketIO(app, cors_allowed_origins="*")
    
    # Carrega configuração de máquinas
    machines_config_path = os.path.join(os.path.dirname(__file__), 'data', 'machines_config.json')
    with open(machines_config_path, 'r', encoding='utf-8') as f:
        machines_config = json.load(f)
    
    # Inicializa controlador aprimorado
    # enhanced_plc_controller = init_enhanced_controller(socketio, machines_config)
    enhanced_plc_controller = None
    
    # Inicializa controlador legado que suporta comm_map e alarmes
    from .services.plc_controller_legacy import PLCController as LegacyPLCController
    legacy_plc_controller = LegacyPLCController(socketio, machines_config)
    app.plc_controller = legacy_plc_controller  # Anexa ao app para uso em blueprints antigos
    
    # Anexa lista de máquinas ao app para rotas /api/machines e afins
    app.machines = machines_config
    
    # Prepara comm_map básico (opcional) para rotas que consultam current_app.comm_map
    try:
        comm_map_dir = os.path.join(os.path.dirname(__file__), '..', 'config', 'comm_map')
        comm_map_dir = os.path.abspath(comm_map_dir)
        app.comm_map = {}
        for machine in machines_config:
            name = machine.get('name')
            if not name:
                continue
            # tenta variações de nome
            candidates = [f"{name}.json", f"{name.lower()}.json", f"{name.upper()}.json"]
            loaded = False
            for fname in candidates:
                path = os.path.join(comm_map_dir, fname)
                if os.path.exists(path):
                    with open(path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    # aceita tanto lista quanto dict
                    app.comm_map[name] = data
                    loaded = True
                    break
            if not loaded:
                # mantém vazio se não encontrado, controlador interno já trata
                app.comm_map[name] = []
    except Exception as e:
        print(f"[INIT] ⚠️ Falha ao preparar comm_map para API: {e}")

    # Configura automaticamente a máquina 700CX (100.70.0.10) se disponível
    try:
        config_700cx = next((m for m in machines_config if m['name'] == '700CX'), None)
        if config_700cx:
            print(f"[INIT] Configurando automaticamente máquina 700CX (IP: {config_700cx.get('default_plc_ip')})")
            # Passa a configuração completa (dict) para o controlador legado
            success, msg = legacy_plc_controller.set_active_machine(config_700cx)
            if success:
                # Garante que o comm_map ativo seja recarregado do arquivo 700CX.json
                try:
                    legacy_plc_controller.reload_comm_map_for_active()
                except Exception:
                    pass
                print(f"[INIT] ✅ Máquina 700CX configurada com sucesso")
            else:
                print(f"[INIT] ⚠️ Falha ao configurar 700CX: {msg}")
        else:
            print(f"[INIT] ⚠️ Configuração 700CX não encontrada")
    except Exception as e:
        print(f"[INIT] ❌ Erro ao configurar 700CX: {e}")
    
    # O controlador legado já inicia o polling em set_active_machine; como fallback:
    try:
        legacy_plc_controller.start_polling_if_needed()
    except Exception:
        pass
    
    # Registra blueprints
    app.register_blueprint(enhanced_api_bp, url_prefix='/api/enhanced')
    app.register_blueprint(machines_bp, url_prefix='/api')
    # app.register_blueprint(setups_bp)
    
    # Rota principal
    @app.route('/')
    def index():
        return render_template('dashboard.html')
    
    return app, socketio

if __name__ == '__main__':
    app, socketio = create_app()
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)