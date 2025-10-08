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

@machines_bp.route('/subscribe_tags', methods=['POST'])
def subscribe_tags():
    """Registra quais tags um cliente (tela) precisa receber"""
    payload = request.json or {}
    client_id = payload.get('client_id')
    tag_names = payload.get('tags', [])
    
    if not client_id:
        return jsonify({'ok': False, 'error': 'client_id é obrigatório'}), 400
    
    if not isinstance(tag_names, list):
        return jsonify({'ok': False, 'error': 'tags deve ser uma lista'}), 400
    
    success = current_app.plc_controller.subscribe_tags(client_id, tag_names)
    
    return jsonify({
        'ok': success,
        'client_id': client_id,
        'subscribed_tags': len(tag_names)
    })

@machines_bp.route('/unsubscribe', methods=['POST'])
def unsubscribe():
    """Remove todas as subscrições de um cliente"""
    payload = request.json or {}
    client_id = payload.get('client_id')
    
    if not client_id:
        return jsonify({'ok': False, 'error': 'client_id é obrigatório'}), 400
    
    success = current_app.plc_controller.unsubscribe_client(client_id)
    
    return jsonify({
        'ok': success,
        'client_id': client_id
    })

@machines_bp.route('/heartbeat', methods=['POST'])
def heartbeat():
    """Mantém a subscrição de um cliente ativa"""
    payload = request.json or {}
    client_id = payload.get('client_id')
    
    if not client_id:
        return jsonify({'ok': False, 'error': 'client_id é obrigatório'}), 400
    
    success = current_app.plc_controller.heartbeat_client(client_id)
    
    return jsonify({
        'ok': success,
        'client_id': client_id
    })

@machines_bp.route('/subscriptions', methods=['GET'])
def get_subscriptions():
    """Retorna informações sobre as subscrições ativas"""
    with current_app.plc_controller._subscription_lock:
        subscriptions = {}
        for client_id, sub_info in current_app.plc_controller._active_subscriptions.items():
            subscriptions[client_id] = {
                'tags_count': len(sub_info['tags']),
                'last_heartbeat': sub_info['last_heartbeat'],
                'active': (time.time() - sub_info['last_heartbeat']) < current_app.plc_controller._heartbeat_timeout
            }
    
    subscribed_tags = current_app.plc_controller.get_subscribed_tags()
    
    return jsonify({
        'ok': True,
        'active_clients': len(subscriptions),
        'total_subscribed_tags': len(subscribed_tags),
        'clients': subscriptions
    })

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
        
        # Garante que comm_map é uma lista de dicionários
        if isinstance(comm_map, list):
            valid_tags = {tag['name'] for tag in comm_map if isinstance(tag, dict) and 'name' in tag}
        else:
            valid_tags = set()
        
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

@machines_bp.route('/write_word_bit', methods=['POST'])
def write_word_bit():
    """Escreve um bit específico dentro de uma tag WORD com read-modify-write.
    Payload: { "name": "TAG_WORD", "bit": 0-15, "mode": "set"|"clear"|"pulse"|"toggle"|"state", "pulse_ms": optional, "value": 0|1 }
    """
    try:
        payload = request.json or {}
        name = payload.get('name')
        bit = int(payload.get('bit', -1))
        mode = (payload.get('mode') or 'set').lower()
        pulse_ms = int(payload.get('pulse_ms', 200))
        pure = bool(payload.get('pure', False))  # se True, escreve somente o bit (0..1<<bit), ignorando outros
        no_clear = bool(payload.get('no_clear', False))  # se True em pulse, não limpa após setar

        if not name or bit < 0 or bit > 15:
            return jsonify({'ok': False, 'error': 'Parâmetros inválidos (name e bit 0..15 obrigatórios)'}), 400

        cfg = current_app.plc_controller.active_config
        if not cfg:
            return jsonify({'ok': False, 'error': 'No machine selected'}), 400

        # Valida no comm_map e tipo WORD
        machine = cfg.get('name')
        comm_map = (current_app.comm_map or {}).get(machine, [])
        tag_def = next((t for t in comm_map if isinstance(t, dict) and t.get('name') == name), None)
        if not tag_def:
            return jsonify({'ok': False, 'error': f'Tag {name} não encontrada no comm_map'}), 400
        if (tag_def.get('type') or '').upper() != 'WORD':
            return jsonify({'ok': False, 'error': f'Tag {name} não é WORD'}), 400

        # Lê valor atual somente quando necessário
        need_read = not (pure and mode in ('set', 'clear'))
        if need_read:
            values = current_app.plc_controller.read_tags([name]) or {}
            if name not in values or values[name] is None:
                return jsonify({'ok': False, 'error': 'Falha ao ler valor atual'}), 500
            word = int(values[name]) & 0xFFFF
        else:
            word = 0

        def do_write(new_word: int) -> bool:
            return current_app.plc_controller.write_tags({ name: int(new_word) })

        if mode == 'set':
            new_word = ((1 << bit) & 0xFFFF) if pure else ((word | (1 << bit)) & 0xFFFF)
            ok = do_write(new_word)
            return jsonify({'ok': bool(ok), 'written': new_word}) if ok else (jsonify({'ok': False, 'error': 'Falha ao escrever WORD'}), 500)
        elif mode == 'clear':
            new_word = 0 if pure else ((word & ~(1 << bit)) & 0xFFFF)
            ok = do_write(new_word)
            return jsonify({'ok': bool(ok), 'written': new_word}) if ok else (jsonify({'ok': False, 'error': 'Falha ao escrever WORD'}), 500)
        elif mode == 'pulse':
            set_word = ((1 << bit) & 0xFFFF) if pure else ((word | (1 << bit)) & 0xFFFF)
            ok1 = do_write(set_word)
            if not ok1:
                return jsonify({'ok': False, 'error': 'Falha ao setar bit'}), 500
            if no_clear:
                return jsonify({'ok': True, 'set_word': set_word, 'cleared': False})
            import time as _t
            _t.sleep(max(0, pulse_ms) / 1000.0)
            clear_word = (set_word & ~(1 << bit)) & 0xFFFF
            ok2 = do_write(clear_word)
            if not ok2:
                return jsonify({'ok': False, 'error': 'Falha ao limpar bit após pulso'}), 500
            return jsonify({'ok': True, 'set_word': set_word, 'clear_word': clear_word})
        elif mode == 'toggle':
            # Inverte o bit e escreve (pure=True escreve só o bit como 0/1 absoluto)
            current_on = ((word >> bit) & 1) == 1
            if pure:
                new_word = (1 << bit) if (not current_on) else 0
            else:
                if current_on:
                    new_word = (word & ~(1 << bit)) & 0xFFFF
                else:
                    new_word = (word | (1 << bit)) & 0xFFFF
            ok = do_write(new_word)
            if not ok:
                return jsonify({'ok': False, 'error': 'Falha ao escrever WORD no toggle'}), 500
            new_on = 1 if ((new_word >> bit) & 1) == 1 else 0
            return jsonify({'ok': True, 'written': new_word, 'bit': bit, 'value': new_on})
        elif mode == 'state':
            # Define explicitamente o estado do bit (0/1). Se pure=True, escreve somente o bit; senão read-modify-write.
            val = 1 if int(payload.get('value', 0)) else 0
            if pure:
                new_word = (1 << bit) if val == 1 else 0
            else:
                if need_read is False:
                    # Garante leitura para r-m-w
                    values = current_app.plc_controller.read_tags([name]) or {}
                    if name not in values or values[name] is None:
                        return jsonify({'ok': False, 'error': 'Falha ao ler valor atual'}), 500
                    word = int(values[name]) & 0xFFFF
                if val == 1:
                    new_word = (word | (1 << bit)) & 0xFFFF
                else:
                    new_word = (word & ~(1 << bit)) & 0xFFFF
            ok = do_write(new_word)
            if not ok:
                return jsonify({'ok': False, 'error': 'Falha ao escrever WORD no state'}), 500
            return jsonify({'ok': True, 'written': new_word, 'bit': bit, 'value': val})
        else:
            return jsonify({'ok': False, 'error': 'mode inválido (use set|clear|pulse)'}), 400
    except Exception as e:
        logger.error(f"Erro em write_word_bit: {e}")
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

@machines_bp.route('/reload_comm_map', methods=['POST'])
def reload_comm_map():
    """Recarrega o comm_map da máquina ativa a partir de config/comm_map/<MACHINE>.json"""
    try:
        success, message = current_app.plc_controller.reload_comm_map_for_active()
        if success:
            return jsonify({'ok': True, 'message': message})
        else:
            return jsonify({'ok': False, 'error': message}), 500
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
            
            # Lê tags do PLC usando o controlador (com lock e políticas internas)
            plc_data = current_app.plc_controller.read_tags()
            
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

@machines_bp.route('/weight_range', methods=['POST'])
def set_weight_range():
    """Define valores de faixas de peso para um preset e escreve no PLC.
    Payload esperado: { "preset": 1..4, "values": [v1..v7] }
    - preset 1 usa MAPA_0, 2 -> MAPA_1, 3 -> MAPA_2, 4 -> MAPA_3
    - v1..v7 mapeiam para TIPO_P1..TIPO_P7
    - cada valor é limitado a [0, 150]
    - também escreve a tag de seleção do preset no PLC
    """
    try:
        payload = request.json or {}
        preset = int(payload.get('preset', 1))
        values = payload.get('values')
        if preset not in (1, 2, 3, 4):
            return jsonify({'ok': False, 'error': 'preset inválido (1-4)'}), 400
        if not isinstance(values, list) or len(values) != 7:
            return jsonify({'ok': False, 'error': 'values deve conter 7 números'}), 400
        # Limita valores 0..150 e converte para float (REAL)
        try:
            clamped = [float(max(0, min(150, float(v)))) for v in values]
        except Exception:
            return jsonify({'ok': False, 'error': 'values deve conter números'}), 400

        # Determina sufixo do mapa
        mapa_idx = preset - 1  # 1->0, 2->1, 3->2, 4->3

        # Verifica comm_map da máquina ativa
        cfg = current_app.plc_controller.active_config
        if not cfg:
            return jsonify({'ok': False, 'error': 'No machine selected'}), 400
        machine = cfg.get('name')
        comm_map = (current_app.comm_map or {}).get(machine, [])
        valid_tags = {tag['name'] for tag in comm_map if isinstance(tag, dict) and 'name' in tag}

        # Garante driver conectado (tenta reconectar se necessário)
        driver = current_app.plc_controller.driver
        if not driver or not driver.is_connected():
            ok, msg = current_app.plc_controller.force_reconnect()
            if not ok:
                return jsonify({'ok': False, 'error': f'PLC desconectado: {msg}'}), 500

        # Monta payload de escrita
        tag_values = {}
        # Escreve seleção do preset no PLC (WORD/INT). Pelo requisito: preset 1->MAPA_0 => valor 0
        selecao_tag = 'XLCLASS_DB229_PESAGEM_SELECAO'
        if selecao_tag in valid_tags:
            tag_values[selecao_tag] = int(mapa_idx)
        else:
            # Se a tag não existe, retorna erro explícito para facilitar diagnóstico
            return jsonify({'ok': False, 'error': f'tag de seleção não encontrada no comm_map: {selecao_tag}'}), 400

        # Faixas
        for i, val in enumerate(clamped, start=1):
            tag_name = f"XLCLASS_DB229_PESAGEM_MAPA_{mapa_idx}_TIPO_P{i}"
            if tag_name not in valid_tags:
                return jsonify({'ok': False, 'error': f'tag não encontrada no comm_map: {tag_name}'}), 400
            tag_values[tag_name] = val

        # Escreve tags
        success = current_app.plc_controller.write_tags(tag_values)
        if not success:
            return jsonify({'ok': False, 'error': 'Falha ao escrever tags no PLC'}), 500

        # Lê de volta para confirmar gravação
        try:
            read_back_names = [selecao_tag] + [f"XLCLASS_DB229_PESAGEM_MAPA_{mapa_idx}_TIPO_P{i}" for i in range(1, 8)]
            read_values = current_app.plc_controller.read_tags(read_back_names) or {}
        except Exception:
            read_values = {}

        return jsonify({'ok': True, 'written': tag_values, 'read_back': read_values})
    except Exception as e:
        logger.error(f"Erro em set_weight_range: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500


@machines_bp.route('/weight_range', methods=['GET'])
def get_weight_range():
    """Lê valores atuais das faixas de peso para um preset.
    Query: ?preset=1..4
    """
    try:
        preset = request.args.get('preset', default=1, type=int)
        if preset not in (1, 2, 3, 4):
            return jsonify({'ok': False, 'error': 'preset inválido (1-4)'}), 400
        mapa_idx = preset - 1

        cfg = current_app.plc_controller.active_config
        if not cfg:
            return jsonify({'ok': False, 'error': 'No machine selected'}), 400

        # Monta lista de tags a ler
        tag_names = [f"XLCLASS_DB229_PESAGEM_MAPA_{mapa_idx}_TIPO_P{i}" for i in range(1, 8)]
        values = current_app.plc_controller.read_tags(tag_names)

        # Garante retorno em ordem P1..P7 (default None se faltando)
        ordered = [values.get(name) for name in tag_names]
        return jsonify({'ok': True, 'preset': preset, 'tags': tag_names, 'values': ordered})
    except Exception as e:
        logger.error(f"Erro em get_weight_range: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500