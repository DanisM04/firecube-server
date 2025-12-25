const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Zadnje stanje (čuvamo u RAM-u)
let latest = {
  device_id: "unknown",
  smoke: 0,
  alarm: false,
  lat: null,
  lon: null,
  timestamp: null
};

// Prag alarma (možeš mijenjati)
const THRESHOLD = 1800;

// ESP32 šalje ovdje podatke
app.post("/api/data", (req, res) => {
  const d = req.body || {};

  latest.device_id = d.device_id ?? latest.device_id;
  latest.smoke = Number(d.smoke ?? latest.smoke);
  latest.lat = (d.lat !== undefined) ? Number(d.lat) : latest.lat;
  latest.lon = (d.lon !== undefined) ? Number(d.lon) : latest.lon;
  latest.timestamp = Date.now();

  latest.alarm = latest.smoke > THRESHOLD;

  console.log("DATA:", latest);
  res.json({ ok: true });
});

// Web stranica čita zadnje stanje odavde
app.get("/api/latest", (req, res) => {
  res.json(latest);
});

// Serviraj web stranicu iz /public
app.use("/", express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server radi na portu ${PORT}`);
});

