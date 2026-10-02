// TrafficFlow OS - Dynamic Router & Pathfinder

class TrafficRouter {
  constructor(simulation) {
    this.sim = simulation;
  }

  // Calculate dynamic weight (travel time in seconds/frames) for an edge
  getEdgeWeight(edge, useLiveWeights = true) {
    if (edge.blocked) {
      return Infinity; // Road closed
    }

    const baseWeight = edge.length / edge.speedLimit;

    if (!useLiveWeights) {
      return baseWeight; // Static routing based on distance & speed limit only
    }

    // Live Routing: penalize congestion
    // If congestion is 0.8, travel time is scaled up heavily
    const congestionFactor = 1 + (edge.congestion * 4.0); // Up to 5x penalty for heavy traffic
    
    // Add additional lane capacity factor (more lanes = less routing resistance)
    const laneBonus = 1.0 - (edge.lanes - 2) * 0.1; // 2 lanes = 1.0x, 3 lanes = 0.9x

    return baseWeight * congestionFactor * laneBonus;
  }

  // Standard Dijkstra implementation
  findPath(startNodeId, endNodeId, useLiveWeights = true) {
    const nodes = this.sim.nodes;
    const edges = this.sim.edges;

    // Priority queue/dist trackers
    const distances = {};
    const previous = {};
    const unvisited = new Set();

    nodes.forEach(node => {
      distances[node.id] = Infinity;
      previous[node.id] = null;
      unvisited.add(node.id);
    });

    distances[startNodeId] = 0;

    while (unvisited.size > 0) {
      // Find unvisited node with smallest distance
      let currentId = null;
      let minDistance = Infinity;

      unvisited.forEach(nodeId => {
        if (distances[nodeId] < minDistance) {
          minDistance = distances[nodeId];
          currentId = nodeId;
        }
      });

      // If target reached or remaining nodes unreachable
      if (currentId === null || currentId === endNodeId) {
        break;
      }

      unvisited.delete(currentId);

      // Find neighbors from outgoing edges
      const outgoingEdges = edges.filter(e => e.source === currentId);

      outgoingEdges.forEach(edge => {
        const neighborId = edge.target;
        if (!unvisited.has(neighborId)) return;

        const weight = this.getEdgeWeight(edge, useLiveWeights);
        if (weight === Infinity) return; // blocked road

        const alt = distances[currentId] + weight;
        if (alt < distances[neighborId]) {
          distances[neighborId] = alt;
          previous[neighborId] = currentId;
        }
      });
    }

    // Reconstruct path
    const path = [];
    let curr = endNodeId;
    
    // Check if path exists
    if (distances[endNodeId] === Infinity) {
      return null;
    }

    while (curr !== null) {
      path.unshift(curr);
      curr = previous[curr];
    }

    return path;
  }

  // Suggests alternate paths (returns path array and travel metrics)
  getRouteRecommendations(startNodeId, endNodeId) {
    // 1. Static (Historical/Shortest Distance) Path
    const staticPath = this.findPath(startNodeId, endNodeId, false);
    
    // 2. Live Adaptive Optimized Path
    const optimizedPath = this.findPath(startNodeId, endNodeId, true);

    const getStats = (path, useLive) => {
      if (!path) return { distance: 0, time: 0, congestion: 0 };
      
      let distance = 0;
      let time = 0;
      let totalCongestion = 0;
      let edgeCount = 0;

      for (let i = 0; i < path.length - 1; i++) {
        const edge = this.sim.edges.find(e => e.source === path[i] && e.target === path[i+1]);
        if (edge) {
          distance += edge.length;
          time += this.getEdgeWeight(edge, useLive);
          totalCongestion += edge.congestion;
          edgeCount++;
        }
      }

      return {
        distance: Math.round(distance),
        // Convert simulation frame steps to travel duration (e.g., minutes)
        time: Math.round(time / 6), 
        congestion: edgeCount > 0 ? (totalCongestion / edgeCount) : 0
      };
    };

    const staticStats = getStats(staticPath, false);
    const optimizedStats = getStats(optimizedPath, true);

    // If optimized path is identical to static path, try to find a third alternative
    // by temporarily increasing weight of the optimized path edges and rerouting.
    let alternativePath = null;
    let alternativeStats = null;

    if (optimizedPath && optimizedPath.length > 2) {
      // Temporarily double weights of selected optimized edges
      const originalWeights = {};
      
      for (let i = 0; i < optimizedPath.length - 1; i++) {
        const edge = this.sim.edges.find(e => e.source === optimizedPath[i] && e.target === optimizedPath[i+1]);
        if (edge) {
          // Store original blocked state to restore later
          originalWeights[edge.id] = edge.congestion;
          edge.congestion = Math.min(1.0, edge.congestion + 0.5); // Add synthetic traffic load
        }
      }

      // Re-run Dijkstra with synthetic load
      alternativePath = this.findPath(startNodeId, endNodeId, true);

      // Restore weights
      for (let i = 0; i < optimizedPath.length - 1; i++) {
        const edge = this.sim.edges.find(e => e.source === optimizedPath[i] && e.target === optimizedPath[i+1]);
        if (edge && originalWeights[edge.id] !== undefined) {
          edge.congestion = originalWeights[edge.id];
        }
      }

      // Calculate stats for alternate route using ACTUAL current weights
      if (alternativePath && alternativePath.join(',') !== optimizedPath.join(',')) {
        alternativeStats = getStats(alternativePath, true);
      } else {
        alternativePath = null; // No distinct alternative found
      }
    }

    return {
      static: { path: staticPath, stats: staticStats },
      optimized: { path: optimizedPath, stats: optimizedStats },
      alternative: alternativePath ? { path: alternativePath, stats: alternativeStats } : null
    };
  }
}
