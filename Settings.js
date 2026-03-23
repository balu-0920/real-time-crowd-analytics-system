// // import { useState } from "react";

// // function Settings() {
// //   const [low, setLow] = useState(0.4);
// //   const [medium, setMedium] = useState(0.7);

// //   const save = () => {
// //     fetch("http://localhost:5000/api/thresholds", {
// //       method: "POST",
// //       headers: { "Content-Type": "application/json" },
// //       body: JSON.stringify({ LOW: low, MEDIUM: medium })
// //     });
// //     alert("Thresholds Updated");
// //   };

// //   return (
// //     <div style={{ padding: 30 }}>
// //       <h1>⚙ Threshold Settings</h1>

// //       <label>Low Density</label>
// //       <input value={low} onChange={e => setLow(e.target.value)} />

// //       <label>Medium Density</label>
// //       <input value={medium} onChange={e => setMedium(e.target.value)} />

// //       <button onClick={save}>Save</button>
// //     </div>
// //   );
// // }

// // export default Settings;













// import { useState, useEffect } from "react";

// function Settings() {
//   const [low, setLow] = useState(0.4);
//   const [medium, setMedium] = useState(0.7);

//   useEffect(() => {
//     fetch("http://localhost:5000/api/settings")
//       .then(res => res.json())
//       .then(data => {
//         setLow(data.low);
//         setMedium(data.medium);
//       });
//   }, []);

//   const save = async () => {
//     await fetch("http://localhost:5000/api/settings", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ low, medium })
//     });

//     alert("Thresholds Updated");
//   };

//   return (
//     <div style={{ padding: 30 }}>
//       <h1>⚙ Threshold Settings</h1>

//       <label>Low Density</label><br />
//       <input
//         type="number"
//         step="0.1"
//         value={low}
//         onChange={e => setLow(Number(e.target.value))}
//       />

//       <br /><br />

//       <label>Medium Density</label><br />
//       <input
//         type="number"
//         step="0.1"
//         value={medium}
//         onChange={e => setMedium(Number(e.target.value))}
//       />

//       <br /><br />

//       <button onClick={save}>Save</button>
//     </div>
//   );
// }

// export default Settings;


import { useState, useEffect } from "react";

function Settings() {
  const [low, setLow] = useState("");
  const [medium, setMedium] = useState("");
  const [status, setStatus] = useState(null); // { type: 'success'|'error', msg }
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Fetch current thresholds on mount
  useEffect(() => {
    fetch("http://localhost:5000/api/thresholds")
      .then((res) => {
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setLow(data.LOW ?? 0.4);
        setMedium(data.MEDIUM ?? 0.7);
      })
      .catch((err) => {
        setLoadError("Could not load current thresholds: " + err.message);
        setLow(0.4);
        setMedium(0.7);
      });
  }, []);

  const validate = () => {
    const l = parseFloat(low);
    const m = parseFloat(medium);
    if (isNaN(l) || isNaN(m)) return "Both values must be numbers.";
    if (l <= 0) return "Low threshold must be greater than 0.";
    if (m >= 1) return "Medium threshold must be less than 1.";
    if (m <= l) return "Medium threshold must be greater than Low threshold.";
    return null;
  };

  const save = async () => {
    const validationError = validate();
    if (validationError) {
      setStatus({ type: "error", msg: validationError });
      return;
    }

    setSaving(true);
    setStatus(null);

    try {
      const res = await fetch("http://localhost:5000/api/thresholds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ LOW: parseFloat(low), MEDIUM: parseFloat(medium) }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Save failed");
      }

      setStatus({ type: "success", msg: "✓ Thresholds saved successfully" });
    } catch (err) {
      setStatus({ type: "error", msg: err.message || "Failed to save" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-container">
      <h2 className="section-title">⚙️ Threshold Settings</h2>
      <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: 0, marginBottom: 24 }}>
        Density ratio thresholds determine when a crowd is classified as LOW, MEDIUM, or HIGH.
        Values must be between 0 and 1 with LOW &lt; MEDIUM.
      </p>

      {loadError && (
        <p className="save-error" style={{ marginBottom: 16 }}>⚠️ {loadError}</p>
      )}

      <div className="settings-form">
        <div className="form-group">
          <label className="form-label" htmlFor="low-input">
            Low density threshold
          </label>
          <input
            id="low-input"
            className="form-input"
            type="number"
            step="0.05"
            min="0.01"
            max="0.99"
            value={low}
            onChange={(e) => setLow(e.target.value)}
          />
          <span className="form-hint">
            Ratios below this value are classified as LOW (e.g. 0.4)
          </span>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="medium-input">
            Medium density threshold
          </label>
          <input
            id="medium-input"
            className="form-input"
            type="number"
            step="0.05"
            min="0.01"
            max="0.99"
            value={medium}
            onChange={(e) => setMedium(e.target.value)}
          />
          <span className="form-hint">
            Ratios below this value are MEDIUM, above are HIGH (e.g. 0.7)
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <button className="save-btn" onClick={save} disabled={saving}>
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
  );
}

export default Settings;