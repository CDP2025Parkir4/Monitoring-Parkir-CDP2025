import sys
import time
sys.path.append(r'E:\Programming\web\Capstone Design\ZAKI\yolov5')

import torch
import cv2
import json
import socketio
from yolov5.models.common import DetectMultiBackend
from yolov5.utils.torch_utils import select_device
from yolov5.utils.general import non_max_suppression, scale_boxes
from yolov5.utils.augmentations import letterbox

# ==============================
# KONFIGURASI
# ==============================
MODEL_PATH = r"E:\Programming\web\Capstone Design\MODEL\copilot\yolov5s.pt"
VIDEO_PATH = r"E:\Programming\web\Capstone Design\FOOTAGE\kedokteran2.mp4"
SLOTS_JSON = r"E:\Programming\web\Capstone Design\MAPPING\kedokteran2.json"
OUTPUT_PATH = r'E:\Programming\web\Capstone Design\OUTPUT\copilot\kedokteran2222.mp4'
LOT_ID = 'dummy'
IMG_SIZE = 640
CONF_THRES = 0.45
IOU_THRES = 0.45

# --- Parameter teori frame + waktu ---
DETECT_THRESHOLD = 2     # min frame berturut-turut untuk deteksi terisi
MISS_THRESHOLD = 90       # min frame berturut-turut untuk deteksi kosong
OCCUPIED_TIME = 0.04      # detik minimal untuk lock "terisi"
EMPTY_TIME = 3        # detik minimal untuk lock "kosong"
# --- Socket config ---
SOCKET_URL = 'http://localhost:5000'
SOCKET_EVENT = 'detector_update'
EMIT_INTERVAL = 1.0  # detik minimal antar kirim snapshot
# ==============================

# --- Load slot JSON ---
with open(SLOTS_JSON, "r") as f:
    slots = json.load(f)

# COCO class names (80 classes)
COCO_NAMES = [
    'person','bicycle','car','motorcycle','airplane','bus','train','truck','boat','traffic light',
    'fire hydrant','stop sign','parking meter','bench','bird','cat','dog','horse','sheep','cow',
    'elephant','bear','zebra','giraffe','backpack','umbrella','handbag','tie','suitcase','frisbee',
    'skis','snowboard','sports ball','kite','baseball bat','baseball glove','skateboard','surfboard','tennis racket','bottle',
    'wine glass','cup','fork','knife','spoon','bowl','banana','apple','sandwich','orange',
    'broccoli','carrot','hot dog','pizza','donut','cake','chair','couch','potted plant','bed',
    'dining table','toilet','tv','laptop','mouse','remote','keyboard','cell phone','microwave','oven',
    'toaster','sink','refrigerator','book','clock','vase','scissors','teddy bear','hair drier','toothbrush'
]

# --- class filter (COCO) ---
CLASS_CAR_IDX = 2  # COCO index for 'car'

# --- Load model YOLO ---
device = select_device('')
try:
    model = DetectMultiBackend(MODEL_PATH, device=device)
except Exception as e:
    raise RuntimeError(f"Failed to load model at {MODEL_PATH}: {e}")

stride, pt = model.stride, model.pt
model.warmup(imgsz=(1, 3, IMG_SIZE, IMG_SIZE))

# ensure we use COCO class names (model may have custom names)
try:
    if hasattr(model, 'names') and model.names is not None and len(model.names) == 80:
        names = model.names
    elif hasattr(model, 'names') and model.names is not None and len(model.names) > 0:
        names = model.names
    else:
        names = COCO_NAMES
except Exception:
    names = COCO_NAMES

# --- Fungsi bantu ---
def is_point_in_box(point, box):
    (x1, y1), (x2, y2) = box
    px, py = point
    return x1 <= px <= x2 and y1 <= py <= y2

# --- Buka video ---
cap = cv2.VideoCapture(VIDEO_PATH)
frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
src_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
fourcc = cv2.VideoWriter_fourcc(*'mp4v')
out = cv2.VideoWriter(OUTPUT_PATH, fourcc, src_fps, (frame_width, frame_height))

# --- Inisialisasi status tiap slot ---
slot_status = {
    name: {
        "status": "Kosong",
        "detected": 0,
        "missed": 0,
        "last_change": time.time(),
        "candidate_status": "Kosong"
    } for name in slots
}

# --- Socket.IO client ---
sio = socketio.Client(reconnection=True, logger=False, engineio_logger=False)

@sio.event
def connect():
    print("🔌 Socket.IO detector connected:", sio.sid)

@sio.event
def disconnect():
    print("⚠️ Socket.IO detector disconnected")

def ensure_socket_connected():
    if sio.connected:
        return
    try:
        sio.connect(SOCKET_URL, transports=['websocket'])
    except Exception as exc:
        print(f"❌ Gagal konek ke Socket.IO ({SOCKET_URL}): {exc}")

def emit_slot_snapshot():
    if not sio.connected:
        ensure_socket_connected()
        if not sio.connected:
            return
    payload = {
        "location": LOT_ID,
        "slots": [
            {
                "slotId": slot_name,
                "status": "occupied" if str(data["status"]).lower() == "terisi" else "available"
            }
            for slot_name, data in slot_status.items()
        ],
        "timestamp": time.time()
    }
    try:
        sio.emit(SOCKET_EVENT, payload)
    except Exception as exc:
        print(f"⚠️ Gagal mengirim snapshot parkir: {exc}")

# --- FPS counter initialization ---
last_time = time.time()
fps = 0.0
fps_alpha = 0.1  # smoothing factor for EMA FPS

# --- Display downscale factor ---
DISPLAY_DOWNSCALE = 2  # Render at half resolution

# --- Async writer worker ---
import threading
import queue

class WriterWorker(threading.Thread):
    def __init__(self, writer, max_queue=64):
        super().__init__(daemon=True)
        self.writer = writer
        self.q = queue.Queue(maxsize=max_queue)
        self._stop = threading.Event()

    def put(self, frame):
        try:
            self.q.put_nowait(frame)
        except queue.Full:
            self.q.get_nowait()  # Drop the oldest frame
            self.q.put_nowait(frame)

    def run(self):
        while not self._stop.is_set() or not self.q.empty():
            try:
                frame = self.q.get(timeout=0.1)
                self.writer.write(frame)
            except queue.Empty:
                continue

    def stop(self):
        self._stop.set()
        while not self.q.empty():
            try:
                frame = self.q.get_nowait()
                self.writer.write(frame)
            except queue.Empty:
                break

# --- Start async writer ---
writer = WriterWorker(out, max_queue=64)
writer.start()
ensure_socket_connected()
last_emit_time = 0.0

# ==============================
# LOOP UTAMA
# ==============================
while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    # Keep a full-res copy for writing (we draw on this and write full-res)
    write_frame = frame.copy()

    # --- Preprocess frame untuk YOLO ---
    img = letterbox(frame, IMG_SIZE, stride=stride, auto=True)[0]
    img = img[:, :, ::-1].transpose((2, 0, 1)).copy()
    img = torch.from_numpy(img).to(device)
    img = img.float() / 255.0
    if img.ndimension() == 3:
        img = img.unsqueeze(0)

    # --- Deteksi YOLO (filter hanya class 'car' via classes arg) ---
    pred = model(img)
    pred = non_max_suppression(pred, conf_thres=CONF_THRES, iou_thres=IOU_THRES, classes=[CLASS_CAR_IDX])

    occupied_slots = set()

    # --- Skala balik hasil ke ukuran asli ---    
    for det in pred:
        if len(det):
            det[:, :4] = scale_boxes(img.shape[2:], det[:, :4], frame.shape).round()
            for *xyxy, conf, cls in det:
                x1, y1, x2, y2 = map(int, xyxy)
                cx = int((x1 + x2) / 2)
                cy = int(y1 + (y2 - y1) * 0.4)

                # Since we filtered by class index above, assume it's a car
                label = names[int(cls)] if names and len(names) > int(cls) else 'car'

                # draw detection (car only)
                cv2.rectangle(write_frame, (x1, y1), (x2, y2), (255, 255, 0), 2)
                cv2.putText(write_frame, f"{label} {float(conf):.2f}", (x1, y1 - 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)
                cv2.circle(write_frame, (cx, cy), 4, (0, 255, 255), -1)

                # Check whether car centroid is inside any slot
                for name, coords in slots.items():
                    if is_point_in_box((cx, cy), coords):
                        occupied_slots.add(name)
                        break

    current_time = time.time()

    # --- Update status tiap slot ---
    for name in slots:
        s = slot_status[name]
        if name in occupied_slots:
            s["detected"] += 1
            s["missed"] = 0
            if s["detected"] >= DETECT_THRESHOLD:
                if s["candidate_status"] != "Terisi":
                    s["candidate_status"] = "Terisi"
                    s["last_change"] = current_time
        else:
            s["missed"] += 1
            s["detected"] = 0
            if s["missed"] >= MISS_THRESHOLD:
                if s["candidate_status"] != "Kosong":
                    s["candidate_status"] = "Kosong"
                    s["last_change"] = current_time

        # --- Lock status berdasarkan waktu ---
        time_since_change = current_time - s["last_change"]
        if s["candidate_status"] == "Terisi" and time_since_change >= OCCUPIED_TIME:
            s["status"] = "Terisi"
        elif s["candidate_status"] == "Kosong" and time_since_change >= EMPTY_TIME:
            s["status"] = "Kosong"

        # --- Gambar slot pada write_frame ---
        (sx1, sy1), (sx2, sy2) = slots[name]
        color = (0, 0, 255) if s["status"] == "Terisi" else (0, 255, 0)
        cv2.rectangle(write_frame, (sx1, sy1), (sx2, sy2), color, 2)
        cv2.putText(write_frame, f"{name}: {s['status']}", (sx1, sy1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

    if current_time - last_emit_time >= EMIT_INTERVAL:
        emit_slot_snapshot()
        last_emit_time = current_time

    # --- Calculate FPS ---
    current_time = time.time()
    dt = current_time - last_time
    last_time = current_time
    fps_inst = 1.0 / dt if dt > 0 else 0.0
    fps = fps * (1.0 - fps_alpha) + fps_inst * fps_alpha if fps > 0 else fps_inst

    # --- Display FPS on write_frame (and display downscale copy) ---
    cv2.putText(write_frame, f"FPS: {fps:.1f}", (20, 40),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)

    # --- Async write full-resolution frame ---
    writer.put(write_frame)

    # --- Prepare display frame (downscale for UI) ---
    disp_frame = write_frame
    if DISPLAY_DOWNSCALE > 1:
        h, w = disp_frame.shape[:2]
        disp_frame = cv2.resize(disp_frame, (w // DISPLAY_DOWNSCALE, h // DISPLAY_DOWNSCALE), interpolation=cv2.INTER_LINEAR)

    # --- Display frame ---
    cv2.imshow("Mapping Parkir YOLOv5", disp_frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# --- Akhiri ---
writer.stop()
cap.release()
out.release()
cv2.destroyAllWindows()
print(f"✅ Hasil deteksi stabil disimpan ke: {OUTPUT_PATH}")
if sio.connected:
    sio.disconnect()
