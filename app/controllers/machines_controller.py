# app/controllers/machines_controller.py
from flask import Blueprint, jsonify, request, current_app
import logging
from ..utils import get_local_ip, find_machine_config

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
    cfg = next((m for m in (current_app.machines or []) if m['name'] == name), None)
    if not cfg:
        return jsonify({'ok': False, 'error': 'machine not found'}), 404
    # use PLCController attached to app
    ok, msg = current_app.plc_controller.set_active_machine(cfg)
    if not ok:
        return jsonify({'ok': False, 'error': msg}), 500
    return jsonify({'ok': True, 'machine': cfg['name']})

@machines_bp.route('/features', methods=['GET'])
def features():
    cfg = current_app.plc_controller.active_config
    if not cfg:
        return jsonify({'ok': False, 'error': 'no machine selected'}), 400
    return jsonify({'machine': cfg['name'], 'embaladoras': cfg.get('embaladoras', 0), 'features': cfg.get('features', {})})
