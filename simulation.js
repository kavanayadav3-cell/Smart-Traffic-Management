// TrafficFlow OS - Digital Twin Simulation Engine

class TrafficNode {
  constructor(id, name, x, y, isRoundabout = false) {
    this.id = id;
    this.name = name;
    this.x = x;
    this.y = y;
    this.isRoundabout = isRoundabout;
    
    // Traffic Light System
    this.lightState = {
      mode: 'fixed', // 'fixed' or 'adaptive'
      activePhase: 'NS', // 'NS' (North-South) or 'EW' (East-West)
      color: 'green', // 'green', 'yellow', 'red'
      timer: 0,
      phaseDuration: 300, // frames for green (approx 5s at 60fps)
      yellowDuration: 90, // frames for yellow (approx 1.5s)
      adaptiveCooldown: 0,
      emergencyOverride: false
    };
    
    // Analytics
    this.vehiclesPassed = 0;
    this.accumulatedWaitTime = 0;
  }

  updateLight(incomingEdges, activeVehicles) {
    if (this.isRoundabout) {
      this.lightState.color = 'green';
      return;
    }

    // Cooldown decrement
    if (this.lightState.adaptiveCooldown > 0) {
      this.lightState.adaptiveCooldown--;
    }

    // Emergency Override check
    if (this.lightState.emergencyOverride) {
      return; 
    }

    this.lightState.timer++;

    if (this.lightState.mode === 'fixed') {
      const greenPeriod = this.lightState.phaseDuration;
      const yellowPeriod = this.lightState.yellowDuration;
      const cyclePeriod = greenPeriod + yellowPeriod;

      if (this.lightState.timer >= cyclePeriod) {
        this.lightState.timer = 0;
        this.lightState.activePhase = this.lightState.activePhase === 'NS' ? 'EW' : 'NS';
        this.lightState.color = 'green';
      } else if (this.lightState.timer >= greenPeriod) {
        this.lightState.color = 'yellow';
      } else {
        this.lightState.color = 'green';
      }
    } else {
      // Adaptive Timing Logic (Pressure / Queue-length minimization)
      if (this.lightState.adaptiveCooldown === 0) {
        let nsQueue = 0;
        let ewQueue = 0;

        incomingEdges.forEach(edge => {
          if (edge.target === this.id) {
            const dir = edge.direction; // 'N', 'S', 'E', 'W'
            const queueCount = edge.vehicles.filter(v => v.speed < 0.8).length;
            if (dir === 'N' || dir === 'S') {
              nsQueue += queueCount;
            } else {
              ewQueue += queueCount;
            }
          }
        });

        const activePhase = this.lightState.activePhase;
        const currentQueue = activePhase === 'NS' ? nsQueue : ewQueue;
        const opposingQueue = activePhase === 'NS' ? ewQueue : nsQueue;

        const timeInPhase = this.lightState.timer;
        const minTime = 120; // 2 seconds
        const maxTime = 600; // 10 seconds force switch

        if (timeInPhase >= minTime) {
          let shouldSwitch = false;
          if (opposingQueue > currentQueue + 2 && currentQueue < 4) {
            shouldSwitch = true;
          } else if (currentQueue === 0 && opposingQueue > 0) {
            shouldSwitch = true;
          } else if (timeInPhase >= maxTime) {
            shouldSwitch = true;
          }

          if (shouldSwitch) {
            if (this.lightState.color === 'green') {
              this.lightState.color = 'yellow';
              this.lightState.timer = 0;
            } else if (this.lightState.color === 'yellow' && timeInPhase >= this.lightState.yellowDuration) {
              this.lightState.activePhase = activePhase === 'NS' ? 'EW' : 'NS';
              this.lightState.color = 'green';
              this.lightState.timer = 0;
              this.lightState.adaptiveCooldown = 180;
            }
          }
        }
      }

      if (this.lightState.color === 'yellow' && this.lightState.timer >= this.lightState.yellowDuration) {
        this.lightState.activePhase = this.lightState.activePhase === 'NS' ? 'EW' : 'NS';
        this.lightState.color = 'green';
        this.lightState.timer = 0;
        this.lightState.adaptiveCooldown = 180;
      }
    }
  }
}

class TrafficEdge {
  constructor(id, sourceNode, targetNode, lanes = 2, speedLimit = 4) {
    this.id = id;
    this.source = sourceNode.id;
    this.target = targetNode.id;
    this.sourceX = sourceNode.x;
    this.sourceY = sourceNode.y;
    this.targetX = targetNode.x;
    this.targetY = targetNode.y;
    this.lanes = lanes;
    this.speedLimit = speedLimit;
    
    const dx = this.targetX - this.sourceX;
    const dy = this.targetY - this.sourceY;
    this.length = Math.sqrt(dx * dx + dy * dy);
    
    if (Math.abs(dx) > Math.abs(dy)) {
      this.direction = dx > 0 ? 'E' : 'W';
    } else {
      this.direction = dy > 0 ? 'S' : 'N';
    }

    this.vehicles = [];
    this.blocked = false;
    this.congestion = 0;
    this.averageSpeed = speedLimit;
    this.priorityLevel = 1;
  }

  updateMetrics() {
    if (this.vehicles.length === 0) {
      this.congestion = 0;
      this.averageSpeed = this.speedLimit;
      return;
    }

    const speeds = this.vehicles.map(v => v.speed);
    const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    this.averageSpeed = avgSpeed;

    const maxCapacity = (this.length / 32) * this.lanes;
    const densityRatio = this.vehicles.length / maxCapacity;
    const speedRatio = 1 - (avgSpeed / this.speedLimit);
    
    this.congestion = Math.min(1.0, Math.max(0.0, (densityRatio * 0.6) + (speedRatio * 0.4)));
    if (this.blocked) {
      this.congestion = 1.0;
      this.averageSpeed = 0;
    }
  }
}

class Vehicle {
  constructor(id, type, route, allEdges) {
    this.id = id;
    this.type = type;
    this.route = route;
    this.routeIndex = 0;
    this.allEdges = allEdges;
    
    this.currentEdge = this.findEdge(route[0], route[1]);
    this.distance = 0;
    
    this.maxSpeed = this.currentEdge ? this.currentEdge.speedLimit : 3;
    if (type === 'truck') this.maxSpeed *= 0.75;
    if (type === 'ambulance') this.maxSpeed *= 1.4;
    
    this.speed = this.maxSpeed;
    this.width = type === 'truck' ? 18 : (type === 'ambulance' ? 15 : 12);
    this.length = type === 'truck' ? 26 : (type === 'ambulance' ? 22 : 18);
    this.color = this.getDefaultColor();
    this.waitingTime = 0;
    this.distanceTravelledTotal = 0;
    this.active = true;

    if (this.currentEdge) {
      this.currentEdge.vehicles.push(this);
    } else {
      this.active = false;
    }

    this.lane = Math.floor(Math.random() * (this.currentEdge ? this.currentEdge.lanes : 2));
  }

  getDefaultColor() {
    if (this.type === 'ambulance') return '#00e5ff';
    if (this.type === 'truck') return '#a855f7';
    return '#10b981';
  }

  findEdge(sourceId, targetId) {
    return this.allEdges.find(e => e.source === sourceId && e.target === targetId);
  }

  update(dt, nodes, allEdges) {
    if (!this.active || !this.currentEdge) return;

    if (this.currentEdge.blocked) {
      const roadblockDist = this.currentEdge.length * 0.5;
      if (this.distance < roadblockDist) {
        this.decelerateTo(0, roadblockDist - this.distance);
      } else {
        this.speed = 0;
      }
      this.waitingTime++;
      return;
    }

    let leadingVehicle = null;
    let minGap = Infinity;
    this.currentEdge.vehicles.forEach(v => {
      if (v.id !== this.id && v.lane === this.lane && v.distance > this.distance) {
        const gap = v.distance - this.distance - v.length;
        if (gap < minGap) {
          minGap = gap;
          leadingVehicle = v;
        }
      }
    });

    let trafficLightStop = false;
    const targetNode = nodes.find(n => n.id === this.currentEdge.target);
    const distToLight = this.currentEdge.length - this.distance;
    
    if (targetNode && !targetNode.isRoundabout && distToLight < 80) {
      const light = targetNode.lightState;
      const isGreenPhase = 
        (this.currentEdge.direction === 'N' || this.currentEdge.direction === 'S') ? 
        (light.activePhase === 'NS') : (light.activePhase === 'EW');
      
      const isRedOrYellow = light.color === 'red' || light.color === 'yellow';

      if (isRedOrYellow && !isGreenPhase) {
        if (this.type === 'ambulance' && light.emergencyOverride) {
          trafficLightStop = false; 
        } else {
          trafficLightStop = true;
        }
      }
    }

    let targetSpeed = this.maxSpeed;
    if (leadingVehicle) {
      const safeGap = 35 + (this.speed * 4);
      if (minGap < safeGap) {
        targetSpeed = leadingVehicle.speed * Math.max(0, (minGap / safeGap));
      }
    }

    if (trafficLightStop) {
      const stopLineOffset = 25;
      const stopGap = distToLight - stopLineOffset;
      if (stopGap > 0) {
        targetSpeed = Math.min(targetSpeed, this.maxSpeed * (stopGap / 60));
      } else {
        targetSpeed = 0;
      }
    }

    if (this.speed < targetSpeed) {
      this.speed = Math.min(this.maxSpeed, this.speed + 0.15 * dt);
    } else if (this.speed > targetSpeed) {
      this.speed = Math.max(0, this.speed - 0.25 * dt);
    }

    if (this.speed < 0.1) {
      this.waitingTime++;
      if (targetNode) {
        targetNode.accumulatedWaitTime += 1;
      }
    }

    this.distance += this.speed * dt;
    this.distanceTravelledTotal += this.speed * dt;

    if (leadingVehicle && leadingVehicle.speed < this.maxSpeed * 0.5 && Math.random() < 0.01) {
      if (this.currentEdge.lanes > 1) {
        const nextLane = (this.lane + 1) % this.currentEdge.lanes;
        let laneClear = true;
        this.currentEdge.vehicles.forEach(v => {
          if (v.lane === nextLane && Math.abs(v.distance - this.distance) < 40) {
            laneClear = false;
          }
        });
        if (laneClear) {
          this.lane = nextLane;
        }
      }
    }

    if (this.distance >= this.currentEdge.length) {
      this.routeIndex++;
      
      const idx = this.currentEdge.vehicles.indexOf(this);
      if (idx > -1) this.currentEdge.vehicles.splice(idx, 1);

      if (this.routeIndex < this.route.length - 1) {
        const nextSource = this.route[this.routeIndex];
        const nextTarget = this.route[this.routeIndex + 1];
        const nextEdge = this.findEdge(nextSource, nextTarget);
        
        if (targetNode) targetNode.vehiclesPassed++;

        if (nextEdge) {
          this.currentEdge = nextEdge;
          this.distance = 0;
          this.currentEdge.vehicles.push(this);
          this.maxSpeed = this.currentEdge.speedLimit;
          if (this.type === 'truck') this.maxSpeed *= 0.75;
          if (this.type === 'ambulance') this.maxSpeed *= 1.4;
          this.lane = Math.floor(Math.random() * this.currentEdge.lanes);
        } else {
          this.active = false;
        }
      } else {
        this.active = false;
      }
    }
  }

  decelerateTo(targetSpeed, distanceToStop) {
    if (distanceToStop <= 10) {
      this.speed = targetSpeed;
    } else {
      this.speed = Math.max(targetSpeed, this.speed - (this.speed * this.speed) / (2 * distanceToStop));
    }
  }
}

class Simulation {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    
    this.nodes = [];
    this.edges = [];
    this.vehicles = [];
    
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1.0;
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    
    this.isPlaying = true;
    this.speedMultiplier = 1;
    this.vehicleIdCounter = 0;
    this.selectedRoad = null;
    this.selectedNode = null;
    
    this.highlightedPath = null;
    
    this.setupNetwork();
    this.bindEvents();
  }

  setupNetwork() {
    // Structured city coordinates
    const gridSpacingX = 230;
    const gridSpacingY = 190;
    const startX = 135;
    const startY = 100;
    
    const names = [
      "West Gate Hub", "Science Park North", "Grand Square Center", "East Station Terminal",
      "North Boulevard Way", "Tech District Center", "River Bypass Junction", "East Boundary Gate",
      "West Boulevard Loop", "Financial Crossway", "Bridge North Sector", "Port Loading Dock",
      "Gateway South Arch", "Industrial Zone Depot", "Bridge South Sector", "Cloud Datacenter Hub"
    ];

    // Generate strict grid coords
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const id = r * 4 + c;
        const x = startX + c * gridSpacingX;
        const y = startY + r * gridSpacingY;
        const isRoundabout = (id === 5 || id === 10);
        this.nodes.push(new TrafficNode(id, names[id], x, y, isRoundabout));
      }
    }

    const connect = (from, to, lanes = 2, speed = 4) => {
      const nodeA = this.nodes.find(n => n.id === from);
      const nodeB = this.nodes.find(n => n.id === to);
      if (nodeA && nodeB) {
        this.edges.push(new TrafficEdge(`E_${from}_${to}`, nodeA, nodeB, lanes, speed));
        this.edges.push(new TrafficEdge(`E_${to}_${from}`, nodeB, nodeA, lanes, speed));
      }
    };

    // Horizontal links
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        const id = r * 4 + c;
        if (r === 2) {
          connect(id, id + 1, 3, 5.5); // Expressway Row
        } else {
          connect(id, id + 1, 2, 4);
        }
      }
    }

    // Vertical links
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 3; r++) {
        const id = r * 4 + c;
        if (c === 1) {
          connect(id, id + 4, 3, 4.5); // Avenue Column
        } else {
          connect(id, id + 4, 2, 3.5);
        }
      }
    }

    // Diagonal shortcut link
    connect(0, 5, 2, 5.0);
    connect(5, 10, 2, 5.0);
    connect(10, 15, 2, 5.0);
  }

  bindEvents() {
    this.canvas.addEventListener('mousedown', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const { mapX, mapY } = this.screenToMap(mouseX, mouseY);
      
      let clickedNode = null;
      this.nodes.forEach(node => {
        const dist = Math.hypot(node.x - mapX, node.y - mapY);
        if (dist < 22) { // larger clicked radius matching layout
          clickedNode = node;
        }
      });

      let clickedEdge = null;
      if (!clickedNode) {
        this.edges.forEach(edge => {
          const d = this.distToSegment(mapX, mapY, edge.sourceX, edge.sourceY, edge.targetX, edge.targetY);
          if (d < 15) {
            clickedEdge = edge;
          }
        });
      }

      if (clickedNode) {
        this.selectedNode = clickedNode;
        this.selectedRoad = null;
        if (this.onSelectNode) this.onSelectNode(clickedNode);
      } else if (clickedEdge) {
        this.selectedRoad = clickedEdge;
        this.selectedNode = null;
        if (this.onSelectRoad) this.onSelectRoad(clickedEdge);
      } else {
        this.isDragging = true;
        this.dragStart = { x: e.clientX - this.panX, y: e.clientY - this.panY };
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        this.panX = e.clientX - this.dragStart.x;
        this.panY = e.clientY - this.dragStart.y;
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const { mapX, mapY } = this.screenToMap(mouseX, mouseY);
      
      const zoomFactor = 1.1;
      if (e.deltaY < 0) {
        this.zoom = Math.min(2.5, this.zoom * zoomFactor);
      } else {
        this.zoom = Math.max(0.4, this.zoom / zoomFactor);
      }
      
      this.panX = mouseX - mapX * this.zoom;
      this.panY = mouseY - mapY * this.zoom;
    });

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = this.canvas.parentElement.clientWidth;
      const h = this.canvas.parentElement.clientHeight;
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.ctx.scale(dpr, dpr);
    };
    window.addEventListener('resize', resizeCanvas);
    setTimeout(resizeCanvas, 50);
  }

  screenToMap(sx, sy) {
    return {
      mapX: (sx - this.panX) / this.zoom,
      mapY: (sy - this.panY) / this.zoom
    };
  }

  distToSegment(px, py, x1, y1, x2, y2) {
    const l2 = Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2);
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
  }

  spawnVehicle(type = 'car', specificRoute = null) {
    let route = specificRoute;
    
    if (!route) {
      const start = this.nodes[Math.floor(Math.random() * this.nodes.length)];
      let end = start;
      while (end.id === start.id) {
        end = this.nodes[Math.floor(Math.random() * this.nodes.length)];
      }
      
      if (this.router) {
        route = this.router.findPath(start.id, end.id, false);
      }
    }

    if (route && route.length >= 2) {
      const vId = `V_${++this.vehicleIdCounter}`;
      const v = new Vehicle(vId, type, route, this.edges);
      if (v.active) {
        this.vehicles.push(v);
        return v;
      }
    }
    return null;
  }

  update(dt) {
    if (!this.isPlaying) return;

    const actualDt = dt * this.speedMultiplier;

    this.nodes.forEach(node => {
      node.updateLight(this.edges, this.vehicles);
    });

    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      v.update(actualDt, this.nodes, this.edges);
      
      if (!v.active) {
        if (v.currentEdge) {
          const idx = v.currentEdge.vehicles.indexOf(v);
          if (idx > -1) v.currentEdge.vehicles.splice(idx, 1);
        }
        this.vehicles.splice(i, 1);
      }
    }

    this.edges.forEach(edge => edge.updateMetrics());
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    
    ctx.clearRect(0, 0, w, h);
    
    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    // 1. Draw Districts (Background)
    this.drawDistricts(ctx);

    // 2. Draw River (Background)
    this.drawRiver(ctx);

    // 3. Draw Grid lines
    this.drawGrid(ctx);

    // 4. Draw Highlighted Route overlay (under roads)
    if (this.highlightedPath && this.highlightedPath.nodes.length >= 2) {
      this.drawRouteOverlay(ctx, this.highlightedPath);
    }

    // 5. Draw Roads (Edges)
    this.edges.forEach(edge => this.drawRoad(ctx, edge));

    // 6. Draw Roadblocks & Incidents
    this.edges.forEach(edge => this.drawIncidents(ctx, edge));

    // 7. Draw Custom Traffic Protocol Packets (handled in protocol.js)
    if (this.drawProtocolPackets) {
      this.drawProtocolPackets(ctx);
    }

    // 8. Draw Vehicles
    this.vehicles.forEach(vehicle => this.drawVehicle(ctx, vehicle));

    // 9. Draw Intersections (Nodes) & Signals
    this.nodes.forEach(node => this.drawNode(ctx, node));

    ctx.restore();
  }

  drawGrid(ctx) {
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.02)';
    ctx.lineWidth = 1;
    const gridSize = 100;
    
    const minX = -1000;
    const maxX = 2500;
    const minY = -1000;
    const maxY = 2500;

    for (let x = minX; x <= maxX; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, minY);
      ctx.lineTo(x, maxY);
      ctx.stroke();
    }
    for (let y = minY; y <= maxY; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(minX, y);
      ctx.lineTo(maxX, y);
      ctx.stroke();
    }
  }

  drawRiver(ctx) {
    ctx.save();
    // Soft glowing cyan waterway
    ctx.strokeStyle = 'rgba(0, 150, 255, 0.08)';
    ctx.lineWidth = 90;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-200, 310);
    ctx.bezierCurveTo(200, 330, 600, 480, 1200, 520);
    ctx.stroke();

    // River banks
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Add river label text
    ctx.fillStyle = 'rgba(0, 229, 255, 0.25)';
    ctx.font = 'bold italic 10px Outfit';
    ctx.fillText("NEON CANAL WATERWAY", 260, 360);

    ctx.restore();
  }

  drawDistricts(ctx) {
    ctx.save();
    
    const drawZone = (x, y, w, h, fill, label, border) => {
      ctx.fillStyle = fill;
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      this.roundRect(ctx, x, y, w, h, 12, true, true);
      
      // Label text
      ctx.fillStyle = border;
      ctx.font = 'bold 9px Outfit';
      ctx.letterSpacing = '1px';
      ctx.fillText(label, x + 15, y + 20);
    };

    // A. Tech Innovation Campus
    drawZone(35, 30, 250, 180, 'rgba(0, 229, 255, 0.02)', "TECH INNOVATION PARK", 'rgba(0, 229, 255, 0.08)');

    // B. Central Green Park
    drawZone(365, 30, 455, 140, 'rgba(16, 185, 129, 0.02)', "CENTRAL FORESTRY PRESERVE", 'rgba(16, 185, 129, 0.08)');

    // C. Downtown Business Sector
    drawZone(315, 220, 280, 210, 'rgba(213, 0, 249, 0.02)', "DOWNTOWN FINANCIAL SECTOR", 'rgba(213, 0, 249, 0.08)');

    // D. Port Industrial docks
    drawZone(630, 420, 260, 310, 'rgba(255, 214, 0, 0.02)', "PORT TERMINAL LOGISTICS HUB", 'rgba(255, 214, 0, 0.08)');

    ctx.restore();
  }

  drawRoad(ctx, edge) {
    const isSelected = this.selectedRoad && this.selectedRoad.id === edge.id;
    const offset = 5.5; 
    
    const dx = edge.targetX - edge.sourceX;
    const dy = edge.targetY - edge.sourceY;
    const len = edge.length;
    const px = -dy / len;
    const py = dx / len;

    const roadWidth = edge.lanes * 11;

    ctx.save();
    
    // Draw bridge structure if crossing the canal
    const bridges = ['E_4_8', 'E_8_4', 'E_5_9', 'E_9_5', 'E_10_14', 'E_14_10', 'E_11_15', 'E_15_11'];
    if (bridges.includes(edge.id)) {
      ctx.save();
      // Thick base bridge plate
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = roadWidth + 14;
      ctx.beginPath();
      ctx.moveTo(edge.sourceX, edge.sourceY);
      ctx.lineTo(edge.targetX, edge.targetY);
      ctx.stroke();
      
      // Steel truss barriers
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.6)'; // Blue glow bridge rail
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(edge.sourceX - px * (roadWidth/2 + 4), edge.sourceY - py * (roadWidth/2 + 4));
      ctx.lineTo(edge.targetX - px * (roadWidth/2 + 4), edge.targetY - py * (roadWidth/2 + 4));
      ctx.moveTo(edge.sourceX + px * (roadWidth/2 + 4), edge.sourceY + py * (roadWidth/2 + 4));
      ctx.lineTo(edge.targetX + px * (roadWidth/2 + 4), edge.targetY + py * (roadWidth/2 + 4));
      ctx.stroke();
      ctx.restore();
    }

    ctx.translate(px * offset, py * offset);

    // Congestion colors
    let roadGlowColor = 'rgba(16, 185, 129, 0.05)';
    if (edge.blocked) {
      roadGlowColor = 'rgba(255, 23, 68, 0.2)'; 
    } else if (edge.congestion > 0.75) {
      roadGlowColor = 'rgba(255, 23, 68, 0.15)'; 
    } else if (edge.congestion > 0.4) {
      roadGlowColor = 'rgba(255, 214, 0, 0.1)'; 
    }

    ctx.strokeStyle = roadGlowColor;
    ctx.lineWidth = roadWidth + 8;
    ctx.beginPath();
    ctx.moveTo(edge.sourceX, edge.sourceY);
    ctx.lineTo(edge.targetX, edge.targetY);
    ctx.stroke();

    // Road body
    ctx.strokeStyle = isSelected ? '#1e293b' : '#0e1423';
    if (edge.blocked) ctx.strokeStyle = '#1d1218';
    ctx.lineWidth = roadWidth;
    ctx.beginPath();
    ctx.moveTo(edge.sourceX, edge.sourceY);
    ctx.lineTo(edge.targetX, edge.targetY);
    ctx.stroke();

    // Side border highlights
    ctx.strokeStyle = isSelected ? 'rgba(0, 229, 255, 0.7)' : 'rgba(255, 255, 255, 0.05)';
    if (edge.blocked) ctx.strokeStyle = 'rgba(255, 23, 68, 0.4)';
    ctx.lineWidth = 1;
    
    ctx.beginPath();
    ctx.moveTo(edge.sourceX - px * (roadWidth/2), edge.sourceY - py * (roadWidth/2));
    ctx.lineTo(edge.targetX - px * (roadWidth/2), edge.targetY - py * (roadWidth/2));
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(edge.sourceX + px * (roadWidth/2), edge.sourceY + py * (roadWidth/2));
    ctx.lineTo(edge.targetX + px * (roadWidth/2), edge.targetY + py * (roadWidth/2));
    ctx.stroke();

    // Dividers
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([8, 12]);
    for (let l = 1; l < edge.lanes; l++) {
      const laneOffset = -roadWidth/2 + l * 11;
      ctx.beginPath();
      ctx.moveTo(edge.sourceX + px * laneOffset, edge.sourceY + py * laneOffset);
      ctx.lineTo(edge.targetX + px * laneOffset, edge.targetY + py * laneOffset);
      ctx.stroke();
    }
    ctx.setLineDash([]); 

    // Zebra Crosswalk block lines at end of lanes
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 4;
    const crosswalkDist = len - 26;
    const ratio = crosswalkDist / len;
    
    const cwStartX = edge.sourceX + dx * ratio - px * (roadWidth/2);
    const cwStartY = edge.sourceY + dy * ratio - py * (roadWidth/2);
    const cwEndX = edge.sourceX + dx * ratio + px * (roadWidth/2);
    const cwEndY = edge.sourceY + dy * ratio + py * (roadWidth/2);

    ctx.beginPath();
    ctx.moveTo(cwStartX, cwStartY);
    ctx.lineTo(cwEndX, cwEndY);
    ctx.stroke();
    ctx.restore();

    // Lane Chevron Flow indicators
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    const headingAngle = Math.atan2(dy, dx);
    const points = [0.25, 0.5, 0.75];
    points.forEach(pt => {
      const ax = edge.sourceX + dx * pt;
      const ay = edge.sourceY + dy * pt;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(headingAngle);
      
      ctx.beginPath();
      ctx.moveTo(-4, -3);
      ctx.lineTo(1, 0);
      ctx.lineTo(-4, 3);
      ctx.stroke();
      ctx.restore();
    });
    ctx.restore();

    ctx.restore();
  }

  drawIncidents(ctx, edge) {
    if (!edge.blocked) return;

    const midX = (edge.sourceX + edge.targetX) / 2;
    const midY = (edge.sourceY + edge.targetY) / 2;
    const dx = edge.targetX - edge.sourceX;
    const dy = edge.targetY - edge.sourceY;
    const len = Math.hypot(dx, dy);

    ctx.save();
    ctx.translate(midX, midY);
    const angle = Math.atan2(dy, dx);
    ctx.rotate(angle);

    const width = 34;
    ctx.fillStyle = '#ff1744';
    ctx.fillRect(-width/2, -10, width, 4);
    
    ctx.strokeStyle = '#ffd600';
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(-width/2, -8);
    ctx.lineTo(width/2, -8);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#ff1744';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText("CLOSED", 0, 5);

    ctx.restore();
  }

  drawVehicle(ctx, v) {
    if (!v.currentEdge) return;

    const edge = v.currentEdge;
    const dx = edge.targetX - edge.sourceX;
    const dy = edge.targetY - edge.sourceY;
    const len = edge.length;
    
    const px = -dy / len;
    const py = dx / len;

    const roadWidth = edge.lanes * 11;
    const laneOffset = -roadWidth/2 + (v.lane * 11) + 5.5;
    const roadSpacing = 5.5; 

    const ratio = v.distance / len;
    const vx = edge.sourceX + dx * ratio + px * (laneOffset + roadSpacing);
    const vy = edge.sourceY + dy * ratio + py * (laneOffset + roadSpacing);

    ctx.save();
    ctx.translate(vx, vy);
    const headingAngle = Math.atan2(dy, dx);
    ctx.rotate(headingAngle);

    let glowColor = 'rgba(16, 185, 129, 0.15)';
    let borderHex = v.color;
    
    if (v.type === 'ambulance') {
      glowColor = 'rgba(0, 229, 255, 0.4)';
    } else if (v.speed < 0.2) {
      glowColor = 'rgba(255, 23, 68, 0.35)'; 
      borderHex = '#ff1744';
    } else if (v.speed < v.maxSpeed * 0.5) {
      glowColor = 'rgba(255, 214, 0, 0.2)'; 
      borderHex = '#ffd600';
    }

    ctx.shadowColor = borderHex;
    ctx.shadowBlur = v.type === 'ambulance' ? 10 : 3;

    ctx.fillStyle = v.type === 'ambulance' ? '#00e5ff' : 'rgba(15, 22, 42, 0.95)';
    ctx.strokeStyle = borderHex;
    ctx.lineWidth = 1.5;
    
    this.roundRect(ctx, -v.length/2, -v.width/2, v.length, v.width, 3, true, true);

    // Headlight Indicators (Tiny yellow circles on front of car rectangle)
    ctx.shadowBlur = 0;
    ctx.fillStyle = v.speed < 0.2 ? '#ff1744' : '#ffffff';
    ctx.beginPath();
    ctx.arc(v.length/2, -v.width/4, 1.5, 0, Math.PI * 2);
    ctx.arc(v.length/2, v.width/4, 1.5, 0, Math.PI * 2);
    ctx.fill();

    if (v.type === 'ambulance') {
      const flash = Math.floor(Date.now() / 150) % 2 === 0;
      ctx.fillStyle = flash ? '#ff1744' : '#2979ff';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  drawNode(ctx, node) {
    const isSelected = this.selectedNode && this.selectedNode.id === node.id;
    
    ctx.save();
    ctx.shadowBlur = isSelected ? 12 : 0;
    ctx.shadowColor = '#00e5ff';

    // Node structure
    ctx.fillStyle = node.isRoundabout ? '#0e172a' : '#070a13';
    ctx.strokeStyle = isSelected ? '#00e5ff' : (node.isRoundabout ? '#d500f9' : 'rgba(255, 255, 255, 0.12)');
    ctx.lineWidth = node.isRoundabout ? 2.5 : 1.5;
    
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.isRoundabout ? 24 : 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Active Signal Indicator bulbs on incoming lanes
    if (!node.isRoundabout) {
      this.edges.forEach(edge => {
        if (edge.target === node.id) {
          const dx = edge.targetX - edge.sourceX;
          const dy = edge.targetY - edge.sourceY;
          const len = edge.length;
          
          const px = -dy / len;
          const py = dx / len;
          
          const roadWidth = edge.lanes * 11;
          const roadSpacing = 5.5;
          const laneOffset = -roadWidth/2 + 5.5; 
          
          // Bulbs positioned precisely 23px from intersection center
          const tDist = len - 23;
          const tx = edge.sourceX + dx * (tDist / len) + px * (laneOffset + roadSpacing + (edge.lanes - 1) * 5.5);
          const ty = edge.sourceY + dy * (tDist / len) + py * (laneOffset + roadSpacing + (edge.lanes - 1) * 5.5);
          
          const light = node.lightState;
          const isGreenPhase = 
            (edge.direction === 'N' || edge.direction === 'S') ? 
            (light.activePhase === 'NS') : (light.activePhase === 'EW');
             
          let colorHex = '#ff1744';
          if (isGreenPhase) {
            colorHex = light.color === 'green' ? '#00e676' : '#ffd600';
          }
          if (light.emergencyOverride) {
            colorHex = isGreenPhase ? '#00e5ff' : '#ff1744';
          }

          // Draw Glowing bulb
          ctx.save();
          ctx.shadowColor = colorHex;
          ctx.shadowBlur = 8;
          ctx.fillStyle = colorHex;
          ctx.beginPath();
          ctx.arc(tx, ty, 4.5, 0, Math.PI * 2);
          ctx.fill();
          
          // Outer black outline ring
          ctx.shadowBlur = 0;
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(tx, ty, 4.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      });
    } else {
      // Circular arrow indicator inside roundabout
      ctx.strokeStyle = 'rgba(213, 0, 249, 0.4)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(node.x, node.y, 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Modern Capsule Label
    ctx.shadowBlur = 0;
    ctx.font = 'bold 9px Outfit';
    const labelText = node.name.toUpperCase();
    const labelWidth = ctx.measureText(labelText).width;
    const pillW = labelWidth + 14;
    const pillH = 15;
    const pillY = node.y - (node.isRoundabout ? 36 : 28);

    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = isSelected ? '#00e5ff' : 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, node.x - pillW/2, pillY - pillH/2, pillW, pillH, 7, true, true);

    ctx.fillStyle = isSelected ? '#00e5ff' : '#f1f5f9';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, node.x, pillY);

    // Delay hotspot indicators (red shading)
    const currentWait = node.accumulatedWaitTime;
    if (currentWait > 500 && !node.isRoundabout) {
      const scale = Math.min(12, Math.floor(currentWait / 400));
      ctx.fillStyle = 'rgba(255, 23, 68, 0.1)';
      ctx.beginPath();
      ctx.arc(node.x, node.y, 15 + scale, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  drawRouteOverlay(ctx, pathObj) {
    ctx.save();
    ctx.strokeStyle = pathObj.color || '#cc00ff';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.35;
    ctx.shadowColor = pathObj.color || '#cc00ff';
    ctx.shadowBlur = 10;

    ctx.beginPath();
    pathObj.nodes.forEach((nId, idx) => {
      const node = this.nodes.find(n => n.id === nId);
      if (node) {
        if (idx === 0) ctx.moveTo(node.x, node.y);
        else ctx.lineTo(node.x, node.y);
      }
    });
    ctx.stroke();
    ctx.restore();
  }

  roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    if (typeof radius === 'undefined') radius = 5;
    if (typeof radius === 'number') {
      radius = {tl: radius, tr: radius, br: radius, bl: radius};
    } else {
      var defaultRadius = {tl: 0, tr: 0, br: 0, bl: 0};
      for (var side in defaultRadius) {
        radius[side] = radius[side] || defaultRadius[side];
      }
    }
    ctx.beginPath();
    ctx.moveTo(x + radius.tl, y);
    ctx.lineTo(x + width - radius.tr, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
    ctx.lineTo(x + width, y + height - radius.br);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
    ctx.lineTo(x + radius.bl, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
    ctx.lineTo(x, y + radius.tl);
    ctx.quadraticCurveTo(x, y, x + radius.tl, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }
}
