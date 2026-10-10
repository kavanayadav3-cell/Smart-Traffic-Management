# 🚦 TrafficFlow OS

**A browser-based smart-city traffic digital twin.** TrafficFlow OS simulates a 16-intersection city grid with live vehicles, adaptive traffic signals, congestion-aware routing, emergency green corridors, and a prediction dashboard. It is built with vanilla JavaScript and HTML5 Canvas, with no build step and no backend.

> ⚠️ **Prototype status:** This is a simulation and visualization prototype. The "AI" components are heuristic models, not trained ML models. See [Limitations](#-limitations--honest-notes).

---

## ✨ Features

### 🗺️ Digital Twin Simulation
- 4×4 city grid (16 nodes, bidirectional edges) with an expressway row, an avenue column, diagonal shortcuts, a river, and a bridge
- Vehicle types: **cars**, **trucks**, and **ambulances**
- Per-lane car-following behaviour, queueing, and deceleration at red lights and roadblocks
- Two roundabouts and 14 signalised intersections
- Pan, zoom, and click to inspect any road or intersection
- Play/pause and 1x / 2x / 5x simulation speed

### 🚥 Smart Signal Control
- **Fixed-cycle mode:** static NS/EW phase timing
- **Adaptive mode:** queue-length based switching with minimum and maximum green times and a cooldown to prevent flapping
- Live average wait time and throughput metrics, with a Fixed vs Adaptive comparison chart

### 🧭 Dynamic Route Optimizer
- Dijkstra pathfinding on live edge weights (length / speed limit × congestion penalty × lane bonus)
- Compares a **static shortest path** with a **live congestion-aware path**, and suggests an **alternative route** by temporarily loading the optimal path
- Roadblocked edges are treated as impassable
- Deploy a test vehicle on any queried route

### 🚑 Emergency Green Corridor
- Dispatch an ambulance across the grid
- Signals along its route are forced green in its direction of travel
- Overrides are released node by node as the ambulance passes

### 🧠 AI Prediction Dashboard
- Inputs: **time of day, weather (clear / rain / storm), public event (none / sports / concert), holiday flag**
- Outputs: **delay index (1.0–5.0), accident-risk %, top-4 predicted hotspot roads, 60-minute congestion forecast** (15 / 30 / 45 / 60 min)
- Weather also reduces the simulated speed limits on all roads

### 📡 Traffic Protocol Monitor (IoT Simulation)
- A custom `TRAFFIC_PACKET_V1` packet protocol
- Road-segment reports are broadcast as animated packets travelling along the roads
- Live TX/RX console, throughput, and latency readouts (simulated values)

### 🚧 Incident Simulation
- Click any road to place or remove a **roadblock** (applied in both directions)
- Vehicles queue, the router reroutes around it, and the incident counter updates

---

## 🏗️ Architecture

```
index.html          Dashboard layout (3-column HUD)
styles.css          Dark "control room" theme
app.js              Coordinator: wires engines to the UI, runs the main loop
simulation.js       Core engine: nodes, edges, vehicles, signals, canvas rendering
router.js           Dijkstra pathfinder + route recommendations
ai-engine.js        Heuristic traffic prediction engine
signal-system.js    Fixed/adaptive mode control, emergency corridors, analytics
protocol.js         TRAFFIC_PACKET_V1 packet protocol and console
```

**Main loop:** `requestAnimationFrame` → update signals → update vehicles → update edge metrics → update protocol packets → render canvas → throttled dashboard refresh.

---

## 🚀 Getting Started

### Prerequisites
- Any modern browser (Chrome, Edge, Firefox, Safari)
- Internet connection on first load (fonts, Lucide icons, and Chart.js are loaded from CDNs)

### Run locally

```bash
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
```

Then either:

- **Open `index.html` directly in your browser**, or
- Serve it locally:

```bash
# Python
python3 -m http.server 8000

# or Node
npx serve .
```

Open `http://localhost:8000`.

---

## 🎮 How to Use

| Goal | What to do |
|---|---|
| Pan / zoom the map | Drag / scroll on the canvas |
| Inspect a road or intersection | Click it |
| Block a road | Click a road → **Place Roadblock** |
| Add a vehicle | Pick a type → **Deploy** |
| Compare signal strategies | Right panel → **Fixed Cycles** vs **Adaptive (AI)** |
| Find a route | Choose source and target → **Query Path** → **Deploy Test Car** |
| Trigger an emergency corridor | **Initialize Emergency Corridor** |
| Test prediction scenarios | Change weather, event, holiday, or the time slider |
| Reset | Refresh icon on the map toolbar |

**Suggested demo flow:** set the weather to *Storm* and the time to *17:30*. Block a road on the expressway row. Query a route from node 0 to node 15 and compare the static and optimized paths. Then switch to Adaptive signals and dispatch an ambulance.

---

## 🧮 How the Models Work

**Delay index:** `rush(hour) × weather × event × holiday`, clamped to 1–5. Rush hour is two Gaussian peaks (~8:30 AM and ~5:30 PM).

**Accident risk:** a base rate plus additive terms for rush hour, weather, and events, capped at 98%.

**Hotspots:** each edge's live congestion plus location-specific boosts (tech hub in the morning, south exit in the evening, stadium zone during sports events, storm friction).

**Adaptive signals:** after a minimum green time, switch if the opposing queue exceeds the current queue by more than 2, or if the current queue is empty and the opposing queue is not. A maximum green time forces a switch, and a cooldown follows each change.

**Routing:** Dijkstra with `weight = (length / speedLimit) × (1 + 4 × congestion) × laneBonus`.

---

## 🛠️ Tech Stack

- **JavaScript (ES6+)**, with no framework and no build tooling
- **HTML5 Canvas** for rendering
- **Chart.js** for forecast and comparison charts
- **Lucide** for icons
- **Google Fonts** (Outfit, Inter)

---

## ⚠️ Limitations & Honest Notes

- **Prediction is heuristic, not learned.** `ai-engine.js` is a hand-tuned formula that emulates the *shape* of what an LSTM/XGBoost forecaster would output. It is not trained on data.
- **Signal comparison chart is indicative only.** The Fixed vs Adaptive bars use baseline constants for the non-active mode, so they are not a controlled A/B measurement.
- **Protocol metrics are simulated.** Latency is randomized and packet loss is fixed at 0%.
- **Synthetic city.** The map is a procedurally defined grid, not real road data.
- **Performance.** Pathfinding and edge lookups use linear scans, which is fine at this scale but not for large networks.
- **No tests or persistence.** There is no backend, database, or automated test suite yet.

---

## 🗺️ Roadmap

- [ ] Run Fixed and Adaptive modes on identical seeded traffic for a real A/B comparison
- [ ] Replace the heuristic predictor with a model trained on real or simulated traffic data
- [ ] Import real road networks (OpenStreetMap)
- [ ] Priority-queue Dijkstra and an edge lookup map
- [ ] Seeded RNG for reproducible runs
- [ ] Export simulation metrics as CSV/JSON
- [ ] Unit tests for the router and signal logic

---



## 👤 Author

