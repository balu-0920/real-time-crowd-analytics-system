import cv2
import numpy as np
from ultralytics import YOLO
import requests
import time

model = YOLO("yolov8n.pt")

cap = cv2.VideoCapture(0)
if not cap.isOpened():
    cap = cv2.VideoCapture(1)

LOW_DENSITY = 0.4
MEDIUM_DENSITY = 0.7

API_URL = "http://localhost:5000/api/live-stats"

while True:
    ret, frame = cap.read()
    if not ret:
        break

    h, w, _ = frame.shape
    camera_area = h * w

    results = model(frame, conf=0.5, verbose=False)

    people = 0
    areas = []

    for box in results[0].boxes:
        if int(box.cls[0]) == 0:
            people += 1
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            areas.append((x2 - x1) * (y2 - y1))
            cv2.rectangle(frame, (x1,y1),(x2,y2),(0,255,0),2)

    capacity = int(camera_area / np.mean(areas)) if areas else 0
    ratio = people / capacity if capacity else 0

    if ratio < LOW_DENSITY:
        density = "LOW"
        color = (0,255,0)
    elif ratio < MEDIUM_DENSITY:
        density = "MEDIUM"
        color = (0,255,255)
    else:
        density = "HIGH"
        color = (0,0,255)

    cv2.putText(frame,f"People: {people}",(20,40),
                cv2.FONT_HERSHEY_SIMPLEX,1,color,2)

    try:
        requests.post(API_URL, json={
            "people": people,
            "capacity": capacity,
            "density": density,
            "densityRatio": ratio,
            "timestamp": time.time()
        }, timeout=0.1)
    except:
        pass

    cv2.imshow("Crowd Monitor", frame)

    if cv2.waitKey(1) == 27:
        break

cap.release()
cv2.destroyAllWindows()
