




import cv2
import numpy as np
import time
import requests
from ultralytics import YOLO
from collections import deque
from twilio.rest import Client


# ---------------- TWILIO ----------------
ACCOUNT_SID   = ""
AUTH_TOKEN    = ""
TWILIO_NUMBER = ""
USER_MOBILE   = ""
# ---------------- CAMERAS ----------------
CAMERAS = {
    "cam1": 0,
    #"cam2": "http://10.22.226.213:4747/video",
}


# ---------------- API ----------------
API_URL = "https://real-time-crowd-analytics-system.onrender.com/api/live-stats"
THRESHOLDS_URL = "https://real-time-crowd-analytics-system.onrender.com/api/thresholds"

POST_INTERVAL = 0.5
TWILIO_COOLDOWN = 60
SMOOTHING_WINDOW = 10


# ---------------- MODEL ----------------
model  = YOLO("yolov8n.pt")
twilio = Client(ACCOUNT_SID, AUTH_TOKEN)

thresholds = {"LOW":0.4,"MEDIUM":0.7}


def fetch_thresholds():
    try:
        r = requests.get(THRESHOLDS_URL, timeout=1)
        return r.json()
    except:
        return thresholds


# -------- REMOVE DUPLICATES --------
def suppress_duplicates(boxes, iou_threshold=0.4):

    if len(boxes) == 0:
        return []

    boxes = np.array(boxes)

    x1 = boxes[:,0]
    y1 = boxes[:,1]
    x2 = boxes[:,2]
    y2 = boxes[:,3]

    areas = (x2-x1)*(y2-y1)
    order = areas.argsort()[::-1]

    keep = []

    while order.size > 0:

        i = order[0]
        keep.append(i)

        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])

        w = np.maximum(0, xx2-xx1)
        h = np.maximum(0, yy2-yy1)

        inter = w*h
        iou = inter / (areas[i] + areas[order[1:]] - inter)

        inds = np.where(iou < iou_threshold)[0]
        order = order[inds + 1]

    return boxes[keep]


# ---------------- CAMERA CLASS ----------------
class CrowdCamera:

    def __init__(self, cam_id, source):

        self.cam_id = cam_id
        self.source = source
        self.cap = cv2.VideoCapture(source)

        self.tracked = []
        self.max_miss = 12
        self.match_dist = 100

        self.people_buffer = deque(maxlen=SMOOTHING_WINDOW)

        self.smooth_area = None
        self.last_post_time = 0

        self.high_density_start = None
        self.last_sms_time = 0


    def reconnect(self):
        self.cap.release()
        time.sleep(0.5)
        self.cap = cv2.VideoCapture(self.source)


    def _send_sms(self, people, density):

        now = time.time()

        if now - self.last_sms_time < TWILIO_COOLDOWN:
            return

        try:
            twilio.messages.create(
                body=f"🚨 HIGH CROWD ALERT\nCamera:{self.cam_id}\nPeople:{people}\nDensity:{density}",
                from_=TWILIO_NUMBER,
                to=USER_MOBILE
            )

            self.last_sms_time = now

        except Exception as e:
            print("Twilio error:", e)


    # -------- TRACKER --------
    def update_tracker(self, centers):

        updated = []

        for c in centers:

            matched = False

            for t in self.tracked:

                dist = np.linalg.norm(np.array(c)-np.array(t[0]))

                if dist < self.match_dist:

                    t[0] = (
                        int(0.7*t[0][0] + 0.3*c[0]),
                        int(0.7*t[0][1] + 0.3*c[1])
                    )

                    t[1] = 0
                    updated.append(t)
                    matched = True
                    break

            if not matched:
                updated.append([c,0])

        for t in self.tracked:

            if t not in updated:
                t[1]+=1

                if t[1] < self.max_miss:
                    updated.append(t)

        self.tracked = updated


    # -------- PROCESS --------
    def process(self, thresholds_cfg):

        ret, frame = self.cap.read()
        if not ret:
            self.reconnect()
            return None

        h, w, _ = frame.shape

        results = model(frame, conf=0.4, imgsz=640, verbose=False)

        boxes = []
        areas = []

        for box in results[0].boxes:

            if int(box.cls[0]) != 0:
                continue

            x1,y1,x2,y2 = map(int,box.xyxy[0])
            area = (x2-x1)*(y2-y1)

            if area < 800:
                continue

            boxes.append([x1,y1,x2,y2])

        boxes = suppress_duplicates(boxes)

        centers = []

        for b in boxes:

            x1,y1,x2,y2 = b

            cx=(x1+x2)//2
            cy=(y1+y2)//2

            centers.append((cx,cy))
            areas.append((x2-x1)*(y2-y1))

            cv2.rectangle(frame,(x1,y1),(x2,y2),(0,255,0),2)

        # tracker
        self.update_tracker(centers)

        active_tracks = [t for t in self.tracked if t[1] <= 1]
        stable_centers = [t[0] for t in active_tracks]

        # adaptive grid
        if areas:

            avg = np.median(areas)

            if self.smooth_area is None:
                self.smooth_area = avg
            else:
                self.smooth_area = 0.9*self.smooth_area + 0.1*avg

            size = int(np.sqrt(self.smooth_area))

            cell_w = int(size*1.2)
            cell_h = int(size*1.2)

        else:
            cell_w=w//3
            cell_h=h//3

        cols=max(1,w//cell_w)
        rows=max(1,h//cell_h)

        grid=np.zeros((rows,cols))

        for cx,cy in stable_centers:

            col=min(cx//cell_w,cols-1)
            row=min(cy//cell_h,rows-1)

            grid[row][col]+=1

        max_people=int(np.max(grid)) if stable_centers else 0

        # draw grid
        for i in range(1,rows):
            cv2.line(frame,(0,i*cell_h),(w,i*cell_h),(255,255,255),1)

        for j in range(1,cols):
            cv2.line(frame,(j*cell_w,0),(j*cell_w,h),(255,255,255),1)

        # people count
        people=len(stable_centers)
        self.people_buffer.append(people)
        people=int(round(sum(self.people_buffer)/len(self.people_buffer)))

        # density
        if max_people<=1:
            density="LOW"
        elif max_people==2:
            density="MEDIUM"
        else:
            density="HIGH"

        # SMS
        if density == "HIGH":
            if self.high_density_start is None:
                self.high_density_start = time.time()
            elif time.time() - self.high_density_start >= 5:
                self._send_sms(people, density)
                self.high_density_start = None
        else:
            self.high_density_start = None

        # POST to backend
        now=time.time()
        if now-self.last_post_time>=POST_INTERVAL:
            try:
                requests.post(
    API_URL,
    json={
        "camera": self.cam_id,
        "people": people,
        "capacity": max_people,
        "density": density,
        "densityRatio": max_people,
        "timestamp": now,
        "location": {
            "x": 0.5,
            "y": 0.5
        }
    },
)
                self.last_post_time=now
            except:
                pass

        # UI
        color=(0,255,0)
        if density=="MEDIUM": color=(0,165,255)
        if density=="HIGH": color=(0,0,255)

        cv2.putText(
            frame,
            f"{self.cam_id} | People: {people} | {density}",
            (20,40),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            color,
            2
        )

        return frame


# ---------------- MAIN ----------------
thresholds = fetch_thresholds()
cameras = [CrowdCamera(cid,src) for cid,src in CAMERAS.items()]

while True:

    thresholds = fetch_thresholds()

    for cam in cameras:

        frame = cam.process(thresholds)

        if frame is not None:
            cv2.imshow(cam.cam_id,frame)

    if cv2.waitKey(1)==27:
        break

cv2.destroyAllWindows()






