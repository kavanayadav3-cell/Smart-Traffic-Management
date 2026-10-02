// TrafficFlow OS - AI Traffic Prediction Engine (LSTM / XGBoost Emulator)

class AIEngine {
  constructor(simulation) {
    this.sim = simulation;
  }

  // Generate real-time prediction scores based on UI environment variables
  predict(env) {
    // Inputs: env.hour, env.weather, env.event, env.holiday
    const hour = parseFloat(env.hour);
    const weather = env.weather; // 'clear', 'rain', 'storm'
    const event = env.event;     // 'none', 'sports', 'concert'
    const holiday = !!env.holiday;

    // 1. Calculate Core Delay Factor
    // Rush Hour peaks: 8 AM (8) and 5 PM (17)
    const amRush = Math.exp(-Math.pow(hour - 8.5, 2) / 2); // peak at 8:30 AM
    const pmRush = Math.exp(-Math.pow(hour - 17.5, 2) / 2.5); // peak at 5:30 PM
    const rushMultiplier = 1.0 + (amRush + pmRush) * 1.8; // up to 2.8x congestion baseline

    // Weather impact modifiers
    let weatherModifier = 1.0;
    if (weather === 'rain') weatherModifier = 1.45;
    if (weather === 'storm') weatherModifier = 2.1;

    // Event impact modifiers
    let eventModifier = 1.0;
    if (event === 'sports') eventModifier = 1.6;
    if (event === 'concert') eventModifier = 1.35;

    // Holiday impact modifier (holidays reduce business traffic but increase leisure hotspots)
    const holidayModifier = holiday ? 0.75 : 1.05;

    // Overall delay index (1.0 = free flow, 5.0 = gridlock)
    const overallDelayIndex = Math.min(5.0, Math.max(1.0, 
      1.0 * rushMultiplier * weatherModifier * eventModifier * holidayModifier
    ));

    // 2. Accident Probability Index (%)
    // Base probability: 2%
    // Weather increases risk heavily, rush hours increase risk, events increase risk
    const rushRisk = (amRush + pmRush) * 15; // +15% during peak times
    const weatherRisk = weather === 'clear' ? 2 : (weather === 'rain' ? 28 : 65); // up to 65% in storms
    const eventRisk = event !== 'none' ? 12 : 0;
    const accidentProbability = Math.min(98, Math.round(2 + rushRisk + weatherRisk + eventRisk));

    // 3. Hotspot Identification
    // Determine which roads are predicted to have the highest congestion
    const hotspots = [];
    
    // Sort edges by simulated potential congestion
    // Highway edges and nodes near Tech Hub (North-East) get hit hardest by events/rush
    this.sim.edges.forEach(edge => {
      let edgeRisk = edge.congestion * 0.4;
      
      // Node specific weight addition
      if (edge.source === 0 || edge.target === 0 || edge.source === 1 || edge.target === 1) {
        // Near Tech Hub
        edgeRisk += (amRush * 0.6);
      }
      if (edge.source === 15 || edge.target === 15 || edge.source === 14 || edge.target === 14) {
        // Near Cloud Core Intersect / South exit
        edgeRisk += (pmRush * 0.6);
      }
      if (weather === 'storm') {
        edgeRisk += 0.25; // General storm friction
      }
      if (event === 'sports' && (edge.source === 5 || edge.target === 5 || edge.source === 6 || edge.target === 6)) {
        // Digital Twin Hub / Mainframe Intersect (center areas near stadium)
        edgeRisk += 0.5;
      }

      if (edgeRisk > 0.45) {
        const roadName = `Route ${edge.id.replace('E_', '').replace('_', ' → ')}`;
        hotspots.push({
          roadId: edge.id,
          name: roadName,
          severity: Math.min(100, Math.round(edgeRisk * 100)),
          avgSpeed: Math.max(1.0, Math.round(edge.averageSpeed * (1 - edgeRisk) * 10) / 10)
        });
      }
    });

    hotspots.sort((a, b) => b.severity - a.severity);

    // 4. Multi-Horizon Congestion Prediction Trend (15m, 30m, 45m, 60m)
    // Build a sequence using simple step math to show a projection curve
    const trend = [];
    const stepCount = 5; // current, 15m, 30m, 45m, 60m
    
    for (let i = 0; i < stepCount; i++) {
      const futureHour = (hour + (i * 0.25)) % 24; // 15 mins is 0.25 hours
      
      // Recompute rush factor for future hours
      const fAmRush = Math.exp(-Math.pow(futureHour - 8.5, 2) / 2);
      const fPmRush = Math.exp(-Math.pow(futureHour - 17.5, 2) / 2.5);
      const fRush = 1.0 + (fAmRush + fPmRush) * 1.8;
      
      // Calculate future congestion value (percentage 0 to 100)
      const futureCongestionVal = Math.min(100, Math.round(
        (overallDelayIndex - 1.0) * 18 + (fRush * 12) + (Math.sin(futureHour) * 5) + 15
      ));

      trend.push({
        label: i === 0 ? 'Live' : `+${i * 15}m`,
        value: Math.max(5, futureCongestionVal)
      });
    }

    return {
      delayIndex: Math.round(overallDelayIndex * 10) / 10,
      accidentProb: accidentProbability,
      hotspots: hotspots.slice(0, 4), // Top 4 hotspots
      trend: trend
    };
  }
}
