import { useState } from "react";
import "./App.css";

export default function Login({ onLogin }) {

  const [screen, setScreen] = useState("select");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const resetForm = () => {
    setUsername("");
    setPassword("");
    setError("");
  };

  const handlePortal = (portal) => {
    if (portal === "public") {
      onLogin({ role: "public", username: "Guest", token: null });
      return;
    }
    resetForm();
    setScreen(portal);
  };

  const handleSubmit = async () => {

    if (!username.trim() || !password.trim()) {
      setError("Please enter both username and password.");
      return;
    }

    setLoading(true);
    setError("");

    try {

      const res = await fetch("http://localhost:5000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed.");
      } else {

        if (data.role !== screen) {
          setError(`This account does not have ${screen} access.`);
        } else {

          sessionStorage.setItem("token", data.token);
          sessionStorage.setItem("userRole", data.role);
          sessionStorage.setItem("username", data.username);

          onLogin({
            role: data.role,
            username: data.username,
            token: data.token,
          });
        }
      }

    } catch (err) {
      setError("Cannot reach server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  // ---------- Portal Selection ----------

  if (screen === "select") {
    return (
      <div className="login-page">
        <div className="login-card">

          <div className="login-header">
            <span className="login-icon">🚦</span>
            <h1 className="login-title">Crowd Monitoring</h1>
            <p className="login-subtitle">
              Monitoring & Safety System
            </p>
          </div>

          <p className="login-portal-heading">Select Portal</p>

          <div className="login-portals">

            <button
              className="portal-btn"
              onClick={() => handlePortal("public")}
            >
              <div className="portal-text">
                <span className="portal-name">Public View</span>
                <span className="portal-desc">
                  Live dashboard — no login required
                </span>
              </div>
            </button>

            <button
              className="portal-btn"
              onClick={() => handlePortal("control")}
            >
              <div className="portal-text">
                <span className="portal-name">Control Room</span>
                <span className="portal-desc">
                  Full dashboard & analytics
                </span>
              </div>
            </button>

            <button
              className="portal-btn"
              onClick={() => handlePortal("security")}
            >
              <div className="portal-text">
                <span className="portal-name">Security Personnel</span>
                <span className="portal-desc">
                  Manual reporting & tools
                </span>
              </div>
            </button>

          </div>

        </div>
      </div>
    );
  }

  // ---------- Login Form ----------

  const isControl = screen === "control";

  return (
    <div className="login-page">
      <div className="login-card">

        <div className="login-header">
          <h1 className="login-title">
            {isControl ? "Control Room" : "Security Personnel"}
          </h1>
          <p className="login-subtitle">
            Enter your credentials to continue
          </p>
        </div>

        <div className="login-form">

          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              className="form-input"
              type="text"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className="login-error">{error}</p>}

          <button
            className="save-btn login-submit-btn"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>

          <button
            className="login-back-btn"
            onClick={() => {
              resetForm();
              setScreen("select");
            }}
          >
            ← Back to portal selection
          </button>

        </div>
      </div>
    </div>
  );
}
