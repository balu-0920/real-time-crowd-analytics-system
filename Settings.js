import { useState } from "react";

function Settings() {
  const [low, setLow] = useState(0.4);
  const [medium, setMedium] = useState(0.7);

  const save = () => {
    fetch("http://localhost:5000/api/thresholds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ LOW: low, MEDIUM: medium })
    });
    alert("Thresholds Updated");
  };

  return (
    <div style={{ padding: 30 }}>
      <h1>⚙ Threshold Settings</h1>

      <label>Low Density</label>
      <input value={low} onChange={e => setLow(e.target.value)} />

      <label>Medium Density</label>
      <input value={medium} onChange={e => setMedium(e.target.value)} />

      <button onClick={save}>Save</button>
    </div>
  );
}

export default Settings;
