// // // import { useState } from "react";

// // // function Settings() {
// // //   const [low, setLow] = useState(0.4);
// // //   const [medium, setMedium] = useState(0.7);

// // //   const save = () => {
// // //     fetch("http://localhost:5000/api/thresholds", {
// // //       method: "POST",
// // //       headers: { "Content-Type": "application/json" },
// // //       body: JSON.stringify({ LOW: low, MEDIUM: medium })
// // //     });
// // //     alert("Thresholds Updated");
// // //   };

// // //   return (
// // //     <div style={{ padding: 30 }}>
// // //       <h1>⚙ Threshold Settings</h1>

// // //       <label>Low Density</label>
// // //       <input value={low} onChange={e => setLow(e.target.value)} />

// // //       <label>Medium Density</label>
// // //       <input value={medium} onChange={e => setMedium(e.target.value)} />

// // //       <button onClick={save}>Save</button>
// // //     </div>
// // //   );
// // // }

// // // export default Settings;













// // import { useState, useEffect } from "react";

// // function Settings() {
// //   const [low, setLow] = useState(0.4);
// //   const [medium, setMedium] = useState(0.7);

// //   useEffect(() => {
// //     fetch("http://localhost:5000/api/settings")
// //       .then(res => res.json())
// //       .then(data => {
// //         setLow(data.low);
// //         setMedium(data.medium);
// //       });
// //   }, []);

// //   const save = async () => {
// //     await fetch("http://localhost:5000/api/settings", {
// //       method: "POST",
// //       headers: { "Content-Type": "application/json" },
// //       body: JSON.stringify({ low, medium })
// //     });

// //     alert("Thresholds Updated");
// //   };

// //   return (
// //     <div style={{ padding: 30 }}>
// //       <h1>⚙ Threshold Settings</h1>

// //       <label>Low Density</label><br />
// //       <input
// //         type="number"
// //         step="0.1"
// //         value={low}
// //         onChange={e => setLow(Number(e.target.value))}
// //       />

// //       <br /><br />

// //       <label>Medium Density</label><br />
// //       <input
// //         type="number"
// //         step="0.1"
// //         value={medium}
// //         onChange={e => setMedium(Number(e.target.value))}
// //       />

// //       <br /><br />

// //       <button onClick={save}>Save</button>
// //     </div>
// //   );
// // }

// // export default Settings;


// import { useState, useEffect } from "react";

// function Settings() {
//   const [low, setLow] = useState("");
//   const [medium, setMedium] = useState("");
//   const [status, setStatus] = useState(null); // { type: 'success'|'error', msg }
//   const [saving, setSaving] = useState(false);
//   const [loadError, setLoadError] = useState(null);

//   // Fetch current thresholds on mount
//   useEffect(() => {
//     fetch("http://localhost:5000/api/thresholds")
//       .then((res) => {
//         if (!res.ok) throw new Error(`Server error: ${res.status}`);
//         return res.json();
//       })
//       .then((data) => {
//         setLow(data.LOW ?? 0.4);
//         setMedium(data.MEDIUM ?? 0.7);
//       })
//       .catch((err) => {
//         setLoadError("Could not load current thresholds: " + err.message);
//         setLow(0.4);
//         setMedium(0.7);
//       });
//   }, []);

//   const validate = () => {
//     const l = parseFloat(low);
//     const m = parseFloat(medium);
//     if (isNaN(l) || isNaN(m)) return "Both values must be numbers.";
//     if (l <= 0) return "Low threshold must be greater than 0.";
//     if (m >= 1) return "Medium threshold must be less than 1.";
//     if (m <= l) return "Medium threshold must be greater than Low threshold.";
//     return null;
//   };

//   const save = async () => {
//     const validationError = validate();
//     if (validationError) {
//       setStatus({ type: "error", msg: validationError });
//       return;
//     }

//     setSaving(true);
//     setStatus(null);

//     try {
//       const res = await fetch("http://localhost:5000/api/thresholds", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ LOW: parseFloat(low), MEDIUM: parseFloat(medium) }),
//       });

//       if (!res.ok) {
//         const err = await res.json();
//         throw new Error(err.error || "Save failed");
//       }

//       setStatus({ type: "success", msg: "✓ Thresholds saved successfully" });
//     } catch (err) {
//       setStatus({ type: "error", msg: err.message || "Failed to save" });
//     } finally {
//       setSaving(false);
//     }
//   };

//   return (
//     <div className="settings-container">
//       <h2 className="section-title">⚙️ Threshold Settings</h2>
//       <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: 0, marginBottom: 24 }}>
//         Density ratio thresholds determine when a crowd is classified as LOW, MEDIUM, or HIGH.
//         Values must be between 0 and 1 with LOW &lt; MEDIUM.
//       </p>

//       {loadError && (
//         <p className="save-error" style={{ marginBottom: 16 }}>⚠️ {loadError}</p>
//       )}

//       <div className="settings-form">
//         <div className="form-group">
//           <label className="form-label" htmlFor="low-input">
//             Low density threshold
//           </label>
//           <input
//             id="low-input"
//             className="form-input"
//             type="number"
//             step="0.05"
//             min="0.01"
//             max="0.99"
//             value={low}
//             onChange={(e) => setLow(e.target.value)}
//           />
//           <span className="form-hint">
//             Ratios below this value are classified as LOW (e.g. 0.4)
//           </span>
//         </div>

//         <div className="form-group">
//           <label className="form-label" htmlFor="medium-input">
//             Medium density threshold
//           </label>
//           <input
//             id="medium-input"
//             className="form-input"
//             type="number"
//             step="0.05"
//             min="0.01"
//             max="0.99"
//             value={medium}
//             onChange={(e) => setMedium(e.target.value)}
//           />
//           <span className="form-hint">
//             Ratios below this value are MEDIUM, above are HIGH (e.g. 0.7)
//           </span>
//         </div>

//         <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
//           <button className="save-btn" onClick={save} disabled={saving}>
//             {saving ? "Saving…" : "Save Thresholds"}
//           </button>

//           {status && (
//             <span className={status.type === "success" ? "save-success" : "save-error"}>
//               {status.msg}
//             </span>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// }

// export default Settings;







import { useState, useEffect } from "react";

const BASE = "http://localhost:5000";

export default function Settings({ cameras = [] }) {
  // ── Thresholds ───────────────────────────────────────────────
  const [low,       setLow]       = useState("");
  const [medium,    setMedium]    = useState("");
  const [saving,    setSaving]    = useState(false);
  const [status,    setStatus]    = useState(null);
  const [loadError, setLoadError] = useState(null);

  // ── Camera → Location mapping ────────────────────────────────
  const [locations,   setLocations]   = useState([]);
  const [camMap,      setCamMap]      = useState({});  // { cam1: "Entrance", … }
  const [mapStatus,   setMapStatus]   = useState({});  // { cam1: { type, msg } }

  // ── Load thresholds ──────────────────────────────────────────
  useEffect(() => {
    fetch(`${BASE}/api/thresholds`)
      .then((r) => { if (!r.ok) throw new Error(`Server error: ${r.status}`); return r.json(); })
      .then((d)  => { setLow(d.LOW ?? 0.4); setMedium(d.MEDIUM ?? 0.7); })
      .catch((e) => { setLoadError("Could not load thresholds: " + e.message); setLow(0.4); setMedium(0.7); });
  }, []);

  // ── Load campus locations list ───────────────────────────────
  useEffect(() => {
    fetch(`${BASE}/api/locations`)
      .then((r) => r.json())
      .then(setLocations)
      .catch(() => {});
  }, []);

  // ── Load existing camera-location config ─────────────────────
  useEffect(() => {
    fetch(`${BASE}/api/camera-config`)
      .then((r) => r.json())
      .then(setCamMap)
      .catch(() => {});
  }, []);

  // ── Validate thresholds ──────────────────────────────────────
  const validate = () => {
    const l = parseFloat(low), m = parseFloat(medium);
    if (isNaN(l) || isNaN(m))   return "Both values must be numbers.";
    if (l <= 0)                  return "Low threshold must be > 0.";
    if (m >= 1)                  return "Medium threshold must be < 1.";
    if (m <= l)                  return "Medium must be greater than Low.";
    return null;
  };

  const saveThresholds = async () => {
    const err = validate();
    if (err) { setStatus({ type: "error", msg: err }); return; }
    setSaving(true); setStatus(null);
    try {
      const r = await fetch(`${BASE}/api/thresholds`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ LOW: parseFloat(low), MEDIUM: parseFloat(medium) }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Save failed"); }
      setStatus({ type: "success", msg: "✓ Thresholds saved" });
    } catch (e) {
      setStatus({ type: "error", msg: e.message });
    } finally {
      setSaving(false);
    }
  };

  // ── Assign location to a camera ──────────────────────────────
  const assignLocation = async (camera, location) => {
    setCamMap((prev) => ({ ...prev, [camera]: location }));
    setMapStatus((prev) => ({ ...prev, [camera]: null }));
    try {
      const r = await fetch(`${BASE}/api/camera-config`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ camera, location }),
      });
      if (!r.ok) throw new Error("Failed to save");
      setMapStatus((prev) => ({ ...prev, [camera]: { type: "success", msg: "✓ Saved" } }));
      setTimeout(() => setMapStatus((p) => ({ ...p, [camera]: null })), 2500);
    } catch (e) {
      setMapStatus((prev) => ({ ...prev, [camera]: { type: "error", msg: e.message } }));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* ── Threshold settings ─────────────────────────────────── */}
      <div className="settings-container">
        <h2 className="section-title">⚙️ Density Thresholds</h2>
        <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: 0, marginBottom: 20 }}>
          Density ratio thresholds for LOW / MEDIUM / HIGH classification.
          Values must be between 0 and 1 with LOW &lt; MEDIUM.
        </p>

        {loadError && <p className="save-error" style={{ marginBottom: 12 }}>⚠️ {loadError}</p>}

        <div className="settings-form">
          <div className="form-group">
            <label className="form-label" htmlFor="low-input">Low density threshold</label>
            <input id="low-input" className="form-input" type="number"
              step="0.05" min="0.01" max="0.99"
              value={low} onChange={(e) => setLow(e.target.value)} />
            <span className="form-hint">Ratios below this → LOW (e.g. 0.4)</span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="medium-input">Medium density threshold</label>
            <input id="medium-input" className="form-input" type="number"
              step="0.05" min="0.01" max="0.99"
              value={medium} onChange={(e) => setMedium(e.target.value)} />
            <span className="form-hint">Above Low → MEDIUM; above this → HIGH (e.g. 0.7)</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <button className="save-btn" onClick={saveThresholds} disabled={saving}>
              {saving ? "Saving…" : "Save Thresholds"}
            </button>
            {status && (
              <span className={status.type === "success" ? "save-success" : "save-error"}>
                {status.msg}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Camera → Location mapping ──────────────────────────── */}
      <div className="settings-container" style={{ maxWidth: 560 }}>
        <h2 className="section-title">📍 Camera Locations</h2>
        <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: 0, marginBottom: 20 }}>
          Assign each camera to its physical location on the PDPM IIITDM Jabalpur campus.
          This is used to tag every crowd reading so you can query data by location.
        </p>

        {cameras.length === 0 && (
          <p style={{ color: "#94a3b8", fontSize: "0.88rem" }}>
            No cameras detected yet. Start the Python detector to see cameras here.
          </p>
        )}

        {cameras.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {cameras.map((cam) => (
              <div key={cam} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                {/* Camera label */}
                <span style={{
                  fontFamily: "monospace", fontSize: "0.85rem", fontWeight: 700,
                  background: "#eff6ff", color: "#2563eb",
                  padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap",
                  minWidth: 60, textAlign: "center",
                }}>
                  {cam}
                </span>

                {/* Location dropdown */}
                <select
                  className="form-input"
                  style={{ flex: 1, minWidth: 160, maxWidth: 240 }}
                  value={camMap[cam] || ""}
                  onChange={(e) => assignLocation(cam, e.target.value || null)}
                >
                  <option value="">— Unassigned —</option>
                  {locations.map((loc) => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>

                {/* Save feedback */}
                {mapStatus[cam] && (
                  <span className={mapStatus[cam].type === "success" ? "save-success" : "save-error"}
                    style={{ fontSize: "0.78rem" }}>
                    {mapStatus[cam].msg}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: 16 }}>
          💡 You can also set the location directly in <code>crowd_detection.py</code> under
          the <code>CAMERAS</code> dict — the Python script registers the mapping at startup.
        </p>
      </div>

    </div>
  );
}
