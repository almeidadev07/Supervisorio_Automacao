# app/models/setups_model.py
import os
import json

DATA_DIR = os.path.join(os.getcwd(), 'data')
os.makedirs(DATA_DIR, exist_ok=True)
SETUPS_FILE = os.path.join(DATA_DIR, 'egg_setups.json')

DEFAULT_SETUPS = {
    "0": [25, 10, 15, 15, 10, 15, 10],
    "1": [25, 10, 15, 15, 10, 15, 10],
    "2": [25, 10, 15, 15, 10, 15, 10],
    "3": [25, 10, 15, 15, 10, 15, 10]
}

def ensure_file():
    if not os.path.exists(SETUPS_FILE):
        with open(SETUPS_FILE, 'w') as f:
            json.dump(DEFAULT_SETUPS, f)

def load_setups():
    ensure_file()
    with open(SETUPS_FILE, 'r') as f:
        return json.load(f)

def save_setups(data):
    with open(SETUPS_FILE, 'w') as f:
        json.dump(data, f)
