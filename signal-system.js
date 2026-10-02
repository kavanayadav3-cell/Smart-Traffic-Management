// TrafficFlow OS - Smart Signal Coordinator System

class SignalSystemCoordinator {
  constructor(simulation) {
    this.sim = simulation;
    
    // Performance analytics trackers (Fixed vs Adaptive comparison values)
    this.history = {
      fixed: {
        avgWaitTime: [],
        throughput: [],
        delayReduction: 0
      },
      adaptive: {
        avgWaitTime: [],
        throughput: [],
        delayReduction: 28 // baseline optimization %
      }
    };
  }

  // Switch all intersections to a specific mode
  setGlobalMode(mode) {
    // mode: 'fixed' or 'adaptive'
    this.sim.nodes.forEach(node => {
      if (!node.isRoundabout) {
        node.lightState.mode = mode;
        node.lightState.timer = 0;
        node.lightState.color = 'green';
        node.lightState.adaptiveCooldown = 0;
      }
    });
  }

  // Apply Emergency "Green Corridor" protocol along a route
  applyEmergencyCorridor(pathNodeIds) {
    if (!pathNodeIds || pathNodeIds.length < 2) return;

    // Reset existing overrides
    this.clearEmergencyCorridors();

    // Iterate nodes along the route to override signals
    for (let i = 0; i < pathNodeIds.length - 1; i++) {
      const sourceId = pathNodeIds[i];
      const targetId = pathNodeIds[i + 1];
      
      const node = this.sim.nodes.find(n => n.id === targetId);
      const edge = this.sim.edges.find(e => e.source === sourceId && e.target === targetId);

      if (node && edge && !node.isRoundabout) {
        const light = node.lightState;
        light.emergencyOverride = true;

        // Force signal green in the ambulance's arrival direction
        const dir = edge.direction; // 'N', 'S', 'E', 'W'
        if (dir === 'N' || dir === 'S') {
          light.activePhase = 'NS';
        } else {
          light.activePhase = 'EW';
        }
        light.color = 'green';
        light.timer = 0;
      }
    }
  }

  // Clear all emergency overrides
  clearEmergencyCorridors() {
    this.sim.nodes.forEach(node => {
      node.lightState.emergencyOverride = false;
    });
  }

  // Monitor ambulance and update corridor status dynamically
  updateCorridorProgress(ambulance) {
    if (!ambulance || !ambulance.active || ambulance.type !== 'ambulance') {
      this.clearEmergencyCorridors();
      return;
    }

    const currentEdge = ambulance.currentEdge;
    if (!currentEdge) return;

    // Clear nodes that the ambulance has already passed
    const route = ambulance.route;
    const currIndex = ambulance.routeIndex;

    this.sim.nodes.forEach(node => {
      // If node is behind current index in route, release it
      const nodeIndexInRoute = route.indexOf(node.id);
      if (nodeIndexInRoute > -1 && nodeIndexInRoute <= currIndex) {
        node.lightState.emergencyOverride = false;
      }
    });
  }

  // Calculate global statistics for comparison
  getSystemAnalytics() {
    let totalWaitTime = 0;
    let totalPassed = 0;
    let signalCount = 0;

    this.sim.nodes.forEach(node => {
      if (!node.isRoundabout) {
        totalWaitTime += node.accumulatedWaitTime;
        totalPassed += node.vehiclesPassed;
        signalCount++;
      }
    });

    const activeVehiclesCount = this.sim.vehicles.length;
    // Normalized average wait time per vehicle
    const avgWait = activeVehiclesCount > 0 ? (totalWaitTime / (activeVehiclesCount * 60)) : 0;
    const throughput = totalPassed; // total completed nodes

    return {
      avgWait: Math.round(avgWait * 10) / 10, // seconds
      throughput: throughput,
      signalCount: signalCount
    };
  }

  // Reset counters for stats comparison
  resetStats() {
    this.sim.nodes.forEach(node => {
      node.accumulatedWaitTime = 0;
      node.vehiclesPassed = 0;
    });
  }
}
