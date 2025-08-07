from flask import Flask, render_template, request, jsonify, send_from_directory, send_file, make_response
from flask_cors import CORS
import json
import os
import logging
from werkzeug.utils import secure_filename

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)  # Enable CORS

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Add routes at the beginning
@app.route('/')
@app.route('/index')
def index():
    return render_template('dashboard.html')

# Directory for storing setups
DATA_DIR = 'data'
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)

# Path to setups file
SETUPS_FILE = os.path.join(DATA_DIR, 'egg_setups.json')

# Default values
DEFAULT_SETUPS = {
    "0": [25, 10, 15, 15, 10, 15, 10],
    "1": [25, 10, 15, 15, 10, 15, 10],
    "2": [25, 10, 15, 15, 10, 15, 10],
    "3": [25, 10, 15, 15, 10, 15, 10]
}

def validate_setup_values(setup_values):
    """Validate setup values"""
    if not isinstance(setup_values, list):
        return False
    if len(setup_values) != 7:  # Must have exactly 7 values
        return False
    if not all(isinstance(x, (int, float)) for x in setup_values):
        return False
    return True

# Initialize setups file if it doesn't exist
if not os.path.exists(SETUPS_FILE):
    with open(SETUPS_FILE, 'w') as f:
        json.dump(DEFAULT_SETUPS, f)

@app.route('/api/setups', methods=['GET'])
def get_setups():
    try:
        with open(SETUPS_FILE, 'r') as f:
            setups = json.load(f)
        logger.debug(f"Retrieved setups: {setups}")
        return jsonify(setups)
    except Exception as e:
        logger.error(f"Error getting setups: {str(e)}")
        return jsonify({"error": "Failed to load setups"}), 500

@app.route('/api/setups', methods=['POST'])
def save_setups():
    try:
        setups = request.json
        logger.debug(f"Received setups data: {setups}")
        
        # Validate format
        if not isinstance(setups, dict):
            logger.error("Invalid format received")
            return jsonify({"error": "Invalid format - must be an object"}), 400
        
        # Validate each setup
        for setup_id, values in setups.items():
            if not validate_setup_values(values):
                logger.error(f"Invalid values for setup {setup_id}")
                return jsonify({"error": f"Invalid values for setup {setup_id}"}), 400
        
        # Save to file
        with open(SETUPS_FILE, 'w') as f:
            json.dump(setups, f)
        
        logger.info("Setups saved successfully")
        return jsonify({"status": "success", "message": "Setups saved successfully"})
    except Exception as e:
        logger.error(f"Error saving setups: {str(e)}")
        return jsonify({"error": "Failed to save setups"}), 500

@app.route('/api/export', methods=['GET'])
def export_setups():
    try:
        if not os.path.exists(SETUPS_FILE):
            logger.error("Setups file not found")
            return jsonify({"error": "No setups found"}), 404
            
        return send_file(
            SETUPS_FILE,
            mimetype='application/json',
            as_attachment=True,
            download_name='egg_setups.json'
        )
    except Exception as e:
        logger.error(f"Error exporting setups: {str(e)}")
        return jsonify({"error": "Failed to export setups"}), 500

@app.route('/api/import', methods=['POST'])
def import_setups():
    try:
        if 'file' not in request.files:
            logger.error("No file provided")
            return jsonify({"error": "No file provided"}), 400
            
        file = request.files['file']
        if file.filename == '':
            logger.error("No file selected")
            return jsonify({"error": "No file selected"}), 400
            
        if not file.filename.endswith('.json'):
            logger.error("Invalid file type")
            return jsonify({"error": "Invalid file type - must be JSON"}), 400
            
        # Read and validate imported data
        try:
            imported_setups = json.load(file)
            
            # Validate format
            if not isinstance(imported_setups, dict):
                logger.error("Invalid format in imported file")
                return jsonify({"error": "Invalid format - must be an object"}), 400
                
            # Validate each setup
            for setup_id, values in imported_setups.items():
                if not validate_setup_values(values):
                    logger.error(f"Invalid values for setup {setup_id} in imported file")
                    return jsonify({"error": f"Invalid values for setup {setup_id}"}), 400
            
            # Save valid imported data
            with open(SETUPS_FILE, 'w') as f:
                json.dump(imported_setups, f)
                
            logger.info("Setups imported successfully")
            return jsonify({
                "status": "success",
                "message": "Setups imported successfully"
            })
            
        except json.JSONDecodeError:
            logger.error("Invalid JSON file")
            return jsonify({"error": "Invalid JSON file"}), 400
            
    except Exception as e:
        logger.error(f"Error importing setups: {str(e)}")
        return jsonify({"error": "Failed to import setups"}), 500

@app.route('/static/pdfs/<path:filename>')
def serve_pdf(filename):
    response = make_response(send_from_directory('static/pdfs', filename))
    # Remove X-Frame-Options se existir
    response.headers.pop('X-Frame-Options', None)
    return response

if __name__ == "__main__":
    app.run(debug=True, host='127.0.0.1', port=5000)