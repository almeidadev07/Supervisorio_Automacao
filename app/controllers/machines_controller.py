# app/controllers/machines_controller.py
from flask import Blueprint, jsonify, request, current_app, Response
import logging
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

@machines_bp.route('/features', methods=['GET'])
def features():
    cfg = current_app.plc_controller.active_config
    if not cfg:
        return jsonify({'ok': False, 'error': 'no machine selected'}), 400
    return jsonify({'machine': cfg['name'], 'embaladoras': cfg.get('embaladoras', 0), 'features': cfg.get('features', {})})

@machines_bp.route('/detect_by_ip', methods=['GET'])
def detect_by_ip():
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
