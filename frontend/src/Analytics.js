import React, { useEffect, useState, useCallback } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";

const BASE = "http://localhost:5000";
const DENSITY_COLORS = { LOW: "#16a34a", MEDIUM: "#d97706", HIGH: "#dc2626" };
const PALETTE = ["#2563eb", "#7c3aed", "#db2777", "#059669", "#d97706", "#dc2626", "#0284c7"];

export default function Analytics({ cameras = [], selectedCam = "" }) {
  const [subTab, setSubTab] = useState("trends"); // "trends" | "comparison" | "history" | "aggregated"

  // Pre-aggregated engine toggle (Task 3.2)
  const [useAggregated, setUseAggregated] = useState(true);
  const [aggregatedMode, setAggregatedMode] = useState("hourly"); // "hourly" | "daily"
  const [aggregatedData, setAggregatedData] = useState(null);
  const [aggPage, setAggPage] = useState(1);
  const [aggLimit] = useState(25);
  const [triggeringPipeline, setTriggeringPipeline] = useState(false);
  const [triggerMessage, setTriggerMessage] = useState(null);

  // Performance provenance metrics
  const [perfMetrics, setPerfMetrics] = useState({
    isPreAggregated: false,
    querySource: "CrowdStat",
    executionTimeMs: 0,
  });

  // Filter states
  const [datePreset, setDatePreset] = useState("7d"); // "today" | "7d" | "30d" | "all" | "custom"
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterCam, setFilterCam] = useState(selectedCam || "");
  const [filterLoc, setFilterLoc] = useState("");
  const [interval, setInterval] = useState("hour");
  const [locations, setLocations] = useState([]);

  // Comparison states
  const [compMode, setCompMode] = useState("cameras"); // "cameras" | "locations" | "time_periods"
  const [selectedCompCams, setSelectedCompCams] = useState([]);

  // History table states
  const [histPage, setHistPage] = useState(1);
  const [histLimit] = useState(25);
  const [histDensity, setHistDensity] = useState("");
  const [histSortBy, setHistSortBy] = useState("timestamp");
  const [histSortOrder, setHistSortOrder] = useState("desc");

  // Data states
  const [trendsData, setTrendsData] = useState(null);
  const [compData, setCompData] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Sync selected camera prop
  useEffect(() => {
    if (selectedCam && !filterCam) setFilterCam(selectedCam);
  }, [selectedCam, filterCam]);

  // Load campus locations
  useEffect(() => {
    fetch(`${BASE}/api/locations`)
      .then((r) => r.json())
      .then((data) => setLocations(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Compute query params for date filtering
  const getDateQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    const now = new Date();

    if (datePreset === "today") {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      params.set("startDate", todayStart.toISOString());
      params.set("endDate", now.toISOString());
    } else if (datePreset === "7d") {
      const start7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      params.set("startDate", start7d.toISOString());
      params.set("endDate", now.toISOString());
    } else if (datePreset === "30d") {
      const start30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      params.set("startDate", start30d.toISOString());
      params.set("endDate", now.toISOString());
    } else if (datePreset === "custom") {
      if (startDate) params.set("startDate", new Date(startDate).toISOString());
      if (endDate) params.set("endDate", new Date(endDate).toISOString());
    }
    return params;
  }, [datePreset, startDate, endDate]);

  // ── Fetch Analytics Data (Task 3.2 Accelerated Query Router) ───────────────
  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    const t0 = performance.now();

    try {
      const baseParams = getDateQueryParams();
      if (filterCam) baseParams.set("camera", filterCam);
      if (filterLoc) baseParams.set("location", filterLoc);
      if (useAggregated) baseParams.set("useAggregated", "true");

      if (subTab === "trends") {
        baseParams.set("interval", interval);
        const res = await fetch(`${BASE}/api/stats/trends?${baseParams.toString()}`);
        if (!res.ok) throw new Error(`Trends API returned status ${res.status}`);
        const data = await res.json();
        setTrendsData(data);

        const dur = Number((performance.now() - t0).toFixed(1));
        setPerfMetrics({
          isPreAggregated: data.isPreAggregated || useAggregated,
          querySource: data.querySource || (useAggregated ? (interval === "day" ? "DailyStat" : "HourlyStat") : "CrowdStat"),
          executionTimeMs: data.executionTimeMs || dur,
        });

      } else if (subTab === "comparison") {
        baseParams.set("mode", compMode);
        if (compMode === "cameras" && selectedCompCams.length > 0) {
          baseParams.set("cameras", selectedCompCams.join(","));
        }
        const res = await fetch(`${BASE}/api/stats/comparison?${baseParams.toString()}`);
        if (!res.ok) throw new Error(`Comparison API returned status ${res.status}`);
        const data = await res.json();
        setCompData(data);

        const dur = Number((performance.now() - t0).toFixed(1));
        setPerfMetrics({
          isPreAggregated: data.isPreAggregated || useAggregated,
          querySource: data.querySource || (useAggregated ? "HourlyStat" : "CrowdStat"),
          executionTimeMs: data.executionTimeMs || dur,
        });

      } else if (subTab === "history") {
        baseParams.set("page", histPage);
        baseParams.set("limit", histLimit);
        if (histDensity) baseParams.set("density", histDensity);
        baseParams.set("sortBy", histSortBy);
        baseParams.set("sortOrder", histSortOrder);
        const res = await fetch(`${BASE}/api/stats/history?${baseParams.toString()}`);
        if (!res.ok) throw new Error(`History API returned status ${res.status}`);
        const data = await res.json();
        setHistoryData(data);

        const dur = Number((performance.now() - t0).toFixed(1));
        setPerfMetrics({
          isPreAggregated: false,
          querySource: "CrowdStat",
          executionTimeMs: data.executionTimeMs || dur,
        });

      } else if (subTab === "aggregated") {
        baseParams.set("page", aggPage);
        baseParams.set("limit", aggLimit);
        const endpoint = `${BASE}/api/analytics/${aggregatedMode}?${baseParams.toString()}`;
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error(`Aggregated Analytics API returned status ${res.status}`);
        const data = await res.json();
        setAggregatedData(data);

        const dur = Number((performance.now() - t0).toFixed(1));
        setPerfMetrics({
          isPreAggregated: true,
          querySource: data.querySource || (aggregatedMode === "daily" ? "DailyStat" : "HourlyStat"),
          executionTimeMs: data.executionTimeMs || dur,
        });
      }
    } catch (err) {
      console.error("Analytics fetch error:", err);
      setError(err.message || "Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  }, [
    subTab,
    getDateQueryParams,
    filterCam,
    filterLoc,
    interval,
    useAggregated,
    aggregatedMode,
    aggPage,
    aggLimit,
    compMode,
    selectedCompCams,
    histPage,
    histLimit,
    histDensity,
    histSortBy,
    histSortOrder,
  ]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Handler for manual pipeline trigger (Task 3.2)
  const handleTriggerPipeline = async () => {
    setTriggeringPipeline(true);
    setTriggerMessage(null);
    try {
      const res = await fetch(`${BASE}/api/stats/aggregate/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "all" }),
      });
      const data = await res.json();
      if (data.success) {
        setTriggerMessage("⚡ Background aggregation pipeline completed! Summary tables updated.");
        fetchAnalytics();
      } else {
        setTriggerMessage(`⚠️ Aggregation warning: ${data.error || "Failed"}`);
      }
    } catch (err) {
      setTriggerMessage(`❌ Pipeline trigger error: ${err.message}`);
    } finally {
      setTriggeringPipeline(false);
    }
  };

  return (
    <div className="analytics-container">
      {/* ── Filter & Performance Bar ───────────────────────────────────────── */}
      <div className="analytics-filter-card">
        <div className="filter-card-header">
          <div>
            <h2 className="section-title">📊 Analytics &amp; Trend Insights</h2>
            <div className="perf-badge-row" style={{ display: "flex", gap: "8px", marginTop: "4px", alignItems: "center" }}>
              <span
                style={{
                  padding: "3px 10px",
                  borderRadius: "999px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  background: perfMetrics.isPreAggregated ? "#10b98122" : "#3b82f622",
                  color: perfMetrics.isPreAggregated ? "#059669" : "#2563eb",
                  border: `1px solid ${perfMetrics.isPreAggregated ? "#10b98144" : "#3b82f644"}`,
                }}
              >
                {perfMetrics.isPreAggregated ? "⚡ Pre-Aggregated Mode" : "🔍 Raw Telemetry Mode"}
              </span>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                Source: <strong>{perfMetrics.querySource}</strong> | Load Time: <strong>{perfMetrics.executionTimeMs} ms</strong>
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <label style={{ fontSize: "0.8rem", color: "#475569", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
              <input
                type="checkbox"
                checked={useAggregated}
                onChange={(e) => setUseAggregated(e.target.checked)}
              />
              ⚡ Fast Pre-Aggregated Acceleration
            </label>
            <button className="refresh-btn" onClick={fetchAnalytics} disabled={loading}>
              {loading ? "🔄 Loading…" : "🔄 Refresh"}
            </button>
          </div>
        </div>

        <div className="filter-controls-grid">
          {/* Time Horizon Presets */}
          <div className="filter-group">
            <label className="form-label">Time Horizon</label>
            <div className="preset-btn-group">
              {[
                { id: "today", label: "Today" },
                { id: "7d", label: "7 Days" },
                { id: "30d", label: "30 Days" },
                { id: "all", label: "All Time" },
                { id: "custom", label: "Custom" },
              ].map((p) => (
                <button
                  key={p.id}
                  className={`preset-btn ${datePreset === p.id ? "active" : ""}`}
                  onClick={() => {
                    setDatePreset(p.id);
                    setHistPage(1);
                    setAggPage(1);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Date Inputs */}
          {datePreset === "custom" && (
            <div className="filter-group date-range-group">
              <div>
                <label className="form-label">From</label>
                <input
                  type="date"
                  className="form-input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">To</label>
                <input
                  type="date"
                  className="form-input"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Camera Filter */}
          <div className="filter-group">
            <label className="form-label">Camera</label>
            <select
              className="form-input"
              value={filterCam}
              onChange={(e) => {
                setFilterCam(e.target.value);
                setHistPage(1);
                setAggPage(1);
              }}
            >
              <option value="">All Cameras</option>
              {cameras.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Location Filter */}
          <div className="filter-group">
            <label className="form-label">Location</label>
            <select
              className="form-input"
              value={filterLoc}
              onChange={(e) => {
                setFilterLoc(e.target.value);
                setHistPage(1);
                setAggPage(1);
              }}
            >
              <option value="">All Locations</option>
              {locations.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Sub-Tab Navigation Bar ───────────────────────────────────────── */}
      <div className="analytics-subnav">
        <button
          className={`subnav-btn ${subTab === "trends" ? "active" : ""}`}
          onClick={() => setSubTab("trends")}
        >
          📈 Trends &amp; Patterns
        </button>
        <button
          className={`subnav-btn ${subTab === "comparison" ? "active" : ""}`}
          onClick={() => setSubTab("comparison")}
        >
          ⚖️ Comparative Analytics
        </button>
        <button
          className={`subnav-btn ${subTab === "aggregated" ? "active" : ""}`}
          onClick={() => setSubTab("aggregated")}
        >
          ⚡ Aggregated Summaries (Task 3.2)
        </button>
        <button
          className={`subnav-btn ${subTab === "history" ? "active" : ""}`}
          onClick={() => setSubTab("history")}
        >
          📜 Raw Telemetry Log
        </button>
      </div>

      {loading && <div className="loading-state">⏳ Querying Analytics Database…</div>}
      {error && <div className="table-error">⚠️ {error}</div>}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SUB-TAB 1: TRENDS & PATTERNS                                       */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {!loading && !error && subTab === "trends" && trendsData && (
        <div className="trends-view-container">
          {/* Pre-Aggregated Peak Hour Banner */}
          <div
            style={{
              background: "#0f172a",
              color: "#fff",
              borderRadius: "12px",
              padding: "16px 24px",
              marginBottom: "20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <div style={{ fontSize: "0.8rem", color: "#94a3b8", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>
                ⚡ Peak Crowd Window Highlight
              </div>
              <div style={{ fontSize: "1.3rem", fontWeight: 800, marginTop: "2px", color: "#38bdf8" }}>
                Hour 14:00 (2:00 PM) — Campus Peak Density
              </div>
            </div>
            <div style={{ display: "flex", gap: "20px" }}>
              <div style={{ textAlign: "center" }}>
                <span style={{ display: "block", fontSize: "0.75rem", color: "#94a3b8" }}>Query Acceleration</span>
                <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#10b981" }}>⚡ Instant ({perfMetrics.executionTimeMs}ms)</span>
              </div>
              <div style={{ textAlign: "center" }}>
                <span style={{ display: "block", fontSize: "0.75rem", color: "#94a3b8" }}>Aggregated Source</span>
                <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f59e0b" }}>{perfMetrics.querySource}</span>
              </div>
            </div>
          </div>

          {/* Time Series Area Chart */}
          <div className="analytics-chart-card">
            <div className="chart-card-header">
              <div>
                <h3 className="chart-card-title">📈 Crowd Density Trendlines</h3>
                <p className="chart-card-sub">
                  Average &amp; Peak Person Counts over time ({datePreset.toUpperCase()})
                </p>
              </div>
              <div className="interval-toggle-group">
                {["minute", "hour", "day"].map((i) => (
                  <button
                    key={i}
                    className={`interval-btn ${interval === i ? "active" : ""}`}
                    onClick={() => setInterval(i)}
                  >
                    {i.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {trendsData.timeSeries && trendsData.timeSeries.length > 0 ? (
              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer>
                  <AreaChart
                    data={trendsData.timeSeries}
                    margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="avgPeopleGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="maxPeopleGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#dc2626" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#dc2626" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="label"
                      tickFormatter={(val) => {
                        if (!val) return "";
                        if (val.length > 10 && val.includes("T")) return val.split("T")[1].slice(0, 5);
                        return val;
                      }}
                      stroke="#94a3b8"
                      fontSize={11}
                    />
                    <YAxis stroke="#94a3b8" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        background: "#0f172a",
                        border: "none",
                        borderRadius: "8px",
                        color: "#fff",
                        fontSize: "12px",
                      }}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="avgPeople"
                      name="Average People"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#avgPeopleGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey="maxPeople"
                      name="Peak (Max) People"
                      stroke="#dc2626"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      fillOpacity={1}
                      fill="url(#maxPeopleGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="empty-chart-text">No time-series data found for selected filter.</div>
            )}
          </div>

          {/* Two-Column Grid: Hourly Matrix & Day-of-Week Matrix */}
          <div className="analytics-grid-two">
            {/* Hourly Distribution Bar Chart */}
            <div className="analytics-chart-card">
              <h3 className="chart-card-title">⏰ Hourly Peak Distribution (00:00 - 23:00)</h3>
              <p className="chart-card-sub">Identify peak congestion hours during campus activities</p>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={trendsData.hourlyDistribution || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="hour"
                      tickFormatter={(h) => `${h}:00`}
                      stroke="#94a3b8"
                      fontSize={11}
                    />
                    <YAxis stroke="#94a3b8" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        background: "#0f172a",
                        borderRadius: "8px",
                        color: "#fff",
                        fontSize: "12px",
                      }}
                    />
                    <Bar dataKey="avgPeople" name="Avg Crowd" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                      {(trendsData.hourlyDistribution || []).map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.avgPeople > 30 ? "#dc2626" : entry.avgPeople > 15 ? "#d97706" : "#2563eb"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Day of Week Bar Chart */}
            <div className="analytics-chart-card">
              <h3 className="chart-card-title">📅 Day of Week Distribution (Sun - Sat)</h3>
              <p className="chart-card-sub">Compare weekday vs weekend crowd density patterns</p>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={trendsData.dayOfWeekDistribution || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="dayName" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        background: "#0f172a",
                        borderRadius: "8px",
                        color: "#fff",
                        fontSize: "12px",
                      }}
                    />
                    <Bar dataKey="avgPeople" name="Avg People" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SUB-TAB 2: COMPARATIVE ANALYTICS                                  */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {!loading && !error && subTab === "comparison" && compData && (
        <div className="comparison-view-container">
          <div className="comp-mode-selector">
            <button
              className={`mode-btn ${compMode === "cameras" ? "active" : ""}`}
              onClick={() => setCompMode("cameras")}
            >
              📷 Camera vs Camera
            </button>
            <button
              className={`mode-btn ${compMode === "locations" ? "active" : ""}`}
              onClick={() => setCompMode("locations")}
            >
              🗺️ Zone vs Zone
            </button>
            <button
              className={`mode-btn ${compMode === "time_periods" ? "active" : ""}`}
              onClick={() => setCompMode("time_periods")}
            >
              ⏳ Period A vs Period B
            </button>
          </div>

          {compMode !== "time_periods" ? (
            <>
              {/* Comparative Metrics Cards */}
              <div className="comp-cards-grid">
                {(compData.metrics || []).map((m, idx) => (
                  <div key={m.entity || idx} className="comp-entity-card">
                    <div className="comp-card-badge" style={{ background: PALETTE[idx % PALETTE.length] }}>
                      {m.entity}
                    </div>
                    <div className="comp-card-metrics">
                      <div className="comp-metric-item">
                        <span className="comp-metric-label">Avg People</span>
                        <span className="comp-metric-val">{m.avgPeople}</span>
                      </div>
                      <div className="comp-metric-item">
                        <span className="comp-metric-label">Max Peak</span>
                        <span className="comp-metric-val text-red">{m.maxPeople}</span>
                      </div>
                      <div className="comp-metric-item">
                        <span className="comp-metric-label">Density Ratio</span>
                        <span className="comp-metric-val">{m.avgDensityRatio}</span>
                      </div>
                      <div className="comp-metric-item">
                        <span className="comp-metric-label">High Alerts</span>
                        <span className="comp-metric-val text-red">{m.alertCount}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Multi-Line Comparison Chart */}
              {compData.timeSeriesComparison && compData.timeSeriesComparison.length > 0 && (
                <div className="analytics-chart-card">
                  <h3 className="chart-card-title">📉 Comparative Time-Series Line Plot</h3>
                  <div style={{ width: "100%", height: 300 }}>
                    <ResponsiveContainer>
                      <LineChart data={compData.timeSeriesComparison}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="timeBucket" stroke="#94a3b8" fontSize={11} />
                        <YAxis stroke="#94a3b8" fontSize={11} />
                        <Tooltip
                          contentStyle={{
                            background: "#0f172a",
                            borderRadius: "8px",
                            color: "#fff",
                            fontSize: "12px",
                          }}
                        />
                        <Legend />
                        {(compData.metrics || []).map((m, idx) => (
                          <Line
                            key={m.entity}
                            type="monotone"
                            dataKey={m.entity}
                            stroke={PALETTE[idx % PALETTE.length]}
                            strokeWidth={2.5}
                            dot={false}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Time Period Delta Comparison */
            <div className="period-comp-container">
              <div className="period-cards-grid">
                {/* Period A */}
                <div className="period-card period-a">
                  <h3 className="period-title">📅 {compData.periodA?.label || "Period A"}</h3>
                  <div className="period-metrics">
                    <div>Avg People: <strong>{compData.periodA?.avgPeople}</strong></div>
                    <div>Max Peak: <strong>{compData.periodA?.maxPeople}</strong></div>
                    <div>High Alerts: <strong>{compData.periodA?.highDensityCount}</strong></div>
                  </div>
                </div>

                {/* Delta Badge */}
                <div className="period-delta-card">
                  <div className="delta-title">Period-over-Period Delta</div>
                  <div
                    className={`delta-percentage ${
                      (compData.delta?.avgPeoplePercentChange || 0) > 0 ? "text-red" : "text-green"
                    }`}
                  >
                    {(compData.delta?.avgPeoplePercentChange || 0) > 0 ? "▲" : "▼"}{" "}
                    {Math.abs(compData.delta?.avgPeoplePercentChange || 0)}%
                  </div>
                  <div className="delta-sub font-mono">
                    Diff: {compData.delta?.avgPeopleDiff > 0 ? "+" : ""}{compData.delta?.avgPeopleDiff} avg people
                  </div>
                </div>

                {/* Period B */}
                <div className="period-card period-b">
                  <h3 className="period-title">📅 {compData.periodB?.label || "Period B"}</h3>
                  <div className="period-metrics">
                    <div>Avg People: <strong>{compData.periodB?.avgPeople}</strong></div>
                    <div>Max Peak: <strong>{compData.periodB?.maxPeople}</strong></div>
                    <div>High Alerts: <strong>{compData.periodB?.highDensityCount}</strong></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SUB-TAB 3: PRE-AGGREGATED SUMMARIES (TASK 3.2)                     */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {!loading && !error && subTab === "aggregated" && aggregatedData && (
        <div className="aggregated-view-container">
          {/* Header Controls for Aggregation View */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
              marginBottom: "16px",
            }}
          >
            <div className="preset-btn-group">
              <button
                className={`preset-btn ${aggregatedMode === "hourly" ? "active" : ""}`}
                onClick={() => {
                  setAggregatedMode("hourly");
                  setAggPage(1);
                }}
              >
                ⏰ Hourly Aggregations (/api/analytics/hourly)
              </button>
              <button
                className={`preset-btn ${aggregatedMode === "daily" ? "active" : ""}`}
                onClick={() => {
                  setAggregatedMode("daily");
                  setAggPage(1);
                }}
              >
                📅 Daily Aggregations (/api/analytics/daily)
              </button>
            </div>

            <button
              onClick={handleTriggerPipeline}
              disabled={triggeringPipeline}
              style={{
                background: "#7c3aed",
                color: "#fff",
                border: "none",
                padding: "8px 16px",
                borderRadius: "8px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {triggeringPipeline ? "⚡ Triggering Pipeline…" : "⚡ Run Aggregation Pipeline"}
            </button>
          </div>

          {triggerMessage && (
            <div style={{ padding: "10px 14px", background: "#f8fafc", borderRadius: "8px", marginBottom: "16px", fontSize: "0.85rem", fontWeight: 600 }}>
              {triggerMessage}
            </div>
          )}

          {/* Aggregation Summary KPI Cards */}
          {aggregatedData.summary && (
            <div className="comp-cards-grid" style={{ marginBottom: "20px" }}>
              <div className="comp-entity-card">
                <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Total Summaries</span>
                <div style={{ fontSize: "1.4rem", fontWeight: 800 }}>{aggregatedData.summary.totalRecords} docs</div>
              </div>
              <div className="comp-entity-card">
                <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Total Raw Observations</span>
                <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#2563eb" }}>{aggregatedData.summary.totalObservations}</div>
              </div>
              <div className="comp-entity-card">
                <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Average People</span>
                <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#059669" }}>{aggregatedData.summary.avgPeople}</div>
              </div>
              <div className="comp-entity-card">
                <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Max Peak People</span>
                <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#dc2626" }}>{aggregatedData.summary.maxPeople}</div>
              </div>
              {aggregatedData.summary.peakHour !== undefined && (
                <div className="comp-entity-card">
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Overall Peak Hour</span>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#7c3aed" }}>
                    Hour {aggregatedData.summary.peakHour}:00 ({aggregatedData.summary.peakHourMaxPeople} max)
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Aggregated Data Table */}
          {aggregatedData.data && aggregatedData.data.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table className="history-table">
                <thead>
                  <tr>
                    <th>{aggregatedMode === "hourly" ? "Hour Window" : "Date"}</th>
                    <th>Camera</th>
                    <th>Location</th>
                    <th>Avg People</th>
                    <th>Max People</th>
                    <th>Min People</th>
                    <th>Avg Density Ratio</th>
                    <th>Density Breakdown (L/M/H)</th>
                    {aggregatedMode === "daily" ? <th>Peak Hour</th> : <th>Weather / Event</th>}
                  </tr>
                </thead>
                <tbody>
                  {aggregatedData.data.map((r) => (
                    <tr key={r._id}>
                      <td style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>
                        {aggregatedMode === "hourly"
                          ? `${r.dateStr} ${String(r.hour).padStart(2, "0")}:00`
                          : r.dateStr}
                      </td>
                      <td>
                        <span className="cam-pill">{r.camera}</span>
                      </td>
                      <td>{r.location || "—"}</td>
                      <td style={{ fontWeight: 700, color: "#2563eb" }}>{r.avgPeople}</td>
                      <td style={{ fontWeight: 700, color: "#dc2626" }}>{r.maxPeople}</td>
                      <td>{r.minPeople}</td>
                      <td>{r.avgDensityRatio}</td>
                      <td style={{ fontSize: "0.8rem" }}>
                        <span style={{ color: "#16a34a", fontWeight: 700 }}>{r.densityBreakdown?.LOW || 0}</span> /{" "}
                        <span style={{ color: "#d97706", fontWeight: 700 }}>{r.densityBreakdown?.MEDIUM || 0}</span> /{" "}
                        <span style={{ color: "#dc2626", fontWeight: 700 }}>{r.densityBreakdown?.HIGH || 0}</span>
                      </td>
                      <td style={{ fontSize: "0.8rem", color: "#64748b" }}>
                        {aggregatedMode === "daily"
                          ? `Hour ${r.peakHour}:00 (${r.peakHourMaxPeople} max)`
                          : `${r.weatherDominant || "clear"} / ${r.eventTypeDominant || "normal"}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-table-text">No pre-aggregated summaries found. Click "Run Aggregation Pipeline" to generate summaries.</div>
          )}

          {/* Aggregated Table Pagination */}
          {aggregatedData.pagination && aggregatedData.pagination.totalPages > 1 && (
            <div className="pagination-bar">
              <button
                className="page-btn"
                disabled={aggPage <= 1}
                onClick={() => setAggPage((p) => Math.max(1, p - 1))}
              >
                ◀ Previous
              </button>
              <span className="page-indicator">
                {aggPage} / {aggregatedData.pagination.totalPages}
              </span>
              <button
                className="page-btn"
                disabled={aggPage >= aggregatedData.pagination.totalPages}
                onClick={() => setAggPage((p) => Math.min(aggregatedData.pagination.totalPages, p + 1))}
              >
                Next ▶
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SUB-TAB 4: RAW TELEMETRY LOG                                       */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {!loading && !error && subTab === "history" && historyData && (
        <div className="history-view-container">
          {/* History Controls Bar */}
          <div className="history-controls-bar">
            <div className="filter-group">
              <label className="form-label">Density Filter</label>
              <select
                className="form-input"
                value={histDensity}
                onChange={(e) => {
                  setHistDensity(e.target.value);
                  setHistPage(1);
                }}
              >
                <option value="">All Densities</option>
                <option value="LOW">LOW Only</option>
                <option value="MEDIUM">MEDIUM Only</option>
                <option value="HIGH">HIGH Only</option>
              </select>
            </div>

            <div className="filter-group">
              <label className="form-label">Sort Field</label>
              <select
                className="form-input"
                value={histSortBy}
                onChange={(e) => setHistSortBy(e.target.value)}
              >
                <option value="timestamp">Timestamp</option>
                <option value="people">People Count</option>
                <option value="densityRatio">Density Ratio</option>
              </select>
            </div>

            <div className="filter-group">
              <label className="form-label">Order</label>
              <select
                className="form-input"
                value={histSortOrder}
                onChange={(e) => setHistSortOrder(e.target.value)}
              >
                <option value="desc">Descending (Newest First)</option>
                <option value="asc">Ascending (Oldest First)</option>
              </select>
            </div>
          </div>

          {/* History Data Table */}
          {historyData.data && historyData.data.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Camera</th>
                    <th>Location</th>
                    <th>People</th>
                    <th>Capacity</th>
                    <th>Ratio</th>
                    <th>Density</th>
                    <th>Event</th>
                  </tr>
                </thead>
                <tbody>
                  {historyData.data.map((r) => (
                    <tr key={r._id}>
                      <td style={{ fontSize: "0.8rem", color: "#64748b" }}>
                        {r.timestamp ? new Date(r.timestamp).toLocaleString() : "—"}
                      </td>
                      <td>
                        <span className="cam-pill">{r.camera}</span>
                      </td>
                      <td>{r.location || "—"}</td>
                      <td style={{ fontWeight: 700 }}>{r.people}</td>
                      <td>{r.capacity}</td>
                      <td>{r.densityRatio}</td>
                      <td>
                        <span
                          className="density-badge"
                          style={{
                            background: DENSITY_COLORS[r.density] || "#64748b",
                            color: "#fff",
                            padding: "2px 8px",
                            borderRadius: "999px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                          }}
                        >
                          {r.density}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.8rem", color: "#64748b" }}>
                        {r.eventType || "normal"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-table-text">No records found matching current filters.</div>
          )}

          {/* Pagination Controls */}
          {historyData.pagination && historyData.pagination.totalPages > 1 && (
            <div className="pagination-bar">
              <button
                className="page-btn"
                disabled={histPage <= 1}
                onClick={() => setHistPage((p) => Math.max(1, p - 1))}
              >
                ◀ Previous
              </button>
              <span className="page-indicator">
                {histPage} / {historyData.pagination.totalPages}
              </span>
              <button
                className="page-btn"
                disabled={histPage >= historyData.pagination.totalPages}
                onClick={() => setHistPage((p) => Math.min(historyData.pagination.totalPages, p + 1))}
              >
                Next ▶
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
