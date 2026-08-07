"""
dataset_generator.py
─────────────────────────────────────────────────────────────────────────────
Builds the training dataset for the Next-Day Crowd Prediction model.

This script is READ-ONLY with respect to the live system:
  - It only reads from the existing `crowdstats` MongoDB collection
    (the same collection the live YOLO pipeline already writes to).
  - It never writes back to that collection and never changes its schema.
  - `densityRatio` is intentionally ignored — per project requirements,
    it is not used anywhere in the ML pipeline.

Output: a CSV file (ml/dataset.csv) with one row per (camera, date),
containing aggregated "today" features and "tomorrow" targets.

Run:
    python dataset_generator.py
"""

import os
from datetime import datetime, timedelta

import pandas as pd
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017/crowd")
DATASET_PATH = os.path.join(os.path.dirname(__file__), "dataset.csv")


def fetch_raw_records():
    """Read every existing CrowdStat record (camera, people, capacity,
    density, timestamp). densityRatio is fetched but deliberately dropped
    before returning, since it must never be used for ML."""

    client = MongoClient(MONGO_URI)
    db = client.get_default_database()
    collection = db["crowdstats"]

    cursor = collection.find(
        {},
        {"camera": 1, "people": 1, "capacity": 1, "timestamp": 1, "_id": 0},
    )
    df = pd.DataFrame(list(cursor))
    client.close()

    if df.empty:
        return df

    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df["date"] = df["timestamp"].dt.date
    return df


def aggregate_per_camera_per_day(df):
    """Collapse raw per-detection rows into one aggregated row per
    (camera, date), matching the feature set required by the spec."""

    rows = []

    for (camera, date), group in df.groupby(["camera", "date"]):
        group = group.sort_values("timestamp")

        peak_row = group.loc[group["people"].idxmax()]

        rows.append({
            "date": date,
            "camera": camera,
            "day_of_week": pd.Timestamp(date).dayofweek,   # Monday=0 ... Sunday=6
            "month": pd.Timestamp(date).month,
            "weekend": int(pd.Timestamp(date).dayofweek >= 5),
            "avg_people": group["people"].mean(),
            "max_people": group["people"].max(),
            "min_people": group["people"].min(),
            "avg_capacity": group["capacity"].mean(),
            "peak_hour": int(peak_row["timestamp"].hour),
            "total_records": len(group),
        })

    return pd.DataFrame(rows).sort_values(["camera", "date"]).reset_index(drop=True)


def add_next_day_targets(daily_df):
    """For each camera, shift avg_people/max_people back by one day so every
    row also carries the ACTUAL next day's values as prediction targets.
    The final day per camera (no known "next day" yet) is dropped."""

    daily_df = daily_df.copy()
    daily_df["next_day_avg_people"] = (
        daily_df.groupby("camera")["avg_people"].shift(-1)
    )
    daily_df["next_day_peak_people"] = (
        daily_df.groupby("camera")["max_people"].shift(-1)
    )

    # Rows with no next-day data yet (the most recent day per camera)
    # can't be used for supervised training.
    daily_df = daily_df.dropna(
        subset=["next_day_avg_people", "next_day_peak_people"]
    ).reset_index(drop=True)

    return daily_df


def generate_dataset():
    """Main entry point: fetch → aggregate → attach targets → save CSV."""

    raw = fetch_raw_records()

    if raw.empty:
        print("⚠️  No records found in MongoDB yet — nothing to generate.")
        return None

    daily = aggregate_per_camera_per_day(raw)
    dataset = add_next_day_targets(daily)

    if dataset.empty:
        print(
            "⚠️  Not enough historical days per camera yet "
            "(need at least 2 distinct days per camera). "
            "Keep the live system running and re-run this script later."
        )
        return None

    dataset.to_csv(DATASET_PATH, index=False)
    print(f"✅ Dataset generated: {DATASET_PATH} ({len(dataset)} rows)")
    return dataset


if __name__ == "__main__":
    generate_dataset()