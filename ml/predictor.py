"""
predictor.py
─────────────────────────────────────────────────────────────────────────────
Independent Next-Day Crowd Prediction microservice. Standalone Flask app —
does not import or depend on ai/crowd_detection.py in any way.

Routes:
    GET /predict/<camera>              -> tomorrow's prediction for one camera
    GET /predict/all                   -> predictions for every known camera
    GET /analytics/backtest/<camera>   -> historical predicted-vs-actual rows
    GET /analytics/backtest/all        -> same, for every camera
    GET /analytics/metrics             -> which model was selected + accuracy
    GET /health                        -> readiness check

The Node backend (Server.js) forwards its own /api/predictions* routes to
this service. The existing backend routes, schema, and live pipeline are
completely untouched.

Run:
    python predictor.py
"""

import os
import json
from datetime import datetime, timedelta

import joblib
import pandas as pd
import requests
from flask import Flask, jsonify
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017/crowd")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:5000")
PREDICTOR_PORT = int(os.getenv("PREDICTOR_PORT", 5002))

ML_DIR = os.path.dirname(__file__)
MODEL_PATH = os.path.join(ML_DIR, "model.joblib")
METRICS_PATH = os.path.join(ML_DIR, "metrics.json")
BACKTEST_PATH = os.path.join(ML_DIR, "backtest.csv")

app = Flask(__name__)

_bundle = None


def load_bundle():
    global _bundle
    if _bundle is None:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(
                "model.joblib not found. Run dataset_generator.py then "
                "train_model.py before starting predictor.py."
            )
        _bundle = joblib.load(MODEL_PATH)
    return _bundle


def get_db():
    client = MongoClient(MONGO_URI)
    return client.get_default_database(), client


def build_today_feature_row(camera):
    """Aggregate today's records for `camera`, preferring HourlyStat
    (cheap, pre-aggregated) and falling back to raw CrowdStat, then to the
    most recent available day, so a prediction can always be produced."""

    db, client = get_db()
    try:
        now = datetime.now()
        today_str = now.strftime("%Y-%m-%d")

        # 1. Try today's HourlyStat rows first (fast, already aggregated)
        hourly = list(db["hourlystats"].find(
            {"camera": camera, "dateStr": today_str},
            {"avgPeople": 1, "maxPeople": 1, "minPeople": 1, "avgCapacity": 1,
             "hour": 1, "totalObservations": 1, "dayOfWeek": 1, "isWeekend": 1, "_id": 0},
        ))

        if hourly:
            hdf = pd.DataFrame(hourly)
            total_obs = hdf["totalObservations"].sum() or 1
            avg_people = (hdf["avgPeople"] * hdf["totalObservations"]).sum() / total_obs
            avg_capacity = (hdf["avgCapacity"] * hdf["totalObservations"]).sum() / total_obs
            peak_row = hdf.loc[hdf["maxPeople"].idxmax()]

            return {
                "day_of_week": int(hdf["dayOfWeek"].iloc[0]),
                "month": now.month,
                "weekend": int(bool(hdf["isWeekend"].iloc[0])),
                "avg_people": float(avg_people),
                "max_people": int(hdf["maxPeople"].max()),
                "min_people": int(hdf["minPeople"].min()),
                "avg_capacity": float(avg_capacity),
                "peak_hour": int(peak_row["hour"]),
                "total_records": int(total_obs),
            }, now.date()

        # 2. Fall back to raw CrowdStat for today
        today_start = datetime(now.year, now.month, now.day)
        raw = list(db["crowdstats"].find(
            {"camera": camera, "timestamp": {"$gte": today_start}},
            {"people": 1, "capacity": 1, "timestamp": 1, "dayOfWeek": 1, "isWeekend": 1, "_id": 0},
        ))

        used_date = now.date()

        if not raw:
            # 3. Fall back to the most recent day with ANY data for this camera
            raw = list(db["crowdstats"].find(
                {"camera": camera}, {"people": 1, "capacity": 1, "timestamp": 1, "_id": 0}
            ).sort("timestamp", -1).limit(500))
            if not raw:
                return None, None
            rdf = pd.DataFrame(raw)
            rdf["timestamp"] = pd.to_datetime(rdf["timestamp"])
            used_date = rdf["timestamp"].dt.date.max()
            rdf = rdf[rdf["timestamp"].dt.date == used_date]
        else:
            rdf = pd.DataFrame(raw)
            rdf["timestamp"] = pd.to_datetime(rdf["timestamp"])

        peak_row = rdf.loc[rdf["people"].idxmax()]
        ts = pd.Timestamp(used_date)

        return {
            "day_of_week": ts.dayofweek,
            "month": ts.month,
            "weekend": int(ts.dayofweek >= 5),
            "avg_people": float(rdf["people"].mean()),
            "max_people": int(rdf["people"].max()),
            "min_people": int(rdf["people"].min()),
            "avg_capacity": float(rdf["capacity"].mean()),
            "peak_hour": int(peak_row["timestamp"].hour),
            "total_records": len(rdf),
        }, used_date

    finally:
        client.close()


def get_thresholds():
    """Reuse the EXISTING /api/thresholds route so risk classification stays
    consistent with the live dashboard's Settings tab."""
    try:
        res = requests.get(f"{BACKEND_URL}/api/thresholds", timeout=3)
        data = res.json()
        return float(data.get("LOW", 0.4)), float(data.get("MEDIUM", 0.7))
    except Exception:
        return 0.4, 0.7


def classify_risk(predicted_peak_people, avg_capacity):
    low, medium = get_thresholds()
    if not avg_capacity or avg_capacity <= 0:
        avg_capacity = 1
    ratio = predicted_peak_people / avg_capacity
    if ratio <= low:
        return "LOW"
    if ratio <= medium:
        return "MEDIUM"
    return "HIGH"


def predict_for_camera(camera):
    bundle = load_bundle()

    if camera not in bundle["known_cameras"]:
        return {"error": f"No trained data for camera '{camera}'"}, 404

    feature_row, used_date = build_today_feature_row(camera)
    if feature_row is None:
        return {"error": f"No historical data available for camera '{camera}'"}, 404

    feature_row["camera_encoded"] = bundle["encoder"].transform([camera])[0]
    X = pd.DataFrame([feature_row])[bundle["feature_cols"]]

    predicted_avg = float(bundle["avg_model"].predict(X)[0])
    predicted_peak = float(bundle["peak_model"].predict(X)[0])

    tomorrow_dow = (pd.Timestamp(used_date) + timedelta(days=1)).dayofweek
    lookup_key = f"{camera}_{tomorrow_dow}"
    predicted_peak_hour = bundle["peak_hour_lookup"].get(
        lookup_key, feature_row["peak_hour"]
    )

    risk = classify_risk(predicted_peak, feature_row["avg_capacity"])

    return {
        "camera": camera,
        "location": bundle["location_map"].get(camera),
        "predictedAveragePeople": round(max(predicted_avg, 0)),
        "predictedPeakPeople": round(max(predicted_peak, 0)),
        "predictedPeakHour": f"{int(predicted_peak_hour):02d}:00",
        "risk": risk,
        "modelUsed": {
            "average": bundle["avg_model_name"],
            "peak": bundle["peak_model_name"],
        },
    }, 200


@app.route("/predict/<camera>")
def predict_single(camera):
    result, status = predict_for_camera(camera)
    return jsonify(result), status


@app.route("/predict/all")
def predict_all():
    bundle = load_bundle()
    results = []
    for camera in bundle["known_cameras"]:
        result, status = predict_for_camera(camera)
        if status == 200:
            results.append(result)
    return jsonify(results)


@app.route("/analytics/backtest/<camera>")
def backtest_single(camera):
    if not os.path.exists(BACKTEST_PATH):
        return jsonify({"error": "No backtest data yet. Run train_model.py first."}), 404
    df = pd.read_csv(BACKTEST_PATH)
    df = df[df["camera"] == camera].sort_values("date")
    return jsonify(df.to_dict(orient="records"))


@app.route("/analytics/backtest/all")
def backtest_all():
    if not os.path.exists(BACKTEST_PATH):
        return jsonify({"error": "No backtest data yet. Run train_model.py first."}), 404
    df = pd.read_csv(BACKTEST_PATH).sort_values(["camera", "date"])
    return jsonify(df.to_dict(orient="records"))


@app.route("/analytics/metrics")
def analytics_metrics():
    if not os.path.exists(METRICS_PATH):
        return jsonify({"error": "No metrics yet. Run train_model.py first."}), 404
    with open(METRICS_PATH) as f:
        return jsonify(json.load(f))


@app.route("/health")
def health():
    try:
        load_bundle()
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"status": "error", "detail": str(e)}), 500

@app.errorhandler(Exception)
def handle_exception(e):
    import traceback
    print("❌ PREDICTION ERROR:")
    traceback.print_exc()
    return jsonify({
        "error": str(e),
        "type": type(e).__name__
    }), 500
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PREDICTOR_PORT)
