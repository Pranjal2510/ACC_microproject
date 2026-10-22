/**
 * CONFIGURATION & ZERO-DOWNTIME HOT RELOAD MANAGER
 * Replicates internal/config Go parser & atomic.Pointer swap
 */

window.ConfigManager = {
  swapHistory: [
    { sha: "4f8a2c7", time: "10:42:18", trigger: "File Poller (2.0s)", routes: 3, status: "APPLIED", sockets: "142 drained", details: "Initial boot and route compilation for routes.json" },
    { sha: "e3b0c44", time: "10:30:00", trigger: "Manual Swap", routes: 3, status: "APPLIED", sockets: "89 drained", details: "Verified atomic swap with 0 dropped connections" }
  ],

  pollSecondsLeft: 2.0,

  init() {
    const editor = document.getElementById('routes-json-editor');
    if (editor) {
      editor.value = GatewayData.config.rawContent;
    }

    // 2-second file poller heartbeat simulation
    setInterval(() => {
      this.pollSecondsLeft -= 0.1;
      if (this.pollSecondsLeft <= 0) {
        this.pollSecondsLeft = 2.0;
        this.onPollerHeartbeat();
      }
      const tickerEl = document.getElementById('countdown-ticker');
      if (tickerEl) {
        tickerEl.textContent = `${this.pollSecondsLeft.toFixed(1)}s`;
      }
    }, 100);

    this.renderAuditHistory();
  },

  onPollerHeartbeat() {
    const dot = document.getElementById('poller-pulse-dot');
    if (dot) {
      dot.style.transform = 'scale(1.4)';
      setTimeout(() => { dot.style.transform = 'scale(1)'; }, 200);
    }
  },

  validateConfig(jsonString) {
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      return { valid: false, error: `Invalid JSON syntax: ${e.message}` };
    }

    if (!parsed || !Array.isArray(parsed.routes)) {
      return { valid: false, error: "Root object must contain a 'routes' array" };
    }

    const seen = new Set();
    const validRoutes = [];

    for (let i = 0; i < parsed.routes.length; i++) {
      const r = parsed.routes[i];
      if (!r || typeof r !== 'object') {
        return { valid: false, error: `Route ${i}: must be a JSON object` };
      }

      // Check unknown fields
      const keys = Object.keys(r);
      for (const k of keys) {
        if (!['method', 'path', 'upstream'].includes(k)) {
          return { valid: false, error: `Route ${i}: unknown field "${k}" rejected by Go disallowUnknownFields()` };
        }
      }

      const method = (r.method || '').trim().toUpperCase();
      if (!method) {
        return { valid: false, error: `Route ${i}: method cannot be empty` };
      }

      const path = (r.path || '').trim();
      if (!path || !path.startsWith('/')) {
        return { valid: false, error: `Route ${i}: path must be a non-empty absolute path starting with "/"` };
      }

      // Normalized path key
      const normalizedPath = '/' + path.replace(/^\/+|\/+$/g, '');
      const routeKey = `${method} ${normalizedPath}`;
      if (seen.has(routeKey)) {
        return { valid: false, error: `Route ${i}: duplicate route "${routeKey}" detected` };
      }
      seen.add(routeKey);

      // Validate upstream URL
      const upstream = (r.upstream || '').trim();
      try {
        const u = new URL(upstream);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          return { valid: false, error: `Route ${i}: upstream scheme must be http or https, got "${u.protocol}"` };
        }
        if (!u.host) {
          return { valid: false, error: `Route ${i}: upstream URL must have a valid host` };
        }
      } catch (err) {
        return { valid: false, error: `Route ${i}: invalid upstream URL "${upstream}"` };
      }

      validRoutes.push({
        id: `r-${i+1}`,
        method: method,
        path: normalizedPath,
        upstream: upstream,
        auth: "RS256",
        breaker: "Active (Threshold: 3)",
        latency: "1.5ms"
      });
    }

    return { valid: true, routes: validRoutes };
  },

  dryRunValidate() {
    const editor = document.getElementById('routes-json-editor');
    const resultBox = document.getElementById('config-validation-result');
    if (!editor || !resultBox) return;

    const validation = this.validateConfig(editor.value);
    if (validation.valid) {
      resultBox.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.5rem; color:var(--tertiary-clay-dark); font-weight:700;">
          <span class="material-symbols-outlined">check_circle</span>
          <span>SCHEMA VALIDATION PASSED</span>
        </div>
        <p style="font-size:0.8125rem; color:var(--text-muted); margin-top:0.35rem;">
          ${validation.routes.length} routes validated. Conforms to Go struct definitions. Zero route collisions detected.
        </p>
      `;
      window.showToast("Configuration validation passed!", "success");
    } else {
      resultBox.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.5rem; color:var(--error-clay-dark); font-weight:700;">
          <span class="material-symbols-outlined">error</span>
          <span>VALIDATION ERROR (REJECTED)</span>
        </div>
        <p style="font-size:0.8125rem; color:var(--error-clay-dark); margin-top:0.35rem; font-family:var(--font-mono);">
          ${validation.error}
        </p>
      `;
      window.showToast("Configuration syntax error detected", "error");
    }
  },

  forceAtomicSwap() {
    const editor = document.getElementById('routes-json-editor');
    if (!editor) return;

    const validation = this.validateConfig(editor.value);
    if (!validation.valid) {
      window.showToast(`Swap Rejected: ${validation.error}`, "error");
      this.dryRunValidate();
      return;
    }

    // Apply hot swap
    GatewayData.config.activeGeneration++;
    GatewayData.config.rawContent = editor.value;
    GatewayData.routes = validation.routes;

    const newSha = Math.random().toString(16).substring(2, 9);
    GatewayData.config.sha = newSha;

    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];

    this.swapHistory.unshift({
      sha: newSha,
      time: timeStr,
      trigger: "Manual Atomic Swap",
      routes: validation.routes.length,
      status: "APPLIED",
      sockets: `${Math.floor(Math.random() * 80 + 40)} drained`,
      details: `atomic.Pointer[Router] swapped to Gen #${GatewayData.config.activeGeneration}. 0 dropped connections.`
    });

    window.showToast(`Swapped to Generation #${GatewayData.config.activeGeneration} (Zero-downtime)`, "success");

    // Re-render routes and history
    if (window.RoutesManager) {
      window.RoutesManager.renderRoutesTable();
    }
    this.renderAuditHistory();
    this.updateOverviewKPIs();
  },

  renderAuditHistory() {
    const tbody = document.getElementById('swap-history-body');
    if (!tbody) return;

    tbody.innerHTML = this.swapHistory.map(item => `
      <tr>
        <td><code style="font-family:var(--font-mono); font-weight:700; color:var(--primary-clay-dark);">${item.sha}</code></td>
        <td><span style="font-family:var(--font-mono); font-size:0.8125rem;">${item.time}</span></td>
        <td><span class="clay-pill" style="background:var(--secondary-clay-light); color:var(--secondary-clay-deep);">${item.trigger}</span></td>
        <td><span style="font-family:var(--font-mono); font-weight:600;">${item.routes} routes</span></td>
        <td><span class="clay-pill" style="background:var(--tertiary-clay-light); color:var(--tertiary-clay-deep);">✓ ${item.status}</span></td>
        <td><span style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-muted);">${item.sockets}</span></td>
        <td style="font-size:0.8125rem; color:var(--text-muted);">${item.details}</td>
      </tr>
    `).join('');
  },

  updateOverviewKPIs() {
    const genEl = document.getElementById('active-generation-label');
    if (genEl) {
      genEl.textContent = `Gen #${GatewayData.config.activeGeneration}`;
    }
  }
};
