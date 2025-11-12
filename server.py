from collections import defaultdict
import time
from flask import Flask, request
from flask_socketio import SocketIO, emit
from flask_cors import CORS


app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

DETECTOR_EVENT = 'detector_update'
BROADCAST_EVENT = 'parking_status'
STATE_EVENT = 'parking_state_snapshot'

parking_state = defaultdict(dict)


def normalize_status(status):
    text = str(status or '').strip().lower()
    if text in {'occupied', 'penuh', 'terisi', 'full', 'taken'}:
        return 'occupied'
    return 'available'


def normalize_lot_id(entry, fallback=None):
    return entry.get('location') or entry.get('lotId') or entry.get('lot') or fallback


def normalize_slot_id(entry):
    return entry.get('slotId') or entry.get('slot') or entry.get('id')


def collect_updates(payload, inherited_lot=None):
    updates = []
    if isinstance(payload, list):
        for item in payload:
            updates.extend(collect_updates(item, inherited_lot))
        return updates

    if not isinstance(payload, dict):
        return updates

    lot_id = normalize_lot_id(payload, inherited_lot)
    slots = payload.get('slots')
    if isinstance(slots, list):
        for slot_entry in slots:
            lot = normalize_lot_id(slot_entry, lot_id)
            slot_id = normalize_slot_id(slot_entry)
            if lot and slot_id:
                updates.append({
                    'lotId': lot,
                    'slotId': slot_id,
                    'status': normalize_status(slot_entry.get('status') or slot_entry.get('state')),
                })
        return updates

    slot_id = normalize_slot_id(payload)
    if lot_id and slot_id:
        updates.append({
            'lotId': lot_id,
            'slotId': slot_id,
            'status': normalize_status(payload.get('status') or payload.get('state')),
        })
    return updates


def build_snapshot(lot_id):
    slots = [{'slotId': slot, 'status': status} for slot, status in sorted(parking_state[lot_id].items())]
    return {
        'location': lot_id,
        'slots': slots,
        'timestamp': time.time(),
    }


def persist_and_broadcast(payload):
    updates = collect_updates(payload)
    if not updates:
        return

    touched_lots = set()
    for update in updates:
        lot = update['lotId']
        slot = update['slotId']
        parking_state[lot][slot] = update['status']
        touched_lots.add(lot)

    for lot in touched_lots:
        socketio.emit(BROADCAST_EVENT, build_snapshot(lot))


@socketio.on('connect')
def handle_connect():
    print('✅ Client connected:', request.sid)
    for lot_id in list(parking_state.keys()):
        emit(BROADCAST_EVENT, build_snapshot(lot_id))


@socketio.on('disconnect')
def handle_disconnect():
    print('⚠️ Client disconnected')


@socketio.on(DETECTOR_EVENT)
def handle_detector_update(payload):
    persist_and_broadcast(payload)


@socketio.on('request_state')
def handle_request_state():
    for lot_id in list(parking_state.keys()):
        emit(STATE_EVENT, build_snapshot(lot_id))


if __name__ == '__main__':
    print('Menjalankan Socket.IO server di http://localhost:5000')
    socketio.run(app, port=5000, debug=True, allow_unsafe_werkzeug=True)
