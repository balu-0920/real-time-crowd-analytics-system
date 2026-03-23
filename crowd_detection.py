# import cv2
# import numpy as np
# import time
# import requests
# from ultralytics import YOLO
# from collections import deque
# from twilio.rest import Client

# # ─────────────────────────────────────────────────────────────────
# # CONFIG
# # ─────────────────────────────────────────────────────────────────

# ACCOUNT_SID   = "ACc9bab326269373a8ca15e37445a05838"
# AUTH_TOKEN    = "1d5595bf03d35162986b4911805df764"
# TWILIO_NUMBER = "+12193552825"
# USER_MOBILE   = "+917396370715"

# CAMERAS = {
#     "cam1": 0,
#     "cam2": "http://10.19.245.221:4747/video",
#     # "cam3": "http://10.40.188.49:4747/video"
# }

# API_URL        = "http://localhost:5000/api/live-stats"
# THRESHOLDS_URL = "http://localhost:5000/api/thresholds"

# MIN_PERSON_AREA          = 500
# POST_INTERVAL            = 0.5
# THRESHOLD_REFRESH_FRAMES = 300
# TWILIO_COOLDOWN          = 60
# SMOOTHING_WINDOW         = 10

# # ─────────────────────────────────────────────────────────────────
# # GLOBALS
# # ─────────────────────────────────────────────────────────────────

# model  = YOLO("yolov8n.pt")
# twilio = Client(ACCOUNT_SID, AUTH_TOKEN)

# thresholds          = {"LOW": 0.4, "MEDIUM": 0.7}
# threshold_frame_ctr = 0


# def fetch_thresholds():
#     try:
#         r = requests.get(THRESHOLDS_URL, timeout=1)
#         r.raise_for_status()
#         return r.json()
#     except Exception:
#         return thresholds


# # ─────────────────────────────────────────────────────────────────
# # CAMERA CLASS
# # ─────────────────────────────────────────────────────────────────

# class CrowdCamera:

#     def __init__(self, cam_id: str, source):
#         self.cam_id  = cam_id
#         self.source  = source
#         self.cap     = cv2.VideoCapture(source)

#         self.cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
#         self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

#         self.people_buffer: deque = deque(maxlen=SMOOTHING_WINDOW)

#         self.high_density_start: float | None = None
#         self.last_sms_time: float             = 0.0
#         self.last_post_time: float            = 0.0

#     def reconnect(self):
#         print(f"[{self.cam_id}] Reconnecting…")
#         self.cap.release()
#         time.sleep(0.5)
#         self.cap = cv2.VideoCapture(self.source)

#     def _send_sms(self, people: int, density: str):
#         now = time.time()
#         if now - self.last_sms_time < TWILIO_COOLDOWN:
#             return
#         try:
#             twilio.messages.create(
#                 body=(
#                     f"🚨 HIGH CROWD ALERT\n"
#                     f"Camera  : {self.cam_id}\n"
#                     f"People  : {people}\n"
#                     f"Density : {density}\n"
#                     f"Time    : {time.strftime('%H:%M:%S')}"
#                 ),
#                 from_=TWILIO_NUMBER,
#                 to=USER_MOBILE,
#             )
#             self.last_sms_time = now
#             print(f"[{self.cam_id}] SMS sent.")
#         except Exception as e:
#             print(f"[{self.cam_id}] Twilio error: {e}")

#     def process(self, thresholds_cfg: dict):
#         ret, frame = self.cap.read()
#         if not ret:
#             self.reconnect()
#             return None

#         h, w, _ = frame.shape
#         camera_area = h * w

#         # ── YOLO detection ──────────────────────────────────────
#         results = model(frame, conf=0.4, imgsz=640, verbose=False)

#         raw_people = 0
#         areas      = []

#         for box in results[0].boxes:
#             if int(box.cls[0]) != 0:
#                 continue
#             x1, y1, x2, y2 = map(int, box.xyxy[0])
#             area = (x2 - x1) * (y2 - y1)
#             if area < MIN_PERSON_AREA:
#                 continue
#             raw_people += 1
#             areas.append(area)
#             cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)

#         # ── Smoothed people count ────────────────────────────────
#         self.people_buffer.append(raw_people)
#         people = int(round(sum(self.people_buffer) / len(self.people_buffer)))

#         # ── Capacity & density ratio ─────────────────────────────
#         if areas:
#             avg_area = np.mean(areas)
#             capacity = max(1, int(camera_area / avg_area))
#         else:
#             capacity = 0

#         ratio = people / capacity if capacity > 0 else 0.0

#         low_t    = float(thresholds_cfg.get("LOW",    0.4))
#         medium_t = float(thresholds_cfg.get("MEDIUM", 0.7))

#         if ratio < low_t:
#             density = "LOW"
#             color   = (0, 255, 0)
#         elif ratio < medium_t:
#             density = "MEDIUM"
#             color   = (0, 255, 255)
#         else:
#             density = "HIGH"
#             color   = (0, 0, 255)

#         # ── HIGH-density SMS alert ───────────────────────────────
#         if density == "HIGH":
#             if self.high_density_start is None:
#                 self.high_density_start = time.time()
#             elif time.time() - self.high_density_start >= 5:
#                 self._send_sms(people, density)
#                 self.high_density_start = None
#         else:
#             self.high_density_start = None

#         # ── HUD on plain frame (no heatmap) ─────────────────────
#         cv2.putText(
#             frame,
#             f"{self.cam_id} | People: {people} | {density}  ({ratio:.2f})",
#             (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.9, color, 2,
#         )

#         # ── POST to backend (throttled) ──────────────────────────
#         now = time.time()
#         if now - self.last_post_time >= POST_INTERVAL:
#             try:
#                 requests.post(
#                     API_URL,
#                     json={
#                         "camera":       self.cam_id,
#                         "people":       people,
#                         "capacity":     capacity,
#                         "density":      density,
#                         "densityRatio": round(ratio, 4),
#                         "timestamp":    now,
#                     },
#                     timeout=0.3,
#                 )
#                 self.last_post_time = now
#             except Exception:
#                 pass

#         return frame


# # ─────────────────────────────────────────────────────────────────
# # MAIN
# # ─────────────────────────────────────────────────────────────────

# thresholds = fetch_thresholds()
# cameras    = [CrowdCamera(cam_id, src) for cam_id, src in CAMERAS.items()]

# while True:
#     threshold_frame_ctr += 1
#     if threshold_frame_ctr >= THRESHOLD_REFRESH_FRAMES:
#         thresholds          = fetch_thresholds()
#         threshold_frame_ctr = 0

#     for cam in cameras:
#         frame = cam.process(thresholds)
#         if frame is not None:
#             cv2.imshow(cam.cam_id, frame)

#     if cv2.waitKey(1) == 27:
#         break

# for cam in cameras:
#     cam.cap.release()

# cv2.destroyAllWindows()

# import cv2
# import numpy as np
# import time
# import requests
# from ultralytics import YOLO
# from twilio.rest import Client

# # ───────────────── CONFIG ─────────────────

# ACCOUNT_SID   = "ACc9bab326269373a8ca15e37445a05838"
# AUTH_TOKEN    = "1d5595bf03d35162986b4911805df764"
# TWILIO_NUMBER = "+12193552825"
# USER_MOBILE   = "+917396370715"

# CAMERAS = {
#     "cam1": 0,
#     "cam2": "http://10.19.245.221:4747/video",
# }

# API_URL = "http://localhost:5000/api/live-stats"

# POST_INTERVAL = 0.5
# TWILIO_COOLDOWN = 60

# # GRID SETTINGS
# ROWS = 5
# COLS = 4

# THRESHOLD = 0.75
# MIN_PEOPLE = 3

# COUNT_SMOOTH = 0.8

# # ───────────────── GLOBALS ─────────────────

# model = YOLO("yolov8m.pt")
# twilio = Client(ACCOUNT_SID, AUTH_TOKEN)


# # ───────────────── CAMERA CLASS ─────────────────

# class CrowdCamera:

#     def __init__(self, cam_id, source):
#         self.cam_id = cam_id
#         self.source = source
#         self.cap = cv2.VideoCapture(source)

#         self.last_sms_time = 0
#         self.last_post_time = 0
#         self.smooth_count = 0

#     def reconnect(self):
#         self.cap.release()
#         time.sleep(0.5)
#         self.cap = cv2.VideoCapture(self.source)

#     def send_sms(self, people):
#         now = time.time()

#         if now - self.last_sms_time < TWILIO_COOLDOWN:
#             return

#         try:
#             twilio.messages.create(
#                 body=f"🚨 HIGH CROWD ALERT\nCamera: {self.cam_id}\nPeople: {people}",
#                 from_=TWILIO_NUMBER,
#                 to=USER_MOBILE,
#             )
#             self.last_sms_time = now
#         except Exception as e:
#             print("SMS error:", e)

#     # ───────────────── PROCESS ─────────────────

#     def process(self):

#         ret, frame = self.cap.read()
#         if not ret:
#             self.reconnect()
#             return None

#         frame = cv2.convertScaleAbs(frame, alpha=1.2, beta=20)

#         h, w, _ = frame.shape
#         cell_w = w // COLS
#         cell_h = h // ROWS

#         # YOLO TRACK
#         results = model.track(
#             frame,
#             conf=0.4,
#             persist=True,
#             imgsz=960,
#             iou=0.5,
#             verbose=False
#         )

#         centers = []
#         areas = []

#         # DETECT PEOPLE
#         for box in results[0].boxes:

#             if int(box.cls[0]) != 0:
#                 continue

#             x1,y1,x2,y2 = map(int,box.xyxy[0])

#             area = (x2-x1)*(y2-y1)
#             if area < 1500:
#                 continue

#             cx = (x1+x2)//2
#             cy = (y1+y2)//2

#             centers.append((cx,cy))
#             areas.append(area)

#             cv2.rectangle(frame,(x1,y1),(x2,y2),(0,255,0),2)

#         # GRID COUNT
#         grid_counts = np.zeros((ROWS,COLS))

#         for (cx,cy) in centers:
#             col = min(cx//cell_w, COLS-1)
#             row = min(cy//cell_h, ROWS-1)
#             grid_counts[row][col]+=1

#         overlay = frame.copy()
#         local_alert = False

#         # HEATMAP DENSITY
#         for i in range(ROWS):
#             for j in range(COLS):

#                 cell_area = cell_w * cell_h

#                 if len(areas) > 0:
#                     avg_area = np.median(areas)
#                     perspective = 1 + (i / ROWS) * 1.5

#                     cell_capacity = cell_area / (avg_area * 2.0 * perspective)
#                     cell_capacity = max(cell_capacity, MIN_PEOPLE)
#                 else:
#                     cell_capacity = float('inf')

#                 people = grid_counts[i][j]
#                 ratio = people / cell_capacity

#                 # HEATMAP COLOR
#                 if ratio < 0.4:
#                     color = (0,255,0)      # GREEN
#                 elif ratio < 0.75:
#                     color = (0,255,255)    # YELLOW
#                 else:
#                     color = (0,0,255)      # RED
#                     local_alert = True

#                 x1 = j * cell_w
#                 y1 = i * cell_h
#                 x2 = x1 + cell_w
#                 y2 = y1 + cell_h

#                 # filled heatmap
#                 cv2.rectangle(overlay,(x1,y1),(x2,y2),color,-1)

#                 # people count per cell
#                 cv2.putText(
#                     frame,
#                     str(int(people)),
#                     (x1+5,y1+20),
#                     cv2.FONT_HERSHEY_SIMPLEX,
#                     0.5,
#                     (255,255,255),
#                     1
#                 )

#         # APPLY HEATMAP
#         alpha = 0.35
#         frame = cv2.addWeighted(overlay, alpha, frame, 1-alpha, 0)

#         # DRAW GRID
#         for i in range(1,ROWS):
#             cv2.line(frame,(0,i*cell_h),(w,i*cell_h),(255,255,255),1)

#         for j in range(1,COLS):
#             cv2.line(frame,(j*cell_w,0),(j*cell_w,h),(255,255,255),1)

#         # SMOOTH COUNT
#         current_count=len(centers)
#         self.smooth_count = COUNT_SMOOTH*self.smooth_count + (1-COUNT_SMOOTH)*current_count
#         people=int(round(self.smooth_count))

#         # ALERT
#         density = "LOW"
#         color = (0,255,0)

#         if local_alert:
#             density = "HIGH"
#             color = (0,0,255)
#             self.send_sms(people)

#         cv2.putText(
#             frame,
#             f"{self.cam_id} | People: {people} | {density}",
#             (20,40),
#             cv2.FONT_HERSHEY_SIMPLEX,
#             0.9,
#             color,
#             2
#         )

#         # POST API
#         now=time.time()
#         if now-self.last_post_time>=POST_INTERVAL:
#             try:
#                 requests.post(
#                     API_URL,
#                     json={
#                         "camera":self.cam_id,
#                         "people":people,
#                         "density":density,
#                         "timestamp":now
#                     },
#                     timeout=0.3
#                 )
#                 self.last_post_time=now
#             except:
#                 pass

#         return frame


# # ───────────────── MAIN ─────────────────

# cameras=[CrowdCamera(cid,src) for cid,src in CAMERAS.items()]

# while True:

#     for cam in cameras:
#         frame=cam.process()

#         if frame is not None:
#             cv2.imshow(cam.cam_id,frame)

#     if cv2.waitKey(1)==27:
#         break

# for cam in cameras:
#     cam.cap.release()

# cv2.destroyAllWindows()




import cv2
import numpy as np
import time
import requests
from ultralytics import YOLO
from collections import deque

try:
    from twilio.rest import Client
    TWILIO_AVAILABLE = True
except ImportError:
    TWILIO_AVAILABLE = False

# ─────────────────────────────────────────────────────────────────
# TWILIO CONFIG  (optional – leave blank to disable SMS)
# ─────────────────────────────────────────────────────────────────
ACCOUNT_SID   = "//////////"
AUTH_TOKEN    = "/////////"
TWILIO_NUMBER = "/////////"
USER_MOBILE   = "/////////"
TWILIO_COOLDOWN = 60          # seconds between SMS alerts

# ─────────────────────────────────────────────────────────────────
# CAMERA CONFIG
# "cam1" → source 0 means primary webcam
# "cam2" → IP camera URL (DroidCam / IP Webcam)
# ─────────────────────────────────────────────────────────────────
CAMERAS = {
    "cam1": 0,
    # "cam2": "http://10.179.195.184:4747/video",
}

# ─────────────────────────────────────────────────────────────────
# DETECTION SETTINGS
# ─────────────────────────────────────────────────────────────────
API_URL       = "http://localhost:5000/api/live-stats"
POST_INTERVAL = 0.5          # seconds between backend posts

MODEL_PATH    = "yolov8m.pt"   # better accuracy than yolov8n
CONF          = 0.4
IOU           = 0.5
IMGSZ         = 960
MIN_BOX_AREA  = 1500           # ignore tiny detections (noise)

# Grid density thresholds (matches your original script)
ROWS          = 5
COLS          = 4
THRESHOLD     = 0.75           # ratio to call a cell HIGH density
MIN_PEOPLE    = 3              # minimum people to trigger alert

# Smoothing
COUNT_SMOOTH  = 0.8            # EMA coefficient for people count

# ─────────────────────────────────────────────────────────────────
# LOAD MODEL
# ─────────────────────────────────────────────────────────────────
model  = YOLO(MODEL_PATH)
twilio = Client(ACCOUNT_SID, AUTH_TOKEN) if TWILIO_AVAILABLE else None


# ─────────────────────────────────────────────────────────────────
# CAMERA CLASS
# ─────────────────────────────────────────────────────────────────
class CrowdCamera:

    def __init__(self, cam_id: str, source):
        self.cam_id  = cam_id
        self.source  = source
        self.cap     = cv2.VideoCapture(source)
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        self.smooth_count: float  = 0.0
        self.last_sms_time: float = 0.0
        self.last_post_time: float = 0.0
        self.high_start: float | None = None

    def reconnect(self):
        print(f"[{self.cam_id}] reconnecting…")
        self.cap.release()
        time.sleep(0.5)
        self.cap = cv2.VideoCapture(self.source)
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    # ── Twilio SMS ─────────────────────────────────────────────────
    def _send_sms(self, people: int, density: str):
        if not twilio:
            return
        now = time.time()
        if now - self.last_sms_time < TWILIO_COOLDOWN:
            return
        try:
            twilio.messages.create(
                body=(
                    f"🚨 HIGH CROWD ALERT\n"
                    f"Camera  : {self.cam_id}\n"
                    f"People  : {people}\n"
                    f"Density : {density}\n"
                    f"Time    : {time.strftime('%H:%M:%S')}"
                ),
                from_=TWILIO_NUMBER,
                to=USER_MOBILE,
            )
            self.last_sms_time = now
            print(f"[{self.cam_id}] SMS sent.")
        except Exception as e:
            print(f"[{self.cam_id}] Twilio error: {e}")

    # ── Main processing ────────────────────────────────────────────
    def process(self):
        ret, frame = self.cap.read()
        if not ret:
            self.reconnect()
            return None

        h, w, _ = frame.shape
        cell_w   = w // COLS
        cell_h   = h // ROWS

        # ── Fix backlight (from your original script) ──────────────
        frame = cv2.convertScaleAbs(frame, alpha=1.2, beta=20)

        # ── YOLO tracking (persist=True keeps IDs stable) ──────────
        results = model.track(
            frame,
            conf=CONF,
            persist=True,
            imgsz=IMGSZ,
            iou=IOU,
            verbose=False,
        )

        centers, areas = [], []

        # ── STEP 1: Collect detections ─────────────────────────────
        for box in results[0].boxes:
            if int(box.cls[0]) != 0:     # class 0 = person
                continue
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            area = (x2 - x1) * (y2 - y1)
            if area < MIN_BOX_AREA:
                continue
            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
            centers.append((cx, cy))
            areas.append(area)
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)

        # ── STEP 2: Build grid ─────────────────────────────────────
        grid_counts = np.zeros((ROWS, COLS))
        for cx, cy in centers:
            col = min(cx // cell_w, COLS - 1)
            row = min(cy // cell_h, ROWS - 1)
            grid_counts[row][col] += 1

        # ── STEP 3: Grid density → overall density level ───────────
        local_alert = False
        max_ratio   = 0.0

        for i in range(ROWS):
            for j in range(COLS):
                cell_area = cell_w * cell_h

                if areas:
                    avg_area    = float(np.median(areas))
                    perspective = 1 + (i / ROWS) * 1.5
                    capacity    = cell_area / (avg_area * 2.0 * perspective)
                    capacity    = max(capacity, MIN_PEOPLE)
                else:
                    capacity = float("inf")

                people = grid_counts[i][j]
                ratio  = people / capacity if capacity != float("inf") else 0.0
                max_ratio = max(max_ratio, ratio)

                if people >= MIN_PEOPLE and ratio > THRESHOLD:
                    local_alert = True
                    cv2.rectangle(frame,
                        (j*cell_w, i*cell_h),
                        (j*cell_w + cell_w, i*cell_h + cell_h),
                        (0, 0, 255), 3)
                    cv2.putText(frame, f"{ratio:.2f}",
                        (j*cell_w + 10, i*cell_h + 25),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

        # ── Draw grid lines ────────────────────────────────────────
        for i in range(1, ROWS):
            cv2.line(frame, (0, i*cell_h), (w, i*cell_h), (255, 255, 255), 1)
        for j in range(1, COLS):
            cv2.line(frame, (j*cell_w, 0), (j*cell_w, h), (255, 255, 255), 1)

        # ── Alert overlay ──────────────────────────────────────────
        if local_alert:
            cv2.putText(frame, "ALERT!", (20, 50),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 3)

        # ── Smooth count ───────────────────────────────────────────
        current_count       = len(centers)
        self.smooth_count   = (COUNT_SMOOTH * self.smooth_count
                               + (1 - COUNT_SMOOTH) * current_count)
        display_count = int(round(self.smooth_count))

        cv2.putText(frame, f"People: {display_count}",
            (20, h - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

        # ── Map grid density to LOW / MEDIUM / HIGH ────────────────
        # HIGH  → any cell has ratio > THRESHOLD and MIN_PEOPLE
        # MEDIUM → overall count is meaningful but no cell is HIGH
        # LOW   → everything else
        total_people = display_count
        if local_alert:
            density = "HIGH"
        elif total_people >= MIN_PEOPLE:
            density = "MEDIUM"
        else:
            density = "LOW"

        density_ratio = min(max_ratio, 1.0)

        # ── Capacity = sum of all cell capacities (approx) ─────────
        if areas:
            avg_area = float(np.median(areas))
            total_capacity = int(sum(
                max((cell_w * cell_h) / (avg_area * 2.0 * (1 + (i / ROWS) * 1.5)), MIN_PEOPLE)
                for i in range(ROWS) for _ in range(COLS)
            ))
        else:
            total_capacity = ROWS * COLS * MIN_PEOPLE

        # ── SMS on sustained HIGH density ──────────────────────────
        if density == "HIGH":
            if self.high_start is None:
                self.high_start = time.time()
            elif time.time() - self.high_start >= 5:
                self._send_sms(display_count, density)
                self.high_start = None
        else:
            self.high_start = None

        # ── POST to backend (throttled) ────────────────────────────
        now = time.time()
        if now - self.last_post_time >= POST_INTERVAL:
            try:
                requests.post(
                    API_URL,
                    json={
                        "camera":       self.cam_id,
                        "people":       display_count,
                        "capacity":     total_capacity,
                        "density":      density,
                        "densityRatio": round(density_ratio, 4),
                        "timestamp":    now,
                    },
                    timeout=0.3,
                )
                self.last_post_time = now
            except Exception:
                pass

        return frame


# ─────────────────────────────────────────────────────────────────
# MAIN LOOP
# ─────────────────────────────────────────────────────────────────
cameras = [CrowdCamera(cam_id, src) for cam_id, src in CAMERAS.items()]

print("Starting crowd detector. Press ESC to quit.")

while True:
    for cam in cameras:
        frame = cam.process()
        if frame is not None:
            cv2.imshow(cam.cam_id, frame)

    if cv2.waitKey(1) == 27:   # ESC
        break

for cam in cameras:
    cam.cap.release()

cv2.destroyAllWindows()