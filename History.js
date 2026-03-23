// import { useEffect, useState } from "react";

// function History() {
//   const [data, setData] = useState([]);

//   useEffect(() => {
//     fetch("http://localhost:5000/api/daily-summary")
//       .then(res => res.json())
//       .then(setData);
//   }, []);

//   return (
//     <div style={{ padding: 30 }}>
//       <h1>📅 Daily History</h1>

//       <table border="1" cellPadding="10">
//         <thead>
//           <tr>
//             <th>Date</th>
//             <th>Max People</th>
//             <th>Alerts</th>
//           </tr>
//         </thead>
//         <tbody>
//           {data.map(d => (
//             <tr key={d.date}>
//               <td>{d.date}</td>
//               <td>{d.maxPeople}</td>
//               <td>{d.alerts}</td>
//             </tr>
//           ))}
//         </tbody>
//       </table>
//     </div>
//   );
// }

// export default History;


import { useEffect, useState } from "react";

export default function History({ selectedCam, cameras = [] }) {
  const [data,      setData]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [filterCam, setFilterCam] = useState(selectedCam || "");

  useEffect(() => {
    setFilterCam(selectedCam || "");
  }, [selectedCam]);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const url = filterCam
      ? `http://localhost:5000/api/daily-summary?camera=${encodeURIComponent(filterCam)}`
      : "http://localhost:5000/api/daily-summary";

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Server error: ${r.status}`);
        return r.json();
      })
      .then((json) => { setData(json); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [filterCam]);

  return (
    <div className="history-container">
      <div className="history-header">
        <h2 className="section-title">📅 Daily History</h2>
        <div className="history-filter">
          <label className="form-label" htmlFor="hist-cam-select">Camera</label>
          <select
            id="hist-cam-select"
            className="form-input"
            style={{ width: "auto", minWidth: 130 }}
            value={filterCam}
            onChange={(e) => setFilterCam(e.target.value)}
          >
            <option value="">All cameras</option>
            {cameras.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p className="loading-text">Loading history…</p>}
      {error   && <p className="table-error">⚠️ {error}</p>}

      {!loading && !error && data.length === 0 && (
        <p className="table-empty">
          No history data yet{filterCam ? ` for ${filterCam}` : ""}.
          Start the crowd detector to begin recording.
        </p>
      )}

      {!loading && !error && data.length > 0 && (
        <table className="history-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Camera</th>
              <th>Max People</th>
              <th>Avg People</th>
              <th>Records</th>
              <th>High Alerts</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={`${d.date}-${d.camera}-${i}`}>
                <td>{d.date}</td>
                <td><span className="cam-pill">{d.camera}</span></td>
                <td>{d.maxPeople}</td>
                <td>{d.avgPeople}</td>
                <td>{d.totalRecords}</td>
                <td style={{ color: d.alerts > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>
                  {d.alerts}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}