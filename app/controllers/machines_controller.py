# app/controllers/machines_controller.py
from flask import Blueprint, jsonify, request, current_app, Response
import logging
import time
from ..utils import get_local_ip, find_machine_config, find_machine_by_plc_ip, detect_by_reachable_plc

logger = logging.getLogger(__name__)
machines_bp = Blueprint('machines', __name__)

@machines_bp.route('/machines', methods=['GET'])
def list_machines():
    machines = current_app.machines or []
    simple = [{'name': m['name'], 'embaladoras': m.get('embaladoras', 0), 'ip_ranges': m.get('ip_ranges', [])} for m in machines]
    return jsonify(simple)

@machines_bp.route('/detect', methods=['GET'])
def detect():
    local_ip = get_local_ip()
    cfg = find_machine_config(local_ip, current_app.machines or [])
    return jsonify({'local_ip': local_ip, 'detected': cfg['name'] if cfg else None})

@machines_bp.route('/detect_by_ip', methods=['GET'])
def detect_by_ip_and_switch():
    """Detecta PLC por IP ou faixa e troca automaticamente se encontrado"""
    ip = request.args.get('ip')
    if ip:
        cfg = find_machine_by_plc_ip(ip, current_app.machines or [])
        
        if cfg:
            # troca ativa se detectada
            current_app.plc_controller.set_active_machine(cfg)
        return jsonify({'ip': ip, 'detected': cfg['name'] if cfg else None})

    # Detecta o primeiro PLC alcançável
    detected_name, reachable = detect_by_reachable_plc(current_app.machines or [])
    cfg = next((m for m in (current_app.machines or []) if m['name'] == detected_name), None)
    if cfg:
        current_app.plc_controller.set_active_machine(cfg)
    return jsonify({'detected': detected_name, 'reachable': reachable})


@machines_bp.route('/set_machine', methods=['POST'])
def set_machine():
    payload = request.json or {}
    name = payload.get('name')
    if not name:
        return jsonify({'ok': False, 'error': 'no machine name provided'}), 400
    print(f"[API] /api/set_machine called with name={name}")
    cfg = next((m for m in (current_app.machines or []) if m['name'] == name), None)
    if not cfg:
        return jsonify({'ok': False, 'error': 'machine not found'}), 404
    # use PLCController attached to app
    ok, msg = current_app.plc_controller.set_active_machine(cfg)
    if not ok:
        return jsonify({'ok': False, 'error': msg}), 500
    print(f"[API] Active machine set to {cfg['name']}")
    return jsonify({'ok': True, 'machine': cfg['name']})

@machines_bp.route('/current', methods=['GET'])
def get_current_machine():
    """Retorna a máquina atualmente conectada"""
    cfg = current_app.plc_controller.active_config
    if not cfg:
        return jsonify({'ok': False, 'error': 'no machine selected'}), 400
    
    # Verifica se o driver está conectado
    is_connected = False
    if current_app.plc_controller.driver:
        try:
            is_connected = current_app.plc_controller.driver.is_connected()
        except:
            is_connected = False
    
    return jsonify({
        'ok': True, 
        'machine': cfg['name'], 
        'connected': is_connected,
        'ip': cfg.get('default_plc_ip', ''),
        'embaladoras': cfg.get('embaladoras', 0)
    })

@machines_bp.route('/features', methods=['GET'])
def features():
    cfg = current_app.plc_controller.active_config
    if not cfg:
        return jsonify({'ok': False, 'error': 'no machine selected'}), 400
    return jsonify({'machine': cfg['name'], 'embaladoras': cfg.get('embaladoras', 0), 'features': cfg.get('features', {})})

@machines_bp.route('/detect_by_ip_only', methods=['GET'])
def detect_by_ip_only():
    """Detect machine by PLC IP. If 'ip' query provided, match exactly.
    Otherwise ping known PLC IPs and pick first reachable.
    """
    ip = request.args.get('ip')
    if ip:
        cfg = find_machine_by_plc_ip(ip, current_app.machines or [])
        return jsonify({'ip': ip, 'detected': cfg['name'] if cfg else None})
    detected, reachable = detect_by_reachable_plc(current_app.machines or [])
    return jsonify({'detected': detected, 'reachable': reachable})

@machines_bp.route('/comm_map', methods=['GET'])
def comm_map_json():
    """Return communication map for the active machine as JSON."""
    cfg = current_app.plc_controller.active_config
    if not cfg:
        return jsonify({'ok': False, 'error': 'no machine selected'}), 400
    name = cfg['name']
    comm_map = (current_app.comm_map or {}).get(name)
    if comm_map is None:
        return jsonify({'ok': False, 'error': f'no comm map for {name}'}), 404
    return jsonify({'ok': True, 'machine': name, 'map': comm_map})

@machines_bp.route('/comm_map.csv', methods=['GET'])
def comm_map_csv():
    """Return communication map for the active machine as CSV for convenience."""
    import io, csv
    cfg = current_app.plc_controller.active_config
    if not cfg:
        return jsonify({'ok': False, 'error': 'no machine selected'}), 400
    name = cfg['name']
    comm_map = (current_app.comm_map or {}).get(name)
    if comm_map is None:
        return jsonify({'ok': False, 'error': f'no comm map for {name}'}), 404
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['name', 'area', 'db', 'offset', 'byte', 'bit', 'type', 'units', 'description'])
    for tag in comm_map:
        writer.writerow([
            tag.get('name',''),
            tag.get('area',''),
            tag.get('db',''),
            tag.get('offset',''),
            tag.get('byte',''),
            tag.get('bit',''),
            tag.get('type',''),
            tag.get('units',''),
            tag.get('description',''),
        ])
    csv_data = output.getvalue()
    return Response(csv_data, mimetype='text/csv', headers={'Content-Disposition': f'attachment; filename="{name}_comm_map.csv"'})

@machines_bp.route('/read_tags', methods=['GET'])
def read_tags():
    names_param = request.args.get('names', '')
    names = [n.strip() for n in names_param.split(',') if n.strip()] if names_param else None
    values = current_app.plc_controller.read_tags(names)
    return jsonify({'ok': True, 'values': values})

@machines_bp.route('/write_tags', methods=['POST'])
def write_tags():
    """Escreve valores nas tags do PLC"""
    try:
        payload = request.json or {}
        if not payload:
            return jsonify({'ok': False, 'error': 'No data provided'}), 400
        
        # Valida se as tags existem no comm_map
        cfg = current_app.plc_controller.active_config
        if not cfg:
            return jsonify({'ok': False, 'error': 'No machine selected'}), 400
        
        machine = cfg.get('name')
        comm_map = (current_app.comm_map or {}).get(machine, [])
        valid_tags = {tag['name'] for tag in comm_map}
        
        # Filtra apenas tags válidas
        valid_payload = {k: v for k, v in payload.items() if k in valid_tags}
        if not valid_payload:
            return jsonify({'ok': False, 'error': 'No valid tags provided'}), 400
        
        # Escreve no PLC
        success = current_app.plc_controller.write_tags(valid_payload)
        
        if success:
            return jsonify({'ok': True, 'message': f'Tags escritas com sucesso: {list(valid_payload.keys())}'})
        else:
            return jsonify({'ok': False, 'error': 'Falha ao escrever tags no PLC'}), 500
            
    except Exception as e:
        logger.error(f"Erro ao escrever tags: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500

@machines_bp.route('/debug/db_read', methods=['GET'])
def debug_db_read():
    """Low-level DB read to diagnose connectivity/optimized DB issues.
    Example: /api/debug/db_read?db=1&offset=124&size=4
    """
    cfg = current_app.plc_controller.active_config
    if not cfg:
        return jsonify({'ok': False, 'error': 'no machine selected'}), 400
    try:
        db = int(request.args.get('db', '0'))
        offset = int(request.args.get('offset', '0'))
        size = int(request.args.get('size', '4'))
    except Exception:
        return jsonify({'ok': False, 'error': 'invalid params'}), 400

    driver = current_app.plc_controller.driver
    client = getattr(driver, 'client', None)
    if client is None:
        return jsonify({'ok': False, 'error': 'driver has no raw client (using mock or not snap7)'}), 400
    try:
        data = client.db_read(db, offset, size)
        hex_bytes = ' '.join(f'{b:02X}' for b in data)
        import struct
        real_be = None
        if size >= 4:
            try:
                real_be = struct.unpack('>f', data[:4])[0]
            except Exception:
                real_be = None
        return jsonify({'ok': True, 'db': db, 'offset': offset, 'size': size, 'hex': hex_bytes, 'real_be': real_be})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@machines_bp.route('/force_reload', methods=['POST'])
def force_reload():
    """Emit a socket event to force clients to reload the page."""
    try:
        current_app.socketio.emit('force_reload', {'ts': __import__('time').time()})
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@machines_bp.route('/force_reconnect', methods=['POST'])
def force_reconnect():
    """Força uma tentativa de reconexão imediata com o PLC"""
    try:
        success, message = current_app.plc_controller.force_reconnect()
        if success:
            return jsonify({'ok': True, 'message': message})
        else:
            return jsonify({'ok': False, 'error': message}), 500
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@machines_bp.route('/detect_plcs', methods=['POST'])
def detect_plcs():
    """Força a detecção de PLCs disponíveis e troca automaticamente se encontrar um melhor"""
    try:
        success = current_app.plc_controller._detect_and_switch_to_available_plc()
        if success:
            return jsonify({'ok': True, 'message': 'PLC detectado e trocado automaticamente'})
        else:
            return jsonify({'ok': False, 'message': 'Nenhum PLC melhor disponível'})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@machines_bp.route('/alarms', methods=['GET'])
def get_alarms():
    """Retorna os alarmes ativos da máquina conectada"""
    try:
        cfg = current_app.plc_controller.active_config
        if not cfg:
            return jsonify({'ok': False, 'error': 'no machine selected'}), 400
        
        # Verifica se o driver está conectado
        is_connected = False
        if current_app.plc_controller.driver:
            try:
                is_connected = current_app.plc_controller.driver.is_connected()
            except:
                is_connected = False
        
        if not is_connected:
            return jsonify({'ok': False, 'error': 'PLC not connected'}), 400
        
        # Lê dados atuais do PLC
        try:
            machine = cfg.get('name')
            tag_defs = current_app.plc_controller.comm_map_by_machine.get(machine, [])
            
            if not tag_defs:
                return jsonify({'ok': False, 'error': 'no communication map loaded'}), 400
            
            # Lê tags do PLC
            plc_data = current_app.plc_controller.driver.read_tags(tag_defs)
            
            # Processa alarmes
            from ..services.alarm_processor import alarm_processor
            active_alarms = alarm_processor.process_alarm_data(plc_data, machine)
            alarm_summary = alarm_processor.get_alarm_summary(active_alarms)
            
            return jsonify({
                'ok': True,
                'machine': machine,
                'active_alarms': active_alarms,
                'alarm_summary': alarm_summary,
                'timestamp': time.time()
            })
            
        except Exception as e:
            return jsonify({'ok': False, 'error': f'Error reading PLC data: {str(e)}'}), 500
            
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@machines_bp.route('/alarms/history', methods=['GET'])
def get_alarm_history():
    """Retorna o histórico de alarmes"""
    try:
        from ..services.alarm_processor import alarm_processor
        
        # Parâmetro opcional para limitar quantidade
        limit = request.args.get('limit', 100, type=int)
        if limit > 1000:
            limit = 1000
        
        history = alarm_processor.get_alarm_history(limit)
        
        return jsonify({
            'ok': True,
            'history': history,
            'count': len(history),
            'timestamp': time.time()
        })
        
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500