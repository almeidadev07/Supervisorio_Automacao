# app/controllers/setups_controller.py
from flask import Blueprint, jsonify, request, current_app, send_file
import logging
import json
from ..models.setups_model import load_setups, save_setups
from ..models.setups_model import DEFAULT_SETUPS

logger = logging.getLogger(__name__)
setups_bp = Blueprint('setups', __name__)

def validate_setup_values(setup_values):
    if not isinstance(setup_values, list):
        return False
    if len(setup_values) != 7:
        return False
    if not all(isinstance(x, (int, float)) for x in setup_values):
        return False
    return True

@setups_bp.route('/setups', methods=['GET'])
def get_setups():
    try:
        s = load_setups()
        return jsonify(s)
    except Exception as e:
        logger.error(f"Error getting setups: {e}")
        return jsonify({"error": "Failed to load setups"}), 500

@setups_bp.route('/setups', methods=['POST'])
def post_setups():
    try:
        setups = request.json
        if not isinstance(setups, dict):
            return jsonify({"error": "Invalid format - must be an object"}), 400
        for setup_id, values in setups.items():
            if not validate_setup_values(values):
                return jsonify({"error": f"Invalid values for setup {setup_id}"}), 400
        save_setups(setups)
        return jsonify({"status": "success", "message": "Setups saved successfully"})
    except Exception as e:
        logger.error(f"Error saving setups: {e}")
        return jsonify({"error": "Failed to save setups"}), 500

@setups_bp.route('/export', methods=['GET'])
def export_setups():
    try:
        data = load_setups()
        # write to a temp file or send in-memory; for simplicity reuse file
        return send_file(
            os.path.join(os.getcwd(), 'data', 'egg_setups.json'),
            mimetype='application/json',
            as_attachment=True,
            download_name='egg_setups.json'
        )
    except Exception as e:
        logger.error(f"Error exporting setups: {e}")
        return jsonify({"error": "Failed to export setups"}), 500

@setups_bp.route('/import', methods=['POST'])
def import_setups():
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400
        file = request.files['file']
        if not file.filename.endswith('.json'):
            return jsonify({"error": "Invalid file type - must be JSON"}), 400
        try:
            imported = json.load(file)
        except json.JSONDecodeError:
            return jsonify({"error": "Invalid JSON file"}), 400
        if not isinstance(imported, dict):
            return jsonify({"error": "Invalid format - must be an object"}), 400
        for setup_id, values in imported.items():
            if not validate_setup_values(values):
                return jsonify({"error": f"Invalid values for setup {setup_id}"}), 400
        save_setups(imported)
        return jsonify({"status": "success", "message": "Setups imported successfully"})
    except Exception as e:
        logger.error(f"Error importing setups: {e}")
        return jsonify({"error": "Failed to import setups"}), 500
