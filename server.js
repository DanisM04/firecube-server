const express = require("express");
const cors = require("cors");
const path = require("path");
const mqtt = require("mqtt");

const app = express();
app.use(cors());
app.use(express.json());

// ==================== STATE ====================
let latest = {
  device_id: "unknown",
  smoke: 0,
  alarm: false,
  lat: null,
  lon: null,
  timestamp: null,
  source: "none" // "mqtt" ili "http"
};

// Prag alarma (možeš mijenjati)
const THRESHOLD = 1800;

// ==================== MQTT (SIM800 -> broker -> server) ====================
// Public test broker (dobar za demo). Za produkciju kasnije: svoj broker/VPS.
const MQTT_URL = "mqtt://test.mosquitto.org:1883";
// Topic format: firecube/<device_id>/data
const MQTT_SUB = "firecube/+/data";

const mqttClient = mqtt.connect(MQTT_URL, {
  clientId: "firecube-server-" + Math.random().toString(16).slice(2),
  keepalive: 60,
  reconnectPeriod: 2000
});

mqttClient.on("connect", () => {
  console.log("MQTT connected:", MQTT_URL);
  mqttClient.subscribe(MQTT_SUB, (err) => {
    if (err) console.error("MQTT subscribe error:", err);
    else console.log("MQTT subscribed:", MQTT_SUB);
  });
});

mqttClient.on("reconnect", () => console.log("MQTT reconnecting..."));
mqttClient.on("error", (e) => console.error("MQTT error:", e));

mqttClient.on("message", (topic, message) => {
  try {
    const d = JSON.parse(message.toString());

    latest.device_id = d.device_id ?? latest.device_id;
    latest.smoke = Number(d.smoke ?? latest.smoke);
    latest.lat = (d.lat !== undefined && d.lat !== null) ? Number(d.lat) : null;
    latest.lon = (d.lon !== undefined && d.lon !== null) ? Number(d.lon) : null;
    latest.timestamp = Date.now();
    latest.alarm = latest.smoke > THRESHOLD;
    latest.source = "mqtt";

    console.log("MQTT IN:", topic, latest);
  } catch (err) {
    console.error("Bad MQTT JSON:", err);
  }
});

// ==================== HTTP (WiFi test / fallback) ====================
// ESP32 može (ako je na WiFi) slati i direktno HTTP kao prije
app.post("/api/data", (req, res) => {
  const d = req.body || {};

  latest.device_id = d.device_id ?? latest.device_id;
  latest.smoke = Number(d.smoke ?? latest.smoke);
  latest.lat = (d.lat !== undefined && d.lat !== null) ? Number(d.lat) : null;
  latest.lon = (d.lon !== undefined && d.lon !== null) ? Number(d.lon) : null;
  latest.timestamp = Date.now();
  latest.alarm = latest.smoke > THRESHOLD;
  latest.source = "http";

  console.log("HTTP IN:", latest);
  res.json({ ok: true });
});

// Web čita odavde
app.get("/api/latest", (req, res) => {
  res.json(latest);
});

// Serviraj web iz /public
app.use("/", express.static(path.join(__dirname, "public")));

// ==================== START ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server radi na portu ${PORT}`);
});
