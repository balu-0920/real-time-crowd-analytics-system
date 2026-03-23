

import { useEffect, useState, useCallback, useRef } from "react";
import { io } from "socket.io-client";
import {
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import History from "./History";
import Settings from "./Settings";
import CrowdHeatmap from "./Crowdheatmap";
import "./App.css";

const socket = io("http://localhost:5000");

const DENSITY_COLORS = { LOW: "#16a34a", MEDIUM: "#d97706", HIGH: "#dc2626" };

const camDataStore = {};

function getCamData(camId) {
  if (!camDataStore[camId]) {
    camDataStore[camId] = { latest: null, chart: [] };
  }
  return camDataStore[camId];
}

function CameraSelector({ cameras, selected, onSelect, liveStates }) {
  if (!cameras.length) {
    return (
      <div className="cam-selector-empty">
        No cameras detected yet. Start the Python detector.
      </div>
    );
  }
  return (
    <div className="cam-selector">
      {cameras.map((cam) => {
        const state   = liveStates[cam];
        const density = state?.density || null;
        return (
          <button
            key={cam}
            className={`cam-btn ${selected === cam ? "active" : ""} ${
              density ? `density-${density.toLowerCase()}` : ""
            }`}
            onClick={() => onSelect(cam)}
          >
            <span className="cam-btn-icon">📷</span>
            <span className="cam-btn-id">{cam}</span>
            {density && (
              <span
                className="cam-btn-badge"
                style={{ background: DENSITY_COLORS[density] }}
              >
                {density}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function App() {
  const [view,       setView]       = useState("live");
  const [connected,  setConnected]  = useState(false);
  const [cameras,    setCameras]    = useState([]);
  const [selectedCam, setSelectedCam] = useState(null);
  const [liveStates, setLiveStates] = useState({});
  const [displayLatest,   setDisplayLatest]   = useState(null);
  const [displayChart,    setDisplayChart]    = useState([]);
  const [alerts, setAlerts] = useState([]);
  const alertTimers = useRef({});

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    fetch("http://localhost:5000/api/cameras")
      .then((r) => r.json())
      .then((list) => {
        setCameras(list);
        if (list.length && !selectedCam) setSelectedCam(list[0]);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissAlert = useCallback((id) => {
    clearTimeout(alertTimers.current[id]);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  useEffect(() => {
    socket.on("connect",    () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("live", (data) => {
      const cam = data.camera || "default";

      setLiveStates((prev) => ({ ...prev, [cam]: data }));

      setCameras((prev) =>
        prev.includes(cam) ? prev : [...prev, cam]
      );

      const store = getCamData(cam);
      store.latest = data;
      store.chart  = [
        ...store.chart.slice(-30),
        {
          time:   new Date().toLocaleTimeString([], {
            hour: "2-digit", minute: "2-digit", second: "2-digit",
          }),
          people: data.people,
        },
      ];

      setSelectedCam((selCam) => {
        if (selCam === cam || (!selCam && cam)) {
          setDisplayLatest(data);
          setDisplayChart([...store.chart]);
        }
        return selCam;
      });
    });

    socket.on("alert", ({ camera, message }) => {
      const id = `${camera}-${Date.now()}`;

      setAlerts((prev) => [...prev.slice(-4), { id, camera, message }]);

      if (Notification.permission === "granted") {
        new Notification("🚨 Crowd Alert", { body: message });
      }

      alertTimers.current[id] = setTimeout(() => {
        setAlerts((prev) => prev.filter((a) => a.id !== id));
      }, 8000);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("live");
      socket.off("alert");
      Object.values(alertTimers.current).forEach(clearTimeout);
    };
  }, []);

  const handleSelectCam = useCallback((cam) => {
    setSelectedCam(cam);
    const store = getCamData(cam);
    setDisplayLatest(store.latest);
    setDisplayChart([...store.chart]);
  }, []);

  const liveData     = displayLatest || {};
  const densityColor = DENSITY_COLORS[liveData.density] || "#6b7280";

  return (
    <div className="app-container">
      <header className="app-header">
        <h1 className="app-title">🚦 Crowd Monitoring Dashboard</h1>
        <span className={`connection-badge ${connected ? "online" : "offline"}`}>
          {connected ? "● Live" : "○ Disconnected"}
        </span>
      </header>

      <nav className="nav-tabs">
        {["live", "history", "settings"].map((tab) => (
          <button
            key={tab}
            className={`nav-tab ${view === tab ? "active" : ""}`}
            onClick={() => setView(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      {alerts.length > 0 && (
        <div className="alert-stack">
          {alerts.map((a) => (
            <div key={a.id} className="alert-banner" role="alert">
              <span>{a.message}</span>
              <button
                className="alert-close"
                onClick={() => dismissAlert(a.id)}
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {view === "live" && (
        <div className="view-content">

          <div className="cam-selector-row">
            <span className="cam-selector-label">Camera</span>
            <CameraSelector
              cameras={cameras}
              selected={selectedCam}
              onSelect={handleSelectCam}
              liveStates={liveStates}
            />
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">People Detected</span>
              <span className="stat-value">{liveData.people ?? "—"}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Estimated Capacity</span>
              <span className="stat-value">{liveData.capacity ?? "—"}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Density Level</span>
              <span className="stat-value" style={{ color: densityColor }}>
                {liveData.density ?? "—"}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Density Ratio</span>
              <span className="stat-value">
                {liveData.densityRatio != null
                  ? (liveData.densityRatio * 100).toFixed(1) + "%"
                  : "—"}
              </span>
            </div>
          </div>

          <div className="charts-row">
            <div className="chart-section">
              <h2 className="section-title">
                Live Crowd Count
                {selectedCam && (
                  <span className="section-badge">{selectedCam}</span>
                )}
              </h2>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart
                  data={displayChart}
                  margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="people"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-section heatmap-section">
              <h2 className="section-title">
                Density Heatmap
                <span className="section-badge">Spatial</span>
              </h2>
              {/* key="heatmap" — do NOT reset on camera switch so all zones persist */}
              <CrowdHeatmap
                key="heatmap"
                latestStat={displayLatest}
                cameraId={selectedCam}
                liveStates={liveStates}
              />
            </div>
          </div>
        </div>
      )}

      {view === "history"  && <History selectedCam={selectedCam} cameras={cameras} />}
      {view === "settings" && <Settings />}
    </div>
  );
}