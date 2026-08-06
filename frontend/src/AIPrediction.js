import React, { useEffect, useState, useCallback } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const BASE = "http://localhost:5000";
const RISK_COLORS = { LOW: "#16a34a", MEDIUM: "#d97706", HIGH: "#dc2626" };
const PALETTE = ["#2563eb", "#7c3aed", "#db2777", "#059669", "#d97706", "#dc2626", "#0284c7"];

/**
 * AIPrediction — "AI Prediction" dashboard page.
 *
 * Mirrors the visual language of Analytics.js (same CSS classes: subnav-btn,
 * analytics-chart-card, comp-cards-grid, comp-entity-card, etc.) so it feels
 * like a native part of the same dashboard rather than a bolted-on page.
 *
 * Talks only to the purely additive /api/predictions* routes, which forward
 * to the independent ml/predictor.py service — nothing here touches any
 * existing route, schema, or live-monitoring component.
 */
export default function AIPrediction({ cameras = [] }) {
  const [subTab, setSubTab] = useState("tomorrow"); // "tomorrow" | "accuracy" | "model"

  const [predictions, setPredictions] = useState([]);
  const [predLoading, setPredLoading] = useState(true);
  const [predError, setPredError] = useState("");

  const [backtestCam, setBacktestCam] = useState("");
  const [backtestData, setBacktestData] = useState([]);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestError, setBacktestError] = useState("");

  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState("");

  // ── Tomorrow's predictions ────────────────────────────────────────────
  const fetchPredictions = useCallback(async () => {
    setPredLoading(true);
    setPredError("");
    try {
      const res = await fetch(`${BASE}/api/predictions`);
      const data = await res.json();
      if (!res.ok) {
        setPredError(data.error || "Failed to load predictions.");
        setPredictions([]);
      } else {
        setPredictions(Array.isArray(data) ? data : []);
        if (!backtestCam && Array.isArray(data) && data.length) {
          setBacktestCam(data[0].camera);
        }
      }
    } catch {
      setPredError("Cannot reach the prediction service. Is it running?");
      setPredictions([]);
    } finally {
      setPredLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Accuracy / backtest history for one camera ────────────────────────
  const fetchBacktest = useCallback(async (camera) => {
    if (!camera) return;
    setBacktestLoading(true);
    setBacktestError("");
    try {
      const res = await fetch(
        `${BASE}/api/predictions/analytics/backtest/${encodeURIComponent(camera)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setBacktestError(data.error || "Failed to load accuracy history.");
        setBacktestData([]);
      } else {
        setBacktestData(Array.isArray(data) ? data : []);
      }
    } catch {
      setBacktestError("Cannot reach the prediction service. Is it running?");
      setBacktestData([]);
    } finally {
      setBacktestLoading(false);
    }
  }, []);

  // ── Model selection / accuracy metrics ────────────────────────────────
  const fetchMetrics = useCallback(async () => {
    setMetricsLoading(true);
    setMetricsError("");
    try {
      const res = await fetch(`${BASE}/api/predictions/analytics/metrics`);
      const data = await res.json();
      if (!res.ok) {
        setMetricsError(data.error || "Failed to load model metrics.");
        setMetrics(null);
      } else {
        setMetrics(data);
      }
    } catch {
      setMetricsError("Cannot reach the prediction service. Is it running?");
      setMetrics(null);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPredictions();
  }, [fetchPredictions]);

  useEffect(() => {
    if (subTab === "accuracy" && backtestCam) fetchBacktest(backtestCam);
    if (subTab === "model" && !metrics) fetchMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, backtestCam]);

  const chartData = predictions.map((p) => ({
    camera: p.camera,
    "Predicted Average": p.predictedAveragePeople,
    "Predicted Peak": p.predictedPeakPeople,
  }));

  const avgMAE = backtestData.length
    ? (
        backtestData.reduce((s, r) => s + Math.abs(r.avg_error), 0) / backtestData.length
      ).toFixed(2)
    : null;
  const peakMAE = backtestData.length
    ? (
        backtestData.reduce((s, r) => s + Math.abs(r.peak_error), 0) / backtestData.length
      ).toFixed(2)
    : null;

  return (
    <div className="analytics-container">
      {/* ── Header bar (mirrors Analytics.js filter-card style) ──────────── */}
      <div className="analytics-filter-card">
        <div className="filter-card-header">
          <div>
            <h2 className="section-title">🔮 AI Prediction — Tomorrow's Crowd</h2>
            <div className="perf-badge-row" style={{ display: "flex", gap: "8px", marginTop: "4px", alignItems: "center" }}>
              <span
                style={{
                  padding: "3px 10px",
                  borderRadius: "999px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  background: "#7c3aed22",
                  color: "#7c3aed",
                  border: "1px solid #7c3aed44",
                }}
              >
                ⚡ ML-Powered Forecast
              </span>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                Predicts next-day average/peak crowd per camera from historical patterns
              </span>
            </div>
          </div>
          <button className="refresh-btn" onClick={fetchPredictions} disabled={predLoading}>
            {predLoading ? "🔄 Loading…" : "🔄 Refresh"}
          </button>
        </div>
      </div>

      {/* ── Sub-Tab Navigation ─────────────────────────────────────────── */}
      <div className="analytics-subnav">
        <button
          className={`subnav-btn ${subTab === "tomorrow" ? "active" : ""}`}
          onClick={() => setSubTab("tomorrow")}
        >
          📅 Tomorrow's Forecast
        </button>
        <button
          className={`subnav-btn ${subTab === "accuracy" ? "active" : ""}`}
          onClick={() => setSubTab("accuracy")}
        >
          🎯 Accuracy &amp; Trends
        </button>
        <button
          className={`subnav-btn ${subTab === "model" ? "active" : ""}`}
          onClick={() => setSubTab("model")}
        >
          🧠 Model Info
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────── */}
      {/* SUB-TAB 1: TOMORROW'S FORECAST                                  */}
      {/* ─────────────────────────────────────────────────────────────── */}
      {subTab === "tomorrow" && (
        <>
          {predLoading && <div className="loading-state">⏳ Generating predictions…</div>}
          {predError && <div className="table-error">⚠️ {predError}</div>}

          {!predLoading && !predError && predictions.length === 0 && (
            <div className="table-error">
              No predictions available yet. In the <code>ml/</code> folder, run{" "}
              <code>dataset_generator.py</code> then <code>train_model.py</code>, and make sure{" "}
              <code>predictor.py</code> is running.
            </div>
          )}

          {!predLoading && predictions.length > 0 && (
            <>
              <div className="comp-cards-grid">
                {predictions.map((p) => (
                  <div className="comp-entity-card" key={p.camera}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="cam-pill">{p.camera}</span>
                      <span
                        style={{
                          padding: "2px 10px",
                          borderRadius: 999,
                          fontSize: "0.72rem",
                          fontWeight: 800,
                          color: "#fff",
                          background: RISK_COLORS[p.risk] || "#6b7280",
                        }}
                      >
                        {p.risk} RISK
                      </span>
                    </div>
                    {p.location && (
                      <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 4 }}>
                        📍 {p.location}
                      </div>
                    )}
                    <div style={{ marginTop: 10, fontSize: "1.4rem", fontWeight: 800 }}>
                      {p.predictedAveragePeople}
                      <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b" }}> avg</span>
                      {"  /  "}
                      {p.predictedPeakPeople}
                      <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b" }}> peak</span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#475569", marginTop: 6 }}>
                      ⏰ Predicted peak hour: <strong>{p.predictedPeakHour}</strong>
                    </div>
                  </div>
                ))}
              </div>

              <div className="analytics-chart-card" style={{ marginTop: 20 }}>
                <div className="chart-card-header">
                  <div>
                    <h3 className="chart-card-title">📊 Predicted Crowd by Camera</h3>
                    <p className="chart-card-sub">Average vs. peak forecast for tomorrow</p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="camera" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                    <Legend />
                    <Bar dataKey="Predicted Average" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Predicted Peak" fill="#dc2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </>
      )}

      {/* ─────────────────────────────────────────────────────────────── */}
      {/* SUB-TAB 2: ACCURACY & TRENDS (backtest: predicted vs. actual)   */}
      {/* ─────────────────────────────────────────────────────────────── */}
      {subTab === "accuracy" && (
        <>
          <div className="filter-controls-grid" style={{ marginBottom: 16 }}>
            <div className="filter-group">
              <label className="form-label">Camera</label>
              <select
                className="form-input"
                value={backtestCam}
                onChange={(e) => setBacktestCam(e.target.value)}
              >
                {(cameras.length ? cameras : predictions.map((p) => p.camera)).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {backtestLoading && <div className="loading-state">⏳ Loading accuracy history…</div>}
          {backtestError && <div className="table-error">⚠️ {backtestError}</div>}

          {!backtestLoading && !backtestError && backtestData.length === 0 && (
            <div className="table-error">
              No accuracy history yet for this camera — run <code>train_model.py</code> in{" "}
              <code>ml/</code> to generate backtest data.
            </div>
          )}

          {!backtestLoading && backtestData.length > 0 && (
            <>
              <div className="comp-cards-grid" style={{ marginBottom: 20 }}>
                <div className="comp-entity-card">
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Historical Days Backtested</span>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800 }}>{backtestData.length}</div>
                </div>
                <div className="comp-entity-card">
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Avg. People — Mean Error</span>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#2563eb" }}>±{avgMAE}</div>
                </div>
                <div className="comp-entity-card">
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Peak People — Mean Error</span>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#dc2626" }}>±{peakMAE}</div>
                </div>
              </div>

              <div className="analytics-chart-card">
                <div className="chart-card-header">
                  <div>
                    <h3 className="chart-card-title">📈 Predicted vs. Actual — Average People</h3>
                    <p className="chart-card-sub">
                      For each historical day, what the model would have predicted for the
                      following day, vs. what actually happened
                    </p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={backtestData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                    <Legend />
                    <Line type="monotone" dataKey="next_day_avg_people" name="Actual" stroke="#059669" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="predicted_next_day_avg_people" name="Predicted" stroke="#2563eb" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="analytics-chart-card" style={{ marginTop: 20 }}>
                <div className="chart-card-header">
                  <div>
                    <h3 className="chart-card-title">📈 Predicted vs. Actual — Peak People</h3>
                    <p className="chart-card-sub">Same comparison, for the daily peak crowd count</p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={backtestData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                    <Legend />
                    <Line type="monotone" dataKey="next_day_peak_people" name="Actual" stroke="#d97706" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="predicted_next_day_peak_people" name="Predicted" stroke="#dc2626" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </>
      )}

      {/* ─────────────────────────────────────────────────────────────── */}
      {/* SUB-TAB 3: MODEL INFO (which algorithm won, and why)            */}
      {/* ─────────────────────────────────────────────────────────────── */}
      {subTab === "model" && (
        <>
          {metricsLoading && <div className="loading-state">⏳ Loading model info…</div>}
          {metricsError && <div className="table-error">⚠️ {metricsError}</div>}

          {!metricsLoading && metrics && (
            <>
              <div className="comp-cards-grid" style={{ marginBottom: 20 }}>
                <div className="comp-entity-card">
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Training Rows Used</span>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800 }}>{metrics.dataset_rows}</div>
                </div>
                <div className="comp-entity-card">
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Last Trained</span>
                  <div style={{ fontSize: "1rem", fontWeight: 700 }}>
                    {metrics.trained_at ? new Date(metrics.trained_at).toLocaleString() : "—"}
                  </div>
                </div>
              </div>

              {["average_people_model", "peak_people_model"].map((key) => {
                const m = metrics[key];
                if (!m) return null;
                const title = key === "average_people_model" ? "Next-Day Average People" : "Next-Day Peak People";
                const candidateData = Object.entries(m.cv_mae_by_candidate || {}).map(([name, mae]) => ({
                  name, "CV MAE": mae,
                }));
                return (
                  <div className="analytics-chart-card" key={key} style={{ marginBottom: 20 }}>
                    <div className="chart-card-header">
                      <div>
                        <h3 className="chart-card-title">🧠 {title}</h3>
                        <p className="chart-card-sub">
                          Selected model: <strong>{m.selected}</strong> — chosen automatically by
                          lowest cross-validated error among all candidates
                        </p>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
                      <div style={{ fontSize: "0.85rem" }}>
                        Test MAE: <strong>{m.test_metrics?.MAE}</strong>
                      </div>
                      <div style={{ fontSize: "0.85rem" }}>
                        Test RMSE: <strong>{m.test_metrics?.RMSE}</strong>
                      </div>
                      <div style={{ fontSize: "0.85rem" }}>
                        Test R²: <strong>{m.test_metrics?.R2}</strong>
                      </div>
                    </div>

                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={candidateData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                        <Bar dataKey="CV MAE" radius={[4, 4, 0, 0]}>
                          {candidateData.map((entry, idx) => (
                            <Cell
                              key={entry.name}
                              fill={entry.name === m.selected ? "#7c3aed" : PALETTE[idx % PALETTE.length]}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <p style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: 6 }}>
                      Lower is better — this is mean absolute error, cross-validated on training
                      data, for every candidate model that competed for this target.
                    </p>
                  </div>
                );
              })}
            </>
          )}
        </>
      )}
    </div>
  );
}
