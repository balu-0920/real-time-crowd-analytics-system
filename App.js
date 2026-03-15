import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip
} from "recharts";
import History from "./History";
import Settings from "./Settings";

const socket = io("http://localhost:5000");

function App() {
  const [live, setLive] = useState({});
  const [chartData, setChartData] = useState([]);
  const [alertMsg, setAlertMsg] = useState("");
  const [view, setView] = useState("live"); // ✅ FIX HERE

  useEffect(() => {
    socket.on("live", data => {
      setLive(data);
      setChartData(prev => [
        ...prev.slice(-20),
        {
          time: new Date().toLocaleTimeString(),
          people: data.people
        }
      ]);
    });

    socket.on("alert", msg => {
      setAlertMsg(msg);
      showNotification();
    });

    return () => {
      socket.off("live");
      socket.off("alert");
    };
  }, []);

  const showNotification = () => {
    if (Notification.permission === "granted") {
      new Notification("🚨 Crowd Alert", {
        body: "Crowd density exceeded!"
      });
    }
  };

  return (
    <div style={{ padding: 30 }}>
      <h1>🚦 Crowd Monitoring Dashboard</h1>

      {/* 🔘 Navigation */}
      <div style={{ marginBottom: 20 }}>
        <button onClick={() => setView("live")}>Live</button>{" "}
        <button onClick={() => setView("history")}>History</button>{" "}
        <button onClick={() => setView("settings")}>Settings</button>
      </div>

      {/* 🔄 View Switch */}
      {view === "live" && (
        <>
          <h2>Live Statistics</h2>
          <p>👥 People: {live.people}</p>
          <p>🏟 Capacity: {live.capacity}</p>
          <p>📊 Density: {live.density}</p>

          {alertMsg && <h3 style={{ color: "red" }}>{alertMsg}</h3>}

          <h2>Live Crowd Chart</h2>
          <LineChart width={700} height={300} data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="people"
              stroke="#2563eb"
              strokeWidth={3}
            />
          </LineChart>
        </>
      )}

      {view === "history" && <History />}
      {view === "settings" && <Settings />}
    </div>
  );
}

export default App;
