// TrafficFlow OS - Main Application Coordinator & UI Bindings

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Core Engines
  const sim = new Simulation('city-canvas');
  const router = new TrafficRouter(sim);
  sim.router = router; // Link router to simulation
  
  const ai = new AIEngine(sim);
  const signals = new SignalSystemCoordinator(sim);
  const protocol = new TrafficProtocolManager(sim, 'protocol-console');

  // Cache base speed limits for all edges to adjust under weather conditions later
  sim.edges.forEach(edge => {
    edge.baseSpeedLimit = edge.speedLimit;
  });

  // Active Emergency Ambulance pointer
  let activeAmbulance = null;
  let queryPathOverlay = null;

  // Initialize Lucide Icons
  lucide.createIcons();

  // 2. DOM Elements Cache
  const playPauseBtn = document.getElementById('sim-play-pause-btn');
  const playIcon = document.getElementById('sim-play-icon');
  const speed1xBtn = document.getElementById('speed-1x-btn');
  const speed2xBtn = document.getElementById('speed-2x-btn');
  const speed5xBtn = document.getElementById('speed-5x-btn');
  const spawnTypeSelect = document.getElementById('spawn-type');
  const spawnBtn = document.getElementById('spawn-btn');
  const resetSimBtn = document.getElementById('reset-sim-btn');
  
  const weatherSelect = document.getElementById('weather-select');
  const eventSelect = document.getElementById('event-select');
  const holidayCheckbox = document.getElementById('holiday-checkbox');
  const hourSlider = document.getElementById('hour-slider');
  const hourValText = document.getElementById('hour-val');

  const predDelayIndex = document.getElementById('pred-delay-index');
  const predAccidentRisk = document.getElementById('pred-accident-risk');
  const predHotspotsList = document.getElementById('pred-hotspots-list');

  const protoThroughput = document.getElementById('proto-throughput');
  const protoLoss = document.getElementById('proto-loss');
  const hdrLatency = document.getElementById('hdr-latency');
  const hdrAvgSpeed = document.getElementById('hdr-avg-speed');
  const hdrIncidents = document.getElementById('hdr-incidents');
  const hdrSystemMode = document.getElementById('hdr-system-mode');

  const mapStatVehicles = document.getElementById('map-stat-vehicles');
  const mapStatCongestion = document.getElementById('map-stat-congestion');
  const mapStatThroughput = document.getElementById('map-stat-throughput');

  const selectionCard = document.getElementById('selection-card');
  const selectionName = document.getElementById('selection-name');
  const selectionDetails = document.getElementById('selection-details');
  const selectionIconBox = document.getElementById('selection-icon-box');
  const blockRoadBtn = document.getElementById('block-road-btn');
  const blockBtnText = document.getElementById('block-btn-text');

  const signalFixedBtn = document.getElementById('signal-fixed-btn');
  const signalAdaptiveBtn = document.getElementById('signal-adaptive-btn');
  const signalModeDesc = document.getElementById('signal-mode-description');
  const signalAvgWaitText = document.getElementById('signal-avg-wait');
  const signalThroughputText = document.getElementById('signal-throughput');

  const routeSrcSelect = document.getElementById('route-source-select');
  const routeDestSelect = document.getElementById('route-target-select');
  const queryRouteBtn = document.getElementById('query-route-btn');
  const deployRouteVehicleBtn = document.getElementById('deploy-route-vehicle-btn');
  const routingResultsCard = document.getElementById('routing-results-card');
  const routeOptTimeText = document.getElementById('route-opt-time');
  const routeHistTimeText = document.getElementById('route-hist-time');
  const routeSavingsText = document.getElementById('route-savings');

  const triggerAmbulanceBtn = document.getElementById('trigger-ambulance-btn');
  const ambulanceStatusContainer = document.getElementById('ambulance-status-container');
  const ambSignalStatus = document.getElementById('amb-signal-status');
  const ambLocStatus = document.getElementById('amb-loc-status');

  const notifBanner = document.getElementById('notif-banner');
  const notifMessage = document.getElementById('notif-message');
  const notifIcon = document.getElementById('notif-icon');

  // 3. Populate Routing Dropdowns
  sim.nodes.forEach(node => {
    const optA = document.createElement('option');
    optA.value = node.id;
    optA.textContent = node.name;
    routeSrcSelect.appendChild(optA);

    const optB = document.createElement('option');
    optB.value = node.id;
    optB.textContent = node.name;
    // Default destination to Node 15 (bottom right corner)
    if (node.id === 15) optB.selected = true;
    routeDestSelect.appendChild(optB);
  });

  // 4. Initialize Chart.js Instances
  let trendChartInstance = null;
  let waitComparisonChartInstance = null;

  function initCharts() {
    // A. 60-Min Congestion Trend (Line Chart)
    const ctxTrend = document.getElementById('trend-chart').getContext('2d');
    trendChartInstance = new Chart(ctxTrend, {
      type: 'line',
      data: {
        labels: ['Live', '+15m', '+30m', '+45m', '+60m'],
        datasets: [{
          label: 'Congestion Probability %',
          data: [15, 20, 35, 42, 28],
          borderColor: '#d500f9', // Neon purple
          borderWidth: 2,
          backgroundColor: 'rgba(213, 0, 249, 0.05)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#d500f9',
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', font: { size: 9 } } },
          y: { min: 0, max: 100, grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', font: { size: 9 } } }
        }
      }
    });

    // B. Wait Delay Comparison (Bar Chart)
    const ctxWait = document.getElementById('wait-comparison-chart').getContext('2d');
    waitComparisonChartInstance = new Chart(ctxWait, {
      type: 'bar',
      data: {
        labels: ['Fixed Cycles', 'AI Adaptive'],
        datasets: [{
          data: [42, 14], // Seed wait times (seconds)
          backgroundColor: ['#ff1744', '#00e676'], // Red and green
          borderWidth: 0,
          borderRadius: 4,
          barThickness: 28
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } },
          y: { min: 0, grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', font: { size: 9 } } }
        }
      }
    });
  }
  initCharts();

  // 5. Simulation Control Events
  playPauseBtn.addEventListener('click', () => {
    sim.isPlaying = !sim.isPlaying;
    playIcon.setAttribute('data-lucide', sim.isPlaying ? 'pause' : 'play');
    lucide.createIcons();
    playPauseBtn.classList.toggle('active', !sim.isPlaying);
  });

  const setSpeed = (mult, activeBtn) => {
    sim.speedMultiplier = mult;
    [speed1xBtn, speed2xBtn, speed5xBtn].forEach(btn => btn.classList.remove('active'));
    activeBtn.classList.add('active');
  };
  speed1xBtn.addEventListener('click', () => setSpeed(1, speed1xBtn));
  speed2xBtn.addEventListener('click', () => setSpeed(2, speed2xBtn));
  speed5xBtn.addEventListener('click', () => setSpeed(5, speed5xBtn));

  // Spawn Vehicles Manual Button
  spawnBtn.addEventListener('click', () => {
    const type = spawnTypeSelect.value;
    if (type === 'ambulance') {
      triggerEmergencyAmbulance();
    } else {
      const v = sim.spawnVehicle(type);
      if (v) {
        showNotification(`Vehicle deployed: [${v.id}] starting route`, 'info');
      }
    }
  });

  // Reset Simulation Grid
  resetSimBtn.addEventListener('click', () => {
    sim.vehicles = [];
    sim.edges.forEach(edge => {
      edge.blocked = false;
      edge.vehicles = [];
      edge.congestion = 0;
    });
    sim.nodes.forEach(node => {
      node.vehiclesPassed = 0;
      node.accumulatedWaitTime = 0;
    });
    signals.resetStats();
    protocol.clear();
    activeAmbulance = null;
    queryPathOverlay = null;
    sim.highlightedPath = null;
    ambulanceStatusContainer.style.style = 'none';
    ambulanceStatusContainer.style.display = 'none';
    selectionCard.style.display = 'none';
    showNotification("Digital Twin grid reset successful", "info");
    protocol.logConsole("SYSTEM_RESET: Grid cleared, routing indices recalibrated.", "incident");
  });

  // 6. Context Selection Callbacks
  let currentSelection = null; // Node or Edge object

  sim.onSelectNode = (node) => {
    currentSelection = node;
    selectionCard.style.display = 'block';
    selectionIconBox.innerHTML = '<i data-lucide="help-circle"></i>';
    selectionName.textContent = `Intersection: ${node.name}`;
    
    const count = sim.vehicles.filter(v => v.currentEdge && v.currentEdge.target === node.id).length;
    selectionDetails.textContent = `Type: ${node.isRoundabout ? 'Roundabout (continuous flow)' : 'Smart Signals'} | Queue Size: ${count} cars | Total Throughput: ${node.vehiclesPassed} vehicles`;
    
    // Nodes cannot be blocked
    blockRoadBtn.style.display = 'none';
    lucide.createIcons();
  };

  sim.onSelectRoad = (road) => {
    currentSelection = road;
    selectionCard.style.display = 'block';
    selectionIconBox.innerHTML = '<i data-lucide="git-commit"></i>';
    selectionName.textContent = `Road segment: Route ${road.id.replace('E_', '').replace('_', ' → ')}`;
    
    blockRoadBtn.style.display = 'flex';
    updateRoadBlockButtonText(road.blocked);
    updateRoadDetails(road);
    lucide.createIcons();
  };

  function updateRoadDetails(road) {
    const kmh = Math.round(road.averageSpeed * 12.5); // Scaled multiplier to feel like km/h
    selectionDetails.textContent = `Lanes: ${road.lanes} | Average Speed: ${kmh} km/h | Congestion: ${Math.round(road.congestion * 100)}% | Active Cars: ${road.vehicles.length}`;
  }

  function updateRoadBlockButtonText(isBlocked) {
    if (isBlocked) {
      blockRoadBtn.classList.remove('danger');
      blockRoadBtn.classList.add('active');
      blockBtnText.textContent = "Clear Roadblock";
    } else {
      blockRoadBtn.classList.add('danger');
      blockRoadBtn.classList.remove('active');
      blockBtnText.textContent = "Place Roadblock";
    }
  }

  blockRoadBtn.addEventListener('click', () => {
    if (currentSelection && currentSelection.id && currentSelection.id.startsWith('E_')) {
      const road = currentSelection;
      road.blocked = !road.blocked;
      
      // Update reverse direction road as well for a two-way block
      const parts = road.id.split('_');
      const revId = `E_${parts[2]}_${parts[1]}`;
      const revRoad = sim.edges.find(e => e.id === revId);
      if (revRoad) {
        revRoad.blocked = road.blocked;
      }

      updateRoadBlockButtonText(road.blocked);
      updateRoadDetails(road);
      
      const statusStr = road.blocked ? "BLOCKED" : "CLEARED";
      showNotification(`Incident reported: ${selectionName.textContent} is now ${statusStr}`, road.blocked ? 'incident' : 'info');
      protocol.logConsole(`INCIDENT_ALERT: Road ${road.id} is ${statusStr}. Re-routing packets...`, "incident");
    }
  });

  // 7. Environment Variables Control
  function updateEnvironmentPredictions() {
    const env = {
      hour: hourSlider.value,
      weather: weatherSelect.value,
      event: eventSelect.value,
      holiday: holidayCheckbox.checked
    };

    // Calculate predictions
    const predictions = ai.predict(env);

    // Update UI numbers
    predDelayIndex.textContent = `${predictions.delayIndex}x`;
    predAccidentRisk.textContent = `${predictions.accidentProb}%`;
    
    if (predictions.accidentProb > 50) {
      predAccidentRisk.style.color = 'var(--accent-red)';
    } else if (predictions.accidentProb > 20) {
      predAccidentRisk.style.color = 'var(--accent-yellow)';
    } else {
      predAccidentRisk.style.color = 'var(--accent-green)';
    }

    // Update hotspots DOM list
    predHotspotsList.innerHTML = '';
    if (predictions.hotspots.length === 0) {
      predHotspotsList.innerHTML = '<div class="text-secondary" style="font-style: italic;">No immediate hotspots predicted.</div>';
    } else {
      predictions.hotspots.forEach(spot => {
        const spotRow = document.createElement('div');
        spotRow.style.display = 'flex';
        spotRow.style.justify = 'space-between';
        spotRow.style.justifyContent = 'space-between';
        
        let colorClass = 'green';
        if (spot.severity > 70) colorClass = 'red';
        else if (spot.severity > 45) colorClass = 'yellow';

        spotRow.innerHTML = `
          <span class="text-secondary" style="font-family: monospace;">${spot.name}</span>
          <span class="stat-value ${colorClass}" style="font-size: 10px;">${spot.severity}% load (${Math.round(spot.avgSpeed * 12)} km/h)</span>
        `;
        predHotspotsList.appendChild(spotRow);
      });
    }

    // Update Line Chart dataset
    const trendValues = predictions.trend.map(t => t.value);
    trendChartInstance.data.datasets[0].data = trendValues;
    trendChartInstance.update();

    // Adjust physical simulation speed limit modifications based on weather
    let weatherFactor = 1.0;
    if (env.weather === 'rain') weatherFactor = 0.75;
    if (env.weather === 'storm') weatherFactor = 0.45;

    sim.edges.forEach(edge => {
      edge.speedLimit = edge.baseSpeedLimit * weatherFactor;
    });

    // Update hour format (e.g. 14.5 -> "14:30")
    const totalMinutes = Math.floor(env.hour * 60);
    const h = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const m = (totalMinutes % 60).toString().padStart(2, '0');
    hourValText.textContent = `${h}:${m}`;
  }

  // Bind environmental triggers
  weatherSelect.addEventListener('change', () => {
    updateEnvironmentPredictions();
    protocol.logConsole(`METEOROLOGY_UPDATE: Atmospheric scan set to [${weatherSelect.value.toUpperCase()}]. Speed regulations adjusted.`, "signal");
  });
  eventSelect.addEventListener('change', () => {
    updateEnvironmentPredictions();
    protocol.logConsole(`CIVIC_EVENT: Public gathering modifier set to [${eventSelect.value.toUpperCase()}]. Demand curves updated.`, "signal");
  });
  holidayCheckbox.addEventListener('change', () => {
    updateEnvironmentPredictions();
    protocol.logConsole(`CALENDAR_SYNC: Holiday status shifted. Dispatch weights updated.`, "signal");
  });
  hourSlider.addEventListener('input', updateEnvironmentPredictions);

  // 8. Smart Signals Control Events
  signalFixedBtn.addEventListener('click', () => {
    signals.setGlobalMode('fixed');
    signalFixedBtn.classList.add('active');
    signalAdaptiveBtn.classList.remove('active');
    signalModeDesc.textContent = "Fixed timing phase loops North-South and East-West intersections on a static timeline, regardless of queue lengths.";
    signals.resetStats();
    showNotification("Traffic control shifted to Fixed Cycle intervals", "info");
    protocol.logConsole("GLOBAL_SIGNAL: Mode switched to FIXED CYCLES. Adaptive queue sensing offline.", "signal");
  });

  signalAdaptiveBtn.addEventListener('click', () => {
    signals.setGlobalMode('adaptive');
    signalAdaptiveBtn.classList.add('active');
    signalFixedBtn.classList.remove('active');
    signalModeDesc.textContent = "AI signals scan intersection queues in real-time, dynamically allocating green time to maximum congestion pressure.";
    signals.resetStats();
    showNotification("Traffic control shifted to AI Adaptive pressure routing", "info");
    protocol.logConsole("GLOBAL_SIGNAL: Mode switched to AI ADAPTIVE pressure signaling. Real-time sensors online.", "signal");
  });

  // 9. Route Path Query & Spawner
  queryRouteBtn.addEventListener('click', () => {
    const srcId = parseInt(routeSrcSelect.value);
    const destId = parseInt(routeDestSelect.value);

    if (srcId === destId) {
      showNotification("Source and Destination intersections must differ", "info");
      return;
    }

    const recs = router.getRouteRecommendations(srcId, destId);

    if (recs.optimized && recs.optimized.path) {
      queryPathOverlay = recs.optimized.path;
      sim.highlightedPath = {
        nodes: recs.optimized.path,
        color: '#cc00ff' // Neon purple
      };

      // Show stats comparison card
      routingResultsCard.style.display = 'block';
      
      const optStats = recs.optimized.stats;
      const staticStats = recs.static.stats;

      const pathNodesStr = recs.optimized.path.map(nId => sim.nodes.find(n => n.id === nId).name.split(' ')[0]).join(' → ');

      routeOptTimeText.innerHTML = `${optStats.time} mins <span style="font-size:9px; color:var(--text-secondary);">(${pathNodesStr})</span>`;
      routeHistTimeText.textContent = `${staticStats.time} mins (Shortest distance path)`;
      
      // Calculate savings percentage
      if (staticStats.time > 0) {
        const savings = Math.max(0, Math.round(((staticStats.time - optStats.time) / staticStats.time) * 100));
        routeSavingsText.textContent = `${savings}% travel latency saved`;
      } else {
        routeSavingsText.textContent = `0% latency saved`;
      }

      showNotification("Dynamic optimal route path plotted", "info");
      protocol.logConsole(`ROUTE_OPTIMIZATION: Shortest path queries Node ${srcId} → Node ${destId}. Adaptive Dijkstra succeeded.`, "routing");
    } else {
      showNotification("No valid paths found! Check for roadblocks.", "info");
      routingResultsCard.style.display = 'none';
      sim.highlightedPath = null;
    }
  });

  deployRouteVehicleBtn.addEventListener('click', () => {
    const srcId = parseInt(routeSrcSelect.value);
    const destId = parseInt(routeDestSelect.value);

    if (srcId === destId) {
      showNotification("Source and Destination intersections must differ", "info");
      return;
    }

    // Recalculate optimal path
    const path = router.findPath(srcId, destId, true);
    if (path) {
      const v = sim.spawnVehicle('car', path);
      if (v) {
        showNotification(`Custom route vehicle [${v.id}] deployed`, 'info');
      }
    } else {
      showNotification("Failed to route test vehicle. Path is blocked.", "info");
    }
  });

  // 10. Emergency "Green Corridor" Mode Spawner
  triggerAmbulanceBtn.addEventListener('click', () => {
    triggerEmergencyAmbulance();
  });

  function triggerEmergencyAmbulance() {
    // Pick node 12 (bottom left) to node 3 (top right) or similar long path
    const startNodeId = 12; // Gateway South
    const endNodeId = 3;    // Hyperlink Gate

    // Compute route (ignoring roadblocks for emergency vehicle dispatcher, but routing weights prefer clear roads)
    const path = router.findPath(startNodeId, endNodeId, true);

    if (path) {
      // Clear previous ambulance
      if (activeAmbulance) {
        activeAmbulance.active = false;
      }

      const v = sim.spawnVehicle('ambulance', path);
      if (v) {
        activeAmbulance = v;
        
        // Activate Green Corridor signaling along path
        signals.applyEmergencyCorridor(path);
        
        // Highlight emergency corridor in neon blue
        sim.highlightedPath = {
          nodes: path,
          color: '#00e5ff' // Neon cyan
        };

        // Show UI Status
        ambulanceStatusContainer.style.display = 'block';
        ambSignalStatus.textContent = "GREEN CORRIDOR DEPLOYED";
        ambSignalStatus.style.color = "var(--accent-blue)";
        ambLocStatus.textContent = `Departing ${sim.nodes.find(n => n.id === startNodeId).name}`;

        hdrSystemMode.innerHTML = `<span class="status-dot pulsing" style="background-color: var(--accent-red); box-shadow: 0 0 8px var(--accent-red);"></span>&nbsp;EMERGENCY CORRIDOR`;
        hdrSystemMode.className = "stat-value red";

        showNotification("EMERGENCY CORRIDOR ACTIVATED: Signals overridden", "emergency");
        protocol.logConsole(`EMERGENCY_DISPATCH: Ambulance ${v.id} deployed on path: ${path.join(' → ')}. Clearing Green Corridor signals...`, "incident");
      }
    } else {
      showNotification("Dispatch failure: No route path could be mapped", "info");
    }
  }

  // 11. Global Notifications Toast system
  let bannerTimer = null;
  function showNotification(message, type = 'info') {
    notifMessage.textContent = message;
    
    // Styling class
    notifBanner.className = 'notification-banner';
    if (type === 'emergency' || type === 'incident') {
      notifBanner.classList.add('emergency');
      notifIcon.setAttribute('data-lucide', 'shield-alert');
    } else {
      notifIcon.setAttribute('data-lucide', 'info');
    }

    lucide.createIcons();
    notifBanner.classList.add('show');

    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      notifBanner.classList.remove('show');
    }, 4000);
  }

  // 12. Simulation Loop & Stats Updater
  let lastFrameTime = 0;
  
  // Throttle updates for graphs and metrics calculation to once per 60 frames (1s)
  let metricsUpdateCounter = 0;

  function runSimulationLoop(timestamp) {
    if (!lastFrameTime) lastFrameTime = timestamp;
    
    // Delta time in terms of target 60fps
    let dt = (timestamp - lastFrameTime) / 16.666;
    if (dt > 3) dt = 3; // cap delta to avoid huge jumps
    lastFrameTime = timestamp;

    // A. Update engine physics
    sim.update(dt);
    
    // B. Update protocol manager
    protocol.update(dt);

    // C. Monitor active ambulance progress
    if (activeAmbulance) {
      if (activeAmbulance.active) {
        signals.updateCorridorProgress(activeAmbulance);
        
        // Update live location string
        const currentTarget = activeAmbulance.route[activeAmbulance.routeIndex + 1];
        if (currentTarget !== undefined) {
          const targetName = sim.nodes.find(n => n.id === currentTarget).name;
          ambLocStatus.textContent = `Heading to ${targetName}`;
        } else {
          ambLocStatus.textContent = "Approaching destination";
        }
      } else {
        // Ambulance reached destination and despawned
        activeAmbulance = null;
        signals.clearEmergencyCorridors();
        sim.highlightedPath = null;
        ambulanceStatusContainer.style.display = 'none';
        
        hdrSystemMode.innerHTML = `<span class="status-dot pulsing"></span>&nbsp;NORMAL RUN`;
        hdrSystemMode.className = "stat-value";
        
        showNotification("Ambulance arrived: Normal signal operations restored", "info");
        protocol.logConsole("EMERGENCY_DISPATCH: Target reached. Release Green Corridor overrides.", "incident");
      }
    }

    // D. Render Canvas
    sim.draw();

    // E. Periodic Metrics Update (Throttle to every 45 frames)
    metricsUpdateCounter += dt;
    if (metricsUpdateCounter >= 45) {
      metricsUpdateCounter = 0;
      updateLiveDashboardMetrics();
    }

    requestAnimationFrame(runSimulationLoop);
  }

  function updateLiveDashboardMetrics() {
    // 1. Vehicle counts and network statistics
    mapStatVehicles.textContent = sim.vehicles.length;
    
    // 2. Average grid congestion ratio
    let totalCongestion = 0;
    sim.edges.forEach(edge => {
      totalCongestion += edge.congestion;
    });
    const avgCongestionRatio = sim.edges.length > 0 ? (totalCongestion / sim.edges.length) : 0;
    const avgCongestionPct = Math.round(avgCongestionRatio * 100);
    mapStatCongestion.textContent = `${avgCongestionPct}%`;
    
    if (avgCongestionPct > 65) {
      mapStatCongestion.style.color = 'var(--accent-red)';
    } else if (avgCongestionPct > 35) {
      mapStatCongestion.style.color = 'var(--accent-yellow)';
    } else {
      mapStatCongestion.style.color = 'var(--accent-green)';
    }

    // 3. Average Speed of overall vehicle grid
    let totalKmh = 0;
    let countedVehicles = 0;
    sim.vehicles.forEach(v => {
      totalKmh += v.speed * 12.5; // pixel-scale to simulated km/h
      countedVehicles++;
    });
    const speedKmh = countedVehicles > 0 ? Math.round(totalKmh / countedVehicles) : 40;
    hdrAvgSpeed.textContent = `${speedKmh} km/h`;

    // 4. Incident alerts (blocked edges)
    const activeBlocksCount = sim.edges.filter(e => e.blocked).length / 2; // Divided by 2 for two-way segments
    hdrIncidents.textContent = `${activeBlocksCount} Blockages`;
    hdrIncidents.className = `stat-value ${activeBlocksCount > 0 ? 'red' : 'blue'}`;

    // 5. Total Grid Node traversals count
    let traversals = 0;
    sim.nodes.forEach(node => {
      traversals += node.vehiclesPassed;
    });
    mapStatThroughput.textContent = `${traversals} nodes`;

    // 6. Signal Delay Metrics comparison calculations
    const stats = signals.getSystemAnalytics();
    signalAvgWaitText.textContent = `${stats.avgWait}s`;
    
    // Convert simulated wait counter to hourly rate
    const vph = Math.round(stats.throughput * 4.5); 
    signalThroughputText.textContent = `${vph} vph`;

    // Update active selection details card in real time
    if (selectionCard.style.display === 'block' && currentSelection) {
      if (currentSelection.id && currentSelection.id.startsWith('E_')) {
        updateRoadDetails(currentSelection);
      }
    }

    // 7. Update Protocol statistics labels
    protoThroughput.textContent = `${Math.round(protocol.stats.txCount / (performance.now() / 1000) * 10) / 10} pkts/s`;
    protoLoss.textContent = `${protocol.stats.packetLoss.toFixed(2)}%`;
    hdrLatency.textContent = `${protocol.stats.avgLatency} ms`;

    // 8. Accumulate analytics history arrays for Fixed vs Adaptive Chart
    const currentMode = sim.nodes[0] && !sim.nodes[0].isRoundabout ? sim.nodes[0].lightState.mode : 'fixed';
    
    // Simulate baseline historical data updates
    if (currentMode === 'fixed') {
      signals.history.fixed.avgWaitTime.push(stats.avgWait);
      // Fixed cycles average delay floats around 40-50s over time
      const histFixedVal = Math.round(stats.avgWait);
      // Keep Adaptive bar showing optimized status from model baseline
      const adaptiveOptimizedVal = Math.max(8, Math.round(histFixedVal * 0.35));
      
      waitComparisonChartInstance.data.datasets[0].data = [histFixedVal, adaptiveOptimizedVal];
      waitComparisonChartInstance.update();
    } else {
      signals.history.adaptive.avgWaitTime.push(stats.avgWait);
      const histAdaptiveVal = Math.max(4, Math.round(stats.avgWait));
      // Compare to fixed baseline wait of approx 38s
      const staticFixedVal = 38;
      
      waitComparisonChartInstance.data.datasets[0].data = [staticFixedVal, histAdaptiveVal];
      waitComparisonChartInstance.update();
    }
  }

  // 13. Spawn initial baseline traffic density (approx 20 vehicles randomly placed)
  function spawnInitialTraffic() {
    for (let i = 0; i < 18; i++) {
      const types = ['car', 'car', 'car', 'truck'];
      const chosenType = types[Math.floor(Math.random() * types.length)];
      sim.spawnVehicle(chosenType);
    }
    updateEnvironmentPredictions();
  }

  // Start Loop
  spawnInitialTraffic();
  requestAnimationFrame(runSimulationLoop);
});
