// TrafficFlow OS - Digital Twin Traffic Packet Protocol

class TrafficPacket {
  constructor(id, edge, priority = 1) {
    this.id = id;
    this.roadId = edge.id;
    this.congestionScore = Math.round(edge.congestion * 100) / 100;
    this.avgSpeed = Math.round(edge.averageSpeed * 10) / 10;
    this.incidentFlag = edge.blocked;
    this.priorityLevel = priority;
    this.timestamp = Date.now();

    // Spawn positioning (from edge source to target)
    this.sourceX = edge.sourceX;
    this.sourceY = edge.sourceY;
    this.targetX = edge.targetX;
    this.targetY = edge.targetY;
    
    // Perpendicular spacing offset for visual clarity (center of road lanes)
    const dx = this.targetX - this.sourceX;
    const dy = this.targetY - this.sourceY;
    const len = Math.hypot(dx, dy);
    this.px = -dy / len;
    this.py = dx / len;
    
    // Adjust packet to travel slightly off-center
    this.offset = -12; 

    this.progress = 0.0;
    this.speed = 0.02 + Math.random() * 0.015; // travel speed ratio per frame
    this.active = true;
  }

  update(dt) {
    this.progress += this.speed * dt;
    if (this.progress >= 1.0) {
      this.progress = 1.0;
      this.active = false; // Reached target node
    }
  }

  draw(ctx) {
    const x = this.sourceX + (this.targetX - this.sourceX) * this.progress + this.px * this.offset;
    const y = this.sourceY + (this.targetY - this.sourceY) * this.progress + this.py * this.offset;

    ctx.save();
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#00e5ff';
    ctx.fillStyle = '#00e5ff';
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
    ctx.lineWidth = 1;

    // Small glowing packet dot
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Ripple effect
    const rippleRadius = 4 + (Math.sin(Date.now() / 100) * 2);
    ctx.beginPath();
    ctx.arc(x, y, rippleRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}

class TrafficProtocolManager {
  constructor(simulation, consoleElementId) {
    this.sim = simulation;
    this.consoleId = consoleElementId;
    this.packets = [];
    this.packetCounter = 0;
    
    // Connect simulation draw hook
    this.sim.drawProtocolPackets = (ctx) => this.drawPackets(ctx);
    
    // Network Statistics
    this.stats = {
      txCount: 0,
      rxCount: 0,
      avgLatency: 8.5, // ms (simulated)
      packetLoss: 0.0
    };

    // Protocol timer for spawning packets
    this.spawnTimer = 0;
    this.spawnInterval = 30; // Spawn packets every 30 frames
  }

  update(dt) {
    // 1. Progress active packets
    for (let i = this.packets.length - 1; i >= 0; i--) {
      const packet = this.packets[i];
      packet.update(dt);

      if (!packet.active) {
        // Reached destination: trigger reception
        this.receivePacket(packet);
        this.packets.splice(i, 1);
      }
    }

    // 2. Periodic spawn of traffic reports
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.broadcastRandomPacket();
    }
  }

  broadcastRandomPacket() {
    if (this.sim.edges.length === 0) return;

    // Pick a random edge with active vehicles or incidents
    let candidates = this.sim.edges.filter(e => e.vehicles.length > 0 || e.blocked);
    if (candidates.length === 0) {
      candidates = this.sim.edges;
    }

    const edge = candidates[Math.floor(Math.random() * candidates.length)];
    const priority = (edge.blocked || edge.congestion > 0.7) ? 2 : 1; // High priority for issues

    const pId = `PKT_${++this.packetCounter}`;
    const packet = new TrafficPacket(pId, edge, priority);
    
    this.packets.push(packet);
    this.stats.txCount++;

    // Print to console log
    this.logConsole(`TX_BCST [ID: ${packet.id}] Road: ${packet.roadId} | Cong: ${packet.congestionScore} | Speed: ${packet.avgSpeed} | Pri: ${packet.priorityLevel}`, 'packet');
  }

  receivePacket(packet) {
    this.stats.rxCount++;
    
    // Small logic: update node awareness of adjacent speeds
    const targetNode = this.sim.nodes.find(n => n.id === this.sim.edges.find(e => e.id === packet.roadId).target);
    if (targetNode) {
      // In a real system, the node updates its local router metrics table
    }

    // Log success
    const latency = Math.round((8.0 + Math.random() * 2.0) * 10) / 10;
    this.stats.avgLatency = Math.round(((this.stats.avgLatency * 9) + latency) / 10 * 10) / 10;
    
    // Periodically log rx to prevent console cluttering (log only high priority or 1-in-5)
    if (packet.priorityLevel === 2 || Math.random() < 0.25) {
      this.logConsole(`RX_ACK  [ID: ${packet.id}] Node: ${targetNode ? targetNode.name : 'Unknown'} | Latency: ${latency}ms | OK`, 'signal');
    }
  }

  logConsole(message, type = 'packet') {
    const consoleBox = document.getElementById(this.consoleId);
    if (!consoleBox) return;

    const line = document.createElement('div');
    line.className = `console-line ${type}`;
    
    // Add current time tag
    const d = new Date();
    const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${(d.getMilliseconds() / 100).toFixed(0)}`;
    line.innerText = `[${timeStr}] ${message}`;

    consoleBox.appendChild(line);

    // Keep console capped at 50 logs
    while (consoleBox.children.length > 50) {
      consoleBox.removeChild(consoleBox.firstChild);
    }

    // Auto scroll to bottom
    consoleBox.scrollTop = consoleBox.scrollHeight;
  }

  drawPackets(ctx) {
    this.packets.forEach(p => p.draw(ctx));
  }

  // Clear packet lists
  clear() {
    this.packets = [];
  }
}
