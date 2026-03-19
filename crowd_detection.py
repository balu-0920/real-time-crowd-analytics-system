import cv2
import numpy as np
from ultralytics import YOLO

# -------- Load Model --------
model = YOLO("yolov8n.pt")

# -------- Camera --------
cap = cv2.VideoCapture("http://10.179.195.184:4747/video")
if not cap.isOpened():
    cap = cv2.VideoCapture(1)
cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
# -------- Grid Settings --------
ROWS = 5
COLS = 4
THRESHOLD = 0.7

# -------- Read first frame --------
ret, frame = cap.read()
if not ret:
    exit()

h, w, _ = frame.shape

while True:
    ret, frame = cap.read()
    if not ret:
        break

    results = model(frame, conf=0.5, verbose=False)

    centers = []
    areas = []

    # -------- STEP 1: Detect People --------
    for box in results[0].boxes:
        if int(box.cls[0]) == 0:

            x1, y1, x2, y2 = map(int, box.xyxy[0])

            cx = (x1 + x2) // 2
            cy = (y1 + y2) // 2

            # NORMAL area (no scaling here)
            area = (x2 - x1) * (y2 - y1)

            areas.append(area)
            centers.append((cx, cy))

            cv2.rectangle(frame, (x1,y1),(x2,y2),(0,255,0),2)

    # -------- STEP 2: Grid Setup --------
    cell_w = w // COLS
    cell_h = h // ROWS

    grid_counts = np.zeros((ROWS, COLS))

    # -------- STEP 3: Assign people to cells --------
    for (cx, cy) in centers:
        col = min(cx // cell_w, COLS - 1)
        row = min(cy // cell_h, ROWS - 1)

        grid_counts[row][col] += 1

    local_alert = False

    # -------- STEP 4: Compute Density (scale ONLY capacity) --------
    for i in range(ROWS):
        for j in range(COLS):

            cell_area = cell_w * cell_h

            if len(areas) > 0:
                # use median for robustness
                avg_area = np.median(areas)

                # perspective scaling (ONLY for capacity)
                scale = 1 + (1 - i / ROWS)

                cell_capacity = cell_area / (avg_area * 1.5 * scale)
            else:
                cell_capacity = float('inf')  # safe fallback

            cell_people = grid_counts[i][j]

            # NO scaling of people
            cell_ratio = cell_people / cell_capacity

            # -------- ALERT --------
            if cell_ratio > THRESHOLD:
                local_alert = True

                x1 = j * cell_w
                y1 = i * cell_h
                x2 = x1 + cell_w
                y2 = y1 + cell_h

                cv2.rectangle(frame, (x1,y1),(x2,y2),(0,0,255),3)

                cv2.putText(frame, f"{cell_ratio:.2f}",
                            (x1+10, y1+25),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.6, (0,0,255), 2)

    # -------- Draw Grid --------
    for i in range(1, ROWS):
        cv2.line(frame, (0, i*cell_h), (w, i*cell_h), (255,255,255), 1)
    for j in range(1, COLS):
        cv2.line(frame, (j*cell_w, 0), (j*cell_w, h), (255,255,255), 1)

    # -------- Display Alert --------
    if local_alert:
        cv2.putText(frame, "ALERT!", (20,50),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0,0,255), 3)

    cv2.imshow("Crowd Monitor", frame)

    if cv2.waitKey(1) == 27:
        break

cap.release()
cv2.destroyAllWindows()
