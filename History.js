import { useEffect, useState } from "react";

function History() {
  const [data, setData] = useState([]);

  useEffect(() => {
    fetch("http://localhost:5000/api/daily-summary")
      .then(res => res.json())
      .then(setData);
  }, []);

  return (
    <div style={{ padding: 30 }}>
      <h1>📅 Daily History</h1>

      <table border="1" cellPadding="10">
        <thead>
          <tr>
            <th>Date</th>
            <th>Max People</th>
            <th>Alerts</th>
          </tr>
        </thead>
        <tbody>
          {data.map(d => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.maxPeople}</td>
              <td>{d.alerts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default History;
