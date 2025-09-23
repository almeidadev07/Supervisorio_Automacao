# app/controllers/enhanced_api_controller.py
from flask import Blueprint, request, jsonify
from ..services.enhanced_plc_controller import EnhancedPLCController
import json

# Blueprint para as rotas da API aprimorada
enhanced_api_bp = Blueprint('enhanced_api', __name__)

# Instância global do controlador (será inicializada no app)
enhanced_plc_controller = None

def init_enhanced_controller(socketio, machines_config):
    """Inicializa o controlador aprimorado"""
    global enhanced_plc_controller
    enhanced_plc_controller = EnhancedPLCController(socketio, machines_config)
    return enhanced_plc_controller

@enhanced_api_bp.route('/api/enhanced/subscribe_screen', methods=['POST'])
def subscribe_screen():
    """Subscreve cliente a uma tela específica"""
    try:
        data = request.get_json()
        client_id = data.get('client_id')
        screen_name = data.get('screen_name')
        
        if not client_id or not screen_name:
            return jsonify({'ok': False, 'error': 'client_id e screen_name são obrigatórios'}), 400
        
        success = enhanced_plc_controller.subscribe_to_screen(client_id, screen_name)
        
        if success:
            return jsonify({
                'ok': True,
                'message': f'Cliente {client_id} subscrito à tela {screen_name}',
                'client_id': client_id,
                'screen_name': screen_name
            })
        else:
            return jsonify({
                'ok': False,
                'error': 'Falha ao subscrever à tela'
            }), 500
            
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@enhanced_api_bp.route('/api/enhanced/subscribe_tags', methods=['POST'])
def subscribe_tags():
    """Subscreve cliente a tags específicas"""
    try:
        data = request.get_json()
        client_id = data.get('client_id')
        tags = data.get('tags', [])
        
        if not client_id or not tags:
            return jsonify({'ok': False, 'error': 'client_id e tags são obrigatórios'}), 400
        
        if not isinstance(tags, list):
            return jsonify({'ok': False, 'error': 'tags deve ser uma lista'}), 400
        
        success = enhanced_plc_controller.subscribe_to_tags(client_id, tags)
        
        if success:
            return jsonify({
                'ok': True,
                'message': f'Cliente {client_id} subscrito a {len(tags)} tags',
                'client_id': client_id,
                'tags_count': len(tags)
            })
        else:
            return jsonify({
                'ok': False,
                'error': 'Falha ao subscrever às tags'
            }), 500
            
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@enhanced_api_bp.route('/api/enhanced/unsubscribe', methods=['POST'])
def unsubscribe():
    """Remove subscrição de um cliente"""
    try:
        data = request.get_json()
        client_id = data.get('client_id')
        
        if not client_id:
            return jsonify({'ok': False, 'error': 'client_id é obrigatório'}), 400
        
        success = enhanced_plc_controller.unsubscribe_client(client_id)
        
        if success:
            return jsonify({
                'ok': True,
                'message': f'Cliente {client_id} removido das subscrições'
            })
        else:
            return jsonify({
                'ok': False,
                'error': 'Cliente não encontrado'
            }), 404
            
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@enhanced_api_bp.route('/api/enhanced/heartbeat', methods=['POST'])
def heartbeat():
    """Atualiza heartbeat de um cliente"""
    try:
        data = request.get_json()
        client_id = data.get('client_id')
        
        if not client_id:
            return jsonify({'ok': False, 'error': 'client_id é obrigatório'}), 400
        
        success = enhanced_plc_controller.heartbeat_client(client_id)
        
        return jsonify({
            'ok': success,
            'message': 'Heartbeat atualizado' if success else 'Cliente não encontrado'
        })
        
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@enhanced_api_bp.route('/api/enhanced/read_tags', methods=['POST'])
def read_tags():
    """Lê tags específicas"""
    try:
        data = request.get_json()
        tags = data.get('tags', [])
        
        if not tags:
            return jsonify({'ok': False, 'error': 'tags é obrigatório'}), 400
        
        if not isinstance(tags, list):
            return jsonify({'ok': False, 'error': 'tags deve ser uma lista'}), 400
        
        result = enhanced_plc_controller.read_tags(tags)
        
        return jsonify({
            'ok': True,
            'data': result,
            'tags_count': len(result)
        })
        
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@enhanced_api_bp.route('/api/enhanced/write_tags', methods=['POST'])
def write_tags():
    """Escreve tags específicas"""
    try:
        data = request.get_json()
        tag_values = data.get('tag_values', {})
        
        if not tag_values:
            return jsonify({'ok': False, 'error': 'tag_values é obrigatório'}), 400
        
        if not isinstance(tag_values, dict):
            return jsonify({'ok': False, 'error': 'tag_values deve ser um objeto'}), 400
        
        success = enhanced_plc_controller.write_tags(tag_values)
        
        return jsonify({
            'ok': success,
            'message': 'Tags escritas com sucesso' if success else 'Falha ao escrever tags'
        })
        
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@enhanced_api_bp.route('/api/enhanced/status', methods=['GET'])
def get_status():
    """Retorna status completo do sistema"""
    try:
        status = enhanced_plc_controller.get_statistics()
        
        return jsonify({
            'ok': True,
            'status': status
        })
        
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@enhanced_api_bp.route('/api/enhanced/connection_status', methods=['GET'])
def get_connection_status():
    """Retorna status das conexões"""
    try:
        status = enhanced_plc_controller.get_connection_status()
        
        return jsonify({
            'ok': True,
            'connections': status
        })
        
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@enhanced_api_bp.route('/api/enhanced/subscription_status', methods=['GET'])
def get_subscription_status():
    """Retorna status das subscrições"""
    try:
        status = enhanced_plc_controller.get_subscription_status()
        
        return jsonify({
            'ok': True,
            'subscriptions': status
        })
        
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@enhanced_api_bp.route('/api/enhanced/queue_status', methods=['GET'])
def get_queue_status():
    """Retorna status da fila"""
    try:
        status = enhanced_plc_controller.get_queue_status()
        
        return jsonify({
            'ok': True,
            'queue': status
        })
        
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@enhanced_api_bp.route('/api/enhanced/cache_status', methods=['GET'])
def get_cache_status():
    """Retorna status do cache"""
    try:
        status = enhanced_plc_controller.get_cache_status()
        
        return jsonify({
            'ok': True,
            'cache': status
        })
        
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@enhanced_api_bp.route('/api/enhanced/force_reconnect', methods=['POST'])
def force_reconnect():
    """Força reconexão de PLCs"""
    try:
        data = request.get_json() or {}
        group = data.get('group')  # Opcional: grupo específico
        
        enhanced_plc_controller.force_reconnect(group)
        
        return jsonify({
            'ok': True,
            'message': f'Reconexão forçada para {"todos os grupos" if not group else f"grupo {group}"}'
        })
        
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@enhanced_api_bp.route('/api/enhanced/screens', methods=['GET'])
def get_available_screens():
    """Retorna telas disponíveis"""
    try:
        # Carrega configuração de telas
        import os
        screen_config_path = os.path.join(
            os.path.dirname(__file__), '..', '..', 'config', 'screen_tags.json'
        )
        
        if os.path.exists(screen_config_path):
            with open(screen_config_path, 'r', encoding='utf-8') as f:
                screen_config = json.load(f)
            
            screens = []
            for screen_name, tags in screen_config.items():
                screens.append({
                    'name': screen_name,
                    'display_name': screen_name.replace('_', ' ').title(),
                    'tags_count': len(tags),
                    'tags': tags
                })
            
            return jsonify({
                'ok': True,
                'screens': screens
            })
        else:
            return jsonify({
                'ok': False,
                'error': 'Configuração de telas não encontrada'
            }), 404
            
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@enhanced_api_bp.route('/api/enhanced/screen/<screen_name>', methods=['GET'])
def get_screen_info(screen_name):
    """Retorna informações de uma tela específica"""
    try:
        # Carrega configuração de telas
        import os
        screen_config_path = os.path.join(
            os.path.dirname(__file__), '..', '..', 'config', 'screen_tags.json'
        )
        
        if os.path.exists(screen_config_path):
            with open(screen_config_path, 'r', encoding='utf-8') as f:
                screen_config = json.load(f)
            
            if screen_name in screen_config:
                return jsonify({
                    'ok': True,
                    'screen': {
                        'name': screen_name,
                        'display_name': screen_name.replace('_', ' ').title(),
                        'tags_count': len(screen_config[screen_name]),
                        'tags': screen_config[screen_name]
                    }
                })
            else:
                return jsonify({
                    'ok': False,
                    'error': 'Tela não encontrada'
                }), 404
        else:
            return jsonify({
                'ok': False,
                'error': 'Configuração de telas não encontrada'
            }), 404
            
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500
