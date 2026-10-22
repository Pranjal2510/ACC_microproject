/**
 * LIVE GATEWAY API SANDBOX & REQUEST LOGGER
 * Allows testing proxy endpoints with live fetch or internal engine fallback
 */

window.SandboxManager = {
  currentFilterStatus: 'ALL',
  currentFilterMethod: 'ALL',
  searchTerm: '',

  init() {
    this.renderLogs();
    this.renderSelectedLog(GatewayData.logs[0]);
  },

  async sendRequest() {
    const method = document.getElementById('sandbox-method')?.value || 'GET';
    const path = document.getElementById('sandbox-path')?.value || '/users';
    const authHeader = document.getElementById('sandbox-auth')?.value || '';
    const bodyText = document.getElementById('sandbox-body')?.value || '';

    const btn = document.getElementById('btn-send-request');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">sync</span><span>Sending...</span>`;
    }

    const startTime = performance.now();
    let status = 200;
    let responseBody = '';
    let responseHeaders = {};
    let isLiveBackend = false;
    let upstreamTarget = 'http://localhost:9001';

    // 1. Verify route in Trie router
    const match = window.RoutesManager ? window.RoutesManager.lookup(method, path) : null;

    if (!match && !path.startsWith('/admin')) {
      status = 404;
      responseBody = JSON.stringify({ error: "404 page not found" }, null, 2);
    } else {
      upstreamTarget = match ? match.route.upstream : 'http://localhost:9001';
      const breaker = GatewayData.breakers[upstreamTarget];

      // 2. Check circuit breaker
      if (breaker && breaker.state === 'OPEN') {
        status = 503;
        responseBody = "upstream circuit open\n";
        breaker.fast503ShedCount++;
      } else {
        // 3. Check JWT Auth if required
        const tokenMatch = authHeader.match(/Bearer\s+(.+)/i);
        const token = tokenMatch ? tokenMatch[1] : '';
        const authResult = window.SecurityManager ? window.SecurityManager.verifyToken(token) : { valid: true };

        if (!authResult.valid && (!match || match.route.auth !== 'Public')) {
          status = 401;
          responseBody = JSON.stringify({ error: "unauthorized" }, null, 2);
        } else {
          // Attempt real network fetch to local proxy :8080 or upstream
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1200);

            const headers = { 'Accept': 'application/json' };
            if (authHeader) headers['Authorization'] = authHeader;

            const res = await fetch(`http://localhost:8080${path}`, {
              method: method,
              headers: headers,
              signal: controller.signal
            });
            clearTimeout(timeoutId);

            status = res.status;
            responseBody = await res.text();
            isLiveBackend = true;
          } catch (e) {
            // Live backend not running or aborted; simulate according to stubs/main.go
            isLiveBackend = false;
            if (path === '/users') {
              status = 200;
              responseBody = JSON.stringify([
                { id: 1, name: "Ada Lovelace" },
                { id: 2, name: "Grace Hopper" }
              ], null, 2);
            } else if (path === '/products') {
              status = 200;
              responseBody = JSON.stringify([
                { id: 1, name: "Notebook", price: 12.50 },
                { id: 2, name: "Pen", price: 2.75 }
              ], null, 2);
            } else if (path === '/orders') {
              status = 200;
              responseBody = JSON.stringify([
                { id: 1, user_id: 1, product_id: 1, quantity: 2 },
                { id: 2, user_id: 2, product_id: 2, quantity: 5 }
              ], null, 2);
            } else if (path.startsWith('/users/')) {
              const id = path.split('/')[2];
              status = 200;
              responseBody = JSON.stringify({ id: Number(id) || 1, name: "Ada Lovelace", role: "Mathematician" }, null, 2);
            } else if (path.startsWith('/admin/slow')) {
              status = 200;
              responseBody = JSON.stringify({ status: "delay updated", ms: 500 }, null, 2);
            } else if (path.startsWith('/admin/fail')) {
              status = 200;
              responseBody = JSON.stringify({ status: "failure mode enabled" }, null, 2);
              if (breaker) breaker.failures = 3;
            } else {
              status = 200;
              responseBody = JSON.stringify({ message: "OK from proxy", path: path }, null, 2);
            }
          }

          // Update breaker stats
          if (breaker) {
            if (status >= 500) {
              window.BreakerManager.recordFailure(upstreamTarget);
            } else {
              window.BreakerManager.recordSuccess(upstreamTarget);
            }
          }
        }
      }
    }

    const latencyMs = Math.max(0.4, (performance.now() - startTime)).toFixed(1);

    // Update response display
    const resBox = document.getElementById('sandbox-response-output');
    const statusPill = document.getElementById('sandbox-response-status');
    const latencyPill = document.getElementById('sandbox-response-latency');

    if (resBox) resBox.textContent = responseBody;
    if (statusPill) {
      statusPill.textContent = `${status} ${status === 200 ? 'OK' : status === 401 ? 'Unauthorized' : status === 503 ? 'Service Unavailable' : status === 404 ? 'Not Found' : 'Error'}`;
      statusPill.style.backgroundColor = status < 400 ? 'var(--tertiary-clay-light)' : status < 500 ? 'var(--warning-clay-light)' : 'var(--error-clay-light)';
      statusPill.style.color = status < 400 ? 'var(--tertiary-clay-deep)' : status < 500 ? '#5C4300' : 'var(--error-clay-deep)';
    }
    if (latencyPill) {
      latencyPill.textContent = `${latencyMs}ms (${isLiveBackend ? 'Live Proxy' : 'Engine Sim'})`;
    }

    // Add to log
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    const logItem = {
      id: `req-${Math.floor(Math.random() * 9000 + 1000)}`,
      time: timeStr,
      method: method,
      path: path,
      status: status,
      latency: `${latencyMs}ms`,
      upstream: upstreamTarget,
      client: "127.0.0.1",
      breaker: GatewayData.breakers[upstreamTarget]?.state || "CLOSED",
      responseBody: responseBody
    };

    GatewayData.logs.unshift(logItem);
    if (GatewayData.logs.length > 50) GatewayData.logs.pop();

    this.renderLogs();
    this.renderSelectedLog(logItem);

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span class="material-symbols-outlined">send</span><span>Send Request</span>`;
    }

    window.showToast(`Request completed: HTTP ${status} in ${latencyMs}ms`, status < 400 ? "success" : "warning");
  },

  renderLogs() {
    const tbody = document.getElementById('logs-table-body');
    if (!tbody) return;

    let filtered = GatewayData.logs;

    if (this.currentFilterStatus !== 'ALL') {
      const codePrefix = this.currentFilterStatus[0];
      filtered = filtered.filter(l => String(l.status).startsWith(codePrefix));
    }

    if (this.currentFilterMethod !== 'ALL') {
      filtered = filtered.filter(l => l.method === this.currentFilterMethod);
    }

    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(l => l.path.toLowerCase().includes(term) || l.id.toLowerCase().includes(term) || String(l.status).includes(term));
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No logs matching current criteria</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(log => {
      let statusBadge = '';
      if (log.status < 300) {
        statusBadge = `<span class="clay-pill" style="background:var(--tertiary-clay-light); color:var(--tertiary-clay-deep);">${log.status} OK</span>`;
      } else if (log.status < 500) {
        statusBadge = `<span class="clay-pill" style="background:var(--warning-clay-light); color:#5C4300;">${log.status} Client</span>`;
      } else {
        statusBadge = `<span class="clay-pill" style="background:var(--error-clay-light); color:var(--error-clay-deep);">${log.status} Fail</span>`;
      }

      return `
        <tr style="cursor: pointer;" onclick="SandboxManager.renderSelectedLogById('${log.id}')">
          <td><span style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted);">${log.time}</span></td>
          <td><span class="clay-pill badge-${log.method.toLowerCase()}">${log.method}</span></td>
          <td><code style="font-family: var(--font-mono); font-weight: 600; color: var(--text-main); font-size: 0.8125rem;">${log.path}</code></td>
          <td>${statusBadge}</td>
          <td><span style="font-family: var(--font-mono); font-size: 0.8125rem; font-weight: 600;">${log.latency}</span></td>
          <td><span style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--secondary-clay-dark);">${log.upstream}</span></td>
          <td>
            <span class="clay-pill" style="font-size: 0.6875rem;">
              ${log.breaker}
            </span>
          </td>
        </tr>
      `;
    }).join('');
  },

  renderSelectedLogById(id) {
    const item = GatewayData.logs.find(l => l.id === id);
    if (item) this.renderSelectedLog(item);
  },

  renderSelectedLog(log) {
    if (!log) return;
    const inspectEl = document.getElementById('log-inspect-panel');
    if (!inspectEl) return;

    inspectEl.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
        <span style="font-family: var(--font-mono); font-weight: 700; font-size: 0.9375rem;">${log.id} • ${log.method} ${log.path}</span>
        <span class="clay-pill" style="background:${log.status < 400 ? 'var(--tertiary-clay-light)' : 'var(--error-clay-light)'};">
          ${log.status}
        </span>
      </div>

      <div style="display: grid; grid-template-columns: 100px 1fr; gap: 0.5rem; font-family: var(--font-mono); font-size: 0.8125rem; margin-bottom: 1rem;">
        <span style="color: var(--text-muted);">Timestamp:</span>
        <span>${log.time}</span>

        <span style="color: var(--text-muted);">Client IP:</span>
        <span>${log.client}</span>

        <span style="color: var(--text-muted);">Upstream:</span>
        <span style="color: var(--secondary-clay-dark); font-weight: 600;">${log.upstream}</span>

        <span style="color: var(--text-muted);">Roundtrip:</span>
        <span style="color: var(--primary-clay-dark); font-weight: 600;">${log.latency}</span>

        <span style="color: var(--text-muted);">Circuit:</span>
        <span style="font-weight: 600;">${log.breaker}</span>
      </div>

      <div style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.35rem;">
        PAYLOAD / RESPONSE SNAPSHOT:
      </div>
      <div class="code-container" style="max-height: 140px; font-size: 0.75rem;">
        ${log.responseBody || '{"status": 200, "message": "Transparent reverse proxy forward"}'}
      </div>
    `;
  },

  filterStatus(status) {
    this.currentFilterStatus = status;
    this.renderLogs();
  },

  filterMethod(method) {
    this.currentFilterMethod = method;
    this.renderLogs();
  },

  search(term) {
    this.searchTerm = term;
    this.renderLogs();
  }
};
