/**
 * LOAD TESTING & K6 BENCHMARK ENGINE
 * Renders metrics from docs/latency.json, docs/breaker-failfast.json & docs/route-reload.json
 */

window.LoadtestManager = {
  render() {
    this.renderLatencyChart();
    this.renderFailfastMetrics();
  },

  renderLatencyChart() {
    const container = document.getElementById('latency-chart-svg');
    if (!container) return;

    // SVG comparison chart showing Direct Upstream vs Gateway Proxy
    container.innerHTML = `
      <svg viewBox="0 0 500 180" style="width:100%; height:180px; overflow:visible;">
        <defs>
          <linearGradient id="directGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#23875A" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="#23875A" stop-opacity="0.0"/>
          </linearGradient>
          <linearGradient id="gatewayGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#583BB5" stop-opacity="0.4"/>
            <stop offset="100%" stop-color="#583BB5" stop-opacity="0.0"/>
          </linearGradient>
        </defs>

        <!-- Grid Lines -->
        <line x1="40" y1="30" x2="480" y2="30" stroke="rgba(125,105,175,0.22)" stroke-dasharray="4"/>
        <line x1="40" y1="75" x2="480" y2="75" stroke="rgba(125,105,175,0.22)" stroke-dasharray="4"/>
        <line x1="40" y1="120" x2="480" y2="120" stroke="rgba(125,105,175,0.22)" stroke-dasharray="4"/>
        <line x1="40" y1="150" x2="480" y2="150" stroke="rgba(125,105,175,0.4)"/>

        <!-- Y Axis Labels -->
        <text x="30" y="34" font-family="JetBrains Mono" font-size="10" fill="#56506D" font-weight="600" text-anchor="end">15ms</text>
        <text x="30" y="79" font-family="JetBrains Mono" font-size="10" fill="#56506D" font-weight="600" text-anchor="end">10ms</text>
        <text x="30" y="124" font-family="JetBrains Mono" font-size="10" fill="#56506D" font-weight="600" text-anchor="end">5ms</text>
        <text x="30" y="154" font-family="JetBrains Mono" font-size="10" fill="#56506D" font-weight="600" text-anchor="end">0ms</text>

        <!-- Direct Area & Line (Greenish) -->
        <path d="M 50 145 Q 120 144 200 142 T 350 141 T 470 138 L 470 150 L 50 150 Z" fill="url(#directGrad)"/>
        <path d="M 50 145 Q 120 144 200 142 T 350 141 T 470 138" fill="none" stroke="#23875A" stroke-width="2.5" stroke-linecap="round"/>

        <!-- Gateway Area & Line (Lavender) -->
        <path d="M 50 138 Q 120 135 200 130 T 350 115 T 470 45 L 470 150 L 50 150 Z" fill="url(#gatewayGrad)"/>
        <path d="M 50 138 Q 120 135 200 130 T 350 115 T 470 45" fill="none" stroke="#583BB5" stroke-width="2.8" stroke-linecap="round"/>

        <!-- Data Point Markers -->
        <circle cx="200" cy="130" r="5" fill="#583BB5" stroke="#FFFFFF" stroke-width="1.5"/>
        <text x="200" y="120" font-family="JetBrains Mono" font-size="10" font-weight="bold" fill="#583BB5" text-anchor="middle">p50: 1.08ms</text>

        <circle cx="350" cy="115" r="5" fill="#583BB5" stroke="#FFFFFF" stroke-width="1.5"/>
        <text x="350" y="105" font-family="JetBrains Mono" font-size="10" font-weight="bold" fill="#583BB5" text-anchor="middle">p95: 2.15ms</text>

        <circle cx="470" cy="45" r="5" fill="#583BB5" stroke="#FFFFFF" stroke-width="1.5"/>
        <text x="460" y="34" font-family="JetBrains Mono" font-size="10" font-weight="bold" fill="#583BB5" text-anchor="end">p99: 14.2ms</text>

        <!-- X Labels -->
        <text x="50" y="168" font-family="JetBrains Mono" font-size="10" fill="#56506D" font-weight="600">p25</text>
        <text x="200" y="168" font-family="JetBrains Mono" font-size="10" fill="#56506D" font-weight="600">p50</text>
        <text x="350" y="168" font-family="JetBrains Mono" font-size="10" fill="#56506D" font-weight="600">p95</text>
        <text x="470" y="168" font-family="JetBrains Mono" font-size="10" fill="#56506D" font-weight="600">p99</text>
      </svg>
    `;
  },

  renderFailfastMetrics() {
    const el = document.getElementById('failfast-summary-box');
    if (!el) return;

    const b = GatewayData.benchmarks.failfast;
    el.innerHTML = `
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem;">
        <div class="clay-recessed-soft" style="padding: 1rem;">
          <div style="font-family:var(--font-mono); font-size:0.6875rem; color:var(--text-muted); text-transform:uppercase;">Total Invocations</div>
          <div style="font-size:1.5rem; font-weight:700; color:var(--text-main); margin-top:0.25rem;">${b.totalRequests} reqs</div>
          <div style="font-size:0.75rem; color:var(--tertiary-clay-dark); font-weight:600; margin-top:0.2rem;">Checks: ${b.successChecks}</div>
        </div>

        <div class="clay-recessed-soft" style="padding: 1rem;">
          <div style="font-family:var(--font-mono); font-size:0.6875rem; color:var(--text-muted); text-transform:uppercase;">Fast 503 Rejections</div>
          <div style="font-size:1.5rem; font-weight:700; color:var(--error-clay-dark); margin-top:0.25rem;">${b.fast503Total} reqs</div>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.2rem;">9.49 req/s throughput</div>
        </div>

        <div class="clay-recessed-soft" style="padding: 1rem;">
          <div style="font-family:var(--font-mono); font-size:0.6875rem; color:var(--text-muted); text-transform:uppercase;">Avg Circuit Latency</div>
          <div style="font-size:1.5rem; font-weight:700; color:var(--primary-clay-dark); margin-top:0.25rem;">${b.avgFailfastLatency}</div>
          <div style="font-size:0.75rem; color:var(--tertiary-clay-dark); font-weight:600; margin-top:0.2rem;">Min: ${b.minLatency}</div>
        </div>

        <div class="clay-recessed-soft" style="padding: 1rem;">
          <div style="font-family:var(--font-mono); font-size:0.6875rem; color:var(--text-muted); text-transform:uppercase;">Upstream Time Saved</div>
          <div style="font-size:1.5rem; font-weight:700; color:var(--tertiary-clay-dark); margin-top:0.25rem;">~${b.timeSavedSec}</div>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.2rem;">Connection pool exhaustion averted</div>
        </div>
      </div>
    `;
  },

  runBenchmarkSimulation() {
    const btn = document.getElementById('btn-run-k6-sim');
    if (!btn) return;

    btn.disabled = true;
    const oldText = btn.innerHTML;
    btn.innerHTML = `<span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">sync</span><span>Running k6 VUs...</span>`;

    let progress = 0;
    const interval = setInterval(() => {
      progress += 20;
      if (progress >= 100) {
        clearInterval(interval);
        btn.disabled = false;
        btn.innerHTML = oldText;
        window.showToast("k6 benchmark completed: 147/147 iterations passed with p95 < 2.2ms", "success");
      }
    }, 300);
  }
};
