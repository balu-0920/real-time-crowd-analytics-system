




import { useEffect, useState } from "react";

const BASE = "http://localhost:5000";

export default function History({ selectedCam, cameras = [] }) {
  const [data,      setData]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [filterCam, setFilterCam] = useState(selectedCam || "");
  const [filterLoc, setFilterLoc] = useState("");
  const [locations, setLocations] = useState([]);

  // Sync camera filter when parent changes selected camera
  useEffect(() => { setFilterCam(selectedCam || ""); }, [selectedCam]);

  // Load campus locations for the dropdown
  useEffect(() => {
    fetch(`${BASE}/api/locations`)
      .then((r) => r.json())
      .then(setLocations)
      .catch(() => {});
  }, []);

  // Fetch summary whenever filters change
  useEffect(() => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (filterCam) params.set("camera",   filterCam);
    if (filterLoc) params.set("location", filterLoc);
    const qs = params.toString();

    fetch(`${BASE}/api/daily-summary${qs ? "?" + qs : ""}`)
      .then((r) => { if (!r.ok) throw new Error(`Server error: ${r.status}`); return r.json(); })
      .then((json) => { setData(json); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [filterCam, filterLoc]);

  return (
    <div className="history-container">
      <div className="history-header">
        <h2 className="section-title">📅 Daily History</h2>

        <div className="history-filter" style={{ gap: 12 }}>
          {/* Camera filter */}
          <label className="form-label" htmlFor="hist-cam-select">Camera</label>
          <select
            id="hist-cam-select"
            className="form-input"
            style={{ width: "auto", minWidth: 130 }}
            value={filterCam}
            onChange={(e) => setFilterCam(e.target.value)}
          >
            <option value="">All cameras</option>
            {cameras.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Location filter */}
          <label className="form-label" htmlFor="hist-loc-select">Location</label>
          <select
            id="hist-loc-select"
            className="form-input"
            style={{ width: "auto", minWidth: 160 }}
            value={filterLoc}
            onChange={(e) => setFilterLoc(e.target.value)}
          >
            <option value="">All locations</option>
            {locations.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      {loading && <p className="loading-text">Loading history…</p>}
      {error   && <p className="table-error">⚠️ {error}</p>}

      {!loading && !error && data.length === 0 && (
        <p className="table-empty">
          No history data yet{filterCam ? ` for ${filterCam}` : ""}{filterLoc ? ` @ ${filterLoc}` : ""}.
          Start the crowd detector to begin recording.
        </p>
      )}

      {!loading && !error && data.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Camera</th>
                <th>Max People</th>
                <th>Avg People</th>
                <th>Avg Capacity</th>
                <th>Records</th>
                <th>HIGH Alerts</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={`${d.date}-${d.camera}-${i}`}>
                  <td>{d.date}</td>
                  <td>
                    <span className="cam-pill">{d.camera}</span>
                  </td>
                  <td>{d.maxPeople}</td>
                  <td>{d.avgPeople}</td>
                  {/* avgCapacity is computed from live YOLO data — never a hardcoded value */}
                  <td style={{ color: "#475569", fontVariantNumeric: "tabular-nums" }}>
                    {d.avgCapacity ?? "—"}
                  </td>
                  <td>{d.totalRecords}</td>
                  <td style={{ color: d.alerts > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>
                    {d.alerts}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
