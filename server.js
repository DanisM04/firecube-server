const express = require("express");
const cors = require("cors");
const path = require("path");
const mqtt = require("mqtt");

const app = express();
app.use(cors());
app.use(express.json());

// ====== CONFIG ======
const THRESHOLD = 1800;

// MQTT broker
const MQTT_URL = "mqtt://test.mosquitto.org:1883";
const MQTT_SUB = "firecube/+/data";

// ====== STATE (multi-device in RAM) ======
const devices = Object.create(null);

// Alarm history (RAM)
const alarmHistory = [];
const MAX_HISTORY = 200; // koliko događaja čuvamo

function now() { return Date.now(); }

function pushHistory(evt) {
  alarmHistory.unshift(evt);          // newest first
  if (alarmHistory.length > MAX_HISTORY) alarmHistory.pop();
}

function updateDevice(d, source) {
  const device_id = (d.device_id || "unknown").toString();

  const smoke = Number(d.smoke ?? 0);
  const lat = (d.lat !== undefined && d.lat !== null) ? Number(d.lat) : null;
  const lon = (d.lon !== undefined && d.lon !== null) ? Number(d.lon) : null;

  const prev = devices[device_id];
  const prevAlarm = prev ? !!prev.alarm : false;

  const alarm = smoke > THRESHOLD;

  const row = {
    device_id,
    smoke,
    alarm,
    lat,
    lon,
    timestamp: now(),
    source
  };

  devices[device_id] = row;

  // log only on alarm state change
  if (alarm !== prevAlarm) {
    pushHistory({
      id: row.timestamp + "-" + device_id,
      device_id,
      type: alarm ? "ALARM_ON" : "ALARM_OFF",
      smoke,
      lat,
      lon,
      timestamp: row.timestamp,
      source
    });
  }

  // also log "heartbeat" alarm events? (ne treba)
  return row;
}

// ====== MQTT INGEST ======
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
    const row = updateDevice(d, "mqtt");
    console.log("MQTT IN:", topic, row);
  } catch (err) {
    console.error("Bad MQTT JSON:", err);
  }
});

// ====== HTTP INGEST (optional) ======
app.post("/api/data", (req, res) => {
  const d = req.body || {};
  const row = updateDevice(d, "http");
  console.log("HTTP IN:", row);
  res.json({ ok: true });
});

// ====== API ======
app.get("/api/devices", (req, res) => {
  res.json(Object.values(devices));
});

app.get("/api/device/:id", (req, res) => {
  const id = req.params.id;
  res.json(devices[id] || null);
});

// history: all
app.get("/api/alarms", (req, res) => {
  res.json(alarmHistory);
});

// history: per device
app.get("/api/alarms/:id", (req, res) => {
  const id = req.params.id;
  res.json(alarmHistory.filter(a => a.device_id === id));
});

// compat: latest (newest device update)
app.get("/api/latest", (req, res) => {
  const list = Object.values(devices);
  if (list.length === 0) {
    return res.json({
      device_id: "unknown",
      smoke: 0,
      alarm: false,
      lat: null,
      lon: null,
      timestamp: null,
      source: "none"
    });
  }
  list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  res.json(list[0]);
});

// ====== FRONTEND ======
app.use("/", express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// ====== START ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server radi na portu ${PORT}`));
