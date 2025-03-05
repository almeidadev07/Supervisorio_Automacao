from flask import Blueprint, request, jsonify
from models.plc_model import PLCModel

plc_controller = Blueprint('plc_controller', __name__)

# Instância do modelo PLC
plc = PLCModel(ip_address="192.168.0.1", rack=0, slot=1)

@plc_controller.route("/connect_plc", methods=["POST"])
def connect_plc():
    plc.connect()
    return jsonify({"status": "connected" if plc.connected else "failed"})

@plc_controller.route("/disconnect_plc", methods=["POST"])
def disconnect_plc():
    plc.disconnect()
    return jsonify({"status": "disconnected"})

@plc_controller.route("/read_plc", methods=["POST"])
def read_plc():
    db_number = int(request.json.get("db_number"))
    start_offset = int(request.json.get("start_offset"))
    size = int(request.json.get("size"))
    data = plc.read_data(db_number, start_offset, size)
    return jsonify({"data": list(data) if data else []})

@plc_controller.route("/write_plc", methods=["POST"])
def write_plc():
    db_number = int(request.json.get("db_number"))
    start_offset = int(request.json.get("start_offset"))
    data = bytes(request.json.get("data"))
    plc.write_data(db_number, start_offset, data)
    return jsonify({"status": "success"})
