/**
 * CIRCUIT BREAKER STATE MACHINE
 * Implements internal/breaker Go state machine:
 * Closed -> (failures >= 3) -> Open (10s cooldown) -> HalfOpen (1 probe) -> Closed / Open
 */

window.BreakerManager = {
  transitionHistory: [
    { time: "10:38:29", upstream: "http://localhost:9001", from: "OPEN", to: "HALF_OPEN", reason: "10s cooldown elapsed; canary probe authorized" },
    { time: "10:38:31", upstream: "http://localhost:9001", from: "HALF_OPEN", to: "CLOSED", reason: "Canary probe returned HTTP 200 OK" }
  ],

  init() {
    // 1-second ticker for breaker cooldown countdowns
    setInterval(() => {
      this.tick();
    }, 1000);
    this.render();
  },

  tick() {
    let stateChanged = false;
    const now = Date.now();

    for (const [upstream, b] of Object.entries(GatewayData.breakers)) {
      if (b.state === "OPEN") {
        const elapsed = now - (b.openedAt || now);
        const remaining = Math.max(0, Math.ceil((b.openTimeoutMs - elapsed) / 1000));
        b.cooldownRemaining = remaining;

        if (remaining <= 0) {
          // Transition to HALF_OPEN
          b.state = "HALF_OPEN";
          b.probesInFlight = 0;
          b.probeSuccesses = 0;
          this.logTransition(upstream, "OPEN", "HALF_OPEN", "10s cooldown elapsed. 1 canary probe allowed.");
          stateChanged = true;
        }
      }
    }

    this.render();
  },

  recordFailure(upstream) {
    const b = GatewayData.breakers[upstream];
    if (!b) return;

    if (b.state === "CLOSED") {
      b.failures++;
      if (b.failures >= b.failureThreshold) {
        b.state = "OPEN";
        b.openedAt = Date.now();
        b.cooldownRemaining = Math.ceil(b.openTimeoutMs / 1000);
        b.failures = 0;
        this.logTransition(upstream, "CLOSED", "OPEN", `Exceeded failure threshold (${b.failureThreshold} errors). Circuit opened!`);
        window.showToast(`Circuit Breaker TRIPPED for ${upstream}`, "error");
      }
    } else if (b.state === "HALF_OPEN") {
      b.state = "OPEN";
      b.openedAt = Date.now();
      b.cooldownRemaining = Math.ceil(b.openTimeoutMs / 1000);
      this.logTransition(upstream, "HALF_OPEN", "OPEN", "Canary probe failed. Circuit re-opened for 10s cooldown.");
      window.showToast(`Probe failed: ${upstream} re-opened!`, "error");
    }

    this.render();
  },

  recordSuccess(upstream) {
    const b = GatewayData.breakers[upstream];
    if (!b) return;

    if (b.state === "CLOSED") {
      b.failures = 0;
      b.successCount++;
    } else if (b.state === "HALF_OPEN") {
      b.probeSuccesses++;
      if (b.probeSuccesses >= b.halfOpenProbes) {
        b.state = "CLOSED";
        b.failures = 0;
        b.probesInFlight = 0;
        b.probeSuccesses = 0;
        this.logTransition(upstream, "HALF_OPEN", "CLOSED", "Canary probe succeeded with 200 OK. Circuit restored to CLOSED.");
        window.showToast(`Circuit restored: ${upstream} is CLOSED (Healthy)`, "success");
      }
    }

    this.render();
  },

  forceTrip(upstream) {
    const b = GatewayData.breakers[upstream];
    if (!b) return;
    b.state = "OPEN";
    b.openedAt = Date.now();
    b.cooldownRemaining = Math.ceil(b.openTimeoutMs / 1000);
    b.failures = 0;
    this.logTransition(upstream, "CLOSED", "OPEN", "Manual operator override (Force Trip)");
    window.showToast(`Force-tripped ${upstream} to OPEN`, "warning");
    this.render();
  },

  manualReset(upstream) {
    const b = GatewayData.breakers[upstream];
    if (!b) return;
    b.state = "CLOSED";
    b.failures = 0;
    b.cooldownRemaining = 0;
    this.logTransition(upstream, b.state, "CLOSED", "Manual operator reset to CLOSED");
    window.showToast(`Reset ${upstream} to CLOSED`, "success");
    this.render();
  },

  logTransition(upstream, from, to, reason) {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    this.transitionHistory.unshift({
      time: timeStr,
      upstream: upstream,
      from: from,
      to: to,
      reason: reason
    });
    if (this.transitionHistory.length > 20) this.transitionHistory.pop();
  },

  render() {
    this.renderBreakerCards();
    this.renderTransitionHistory();
    this.updateOverviewSummary();
  },

  renderBreakerCards() {
    const container = document.getElementById('breaker-cards-container');
    if (!container) return;

    container.innerHTML = Object.entries(GatewayData.breakers).map(([upstream, b]) => {
      let stateBadge = '';
      let statusColor = '';
      let progressBar = '';
      let statusDetails = '';

      if (b.state === 'CLOSED') {
        stateBadge = `<span class="clay-pill" style="background:var(--tertiary-clay-light); color:var(--tertiary-clay-deep);">● CLOSED</span>`;
        statusColor = 'var(--tertiary-clay-dark)';
        const failPercent = (b.failures / b.failureThreshold) * 100;
        progressBar = `
          <div class="clay-progress-track" style="margin-top: 0.5rem;">
            <div class="clay-progress-bar" style="width: ${failPercent}%; background-color: var(--warning-clay);"></div>
          </div>
        `;
        statusDetails = `
          <div style="display:flex; justify-content:space-between; font-family:var(--font-mono); font-size:0.8125rem;">
            <span style="color:var(--text-muted);">Consecutive Failures:</span>
            <span style="font-weight:600; color:${b.failures > 0 ? 'var(--warning-clay-dark)' : 'var(--tertiary-clay-dark)'};">${b.failures} / ${b.failureThreshold}</span>
          </div>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.25rem;">
            Passing normal proxy traffic transparently.
          </div>
        `;
      } else if (b.state === 'OPEN') {
        stateBadge = `<span class="clay-pill" style="background:var(--error-clay-light); color:var(--error-clay-deep);">⚠ OPEN (FAIL-FAST)</span>`;
        statusColor = 'var(--error-clay-dark)';
        const cooldownPercent = (b.cooldownRemaining / 10) * 100;
        progressBar = `
          <div class="clay-progress-track" style="margin-top: 0.5rem;">
            <div class="clay-progress-bar" style="width: ${cooldownPercent}%; background-color: var(--error-clay);"></div>
          </div>
        `;
        statusDetails = `
          <div style="display:flex; justify-content:space-between; font-family:var(--font-mono); font-size:0.8125rem;">
            <span style="color:var(--text-muted);">Cooldown Remaining:</span>
            <span style="font-weight:700; color:var(--error-clay-dark);">${b.cooldownRemaining}s</span>
          </div>
          <div style="font-size:0.75rem; color:var(--error-clay-dark); font-weight:600; margin-top:0.25rem;">
            Failing fast with HTTP 503 within &lt;0.2ms.
          </div>
        `;
      } else { // HALF_OPEN
        stateBadge = `<span class="clay-pill" style="background:var(--warning-clay-light); color:#5C4300;">⚡ HALF-OPEN PROBE</span>`;
        statusColor = 'var(--warning-clay-dark)';
        progressBar = `
          <div class="clay-progress-track" style="margin-top: 0.5rem;">
            <div class="clay-progress-bar" style="width: 100%; background-color: var(--warning-clay);"></div>
          </div>
        `;
        statusDetails = `
          <div style="display:flex; justify-content:space-between; font-family:var(--font-mono); font-size:0.8125rem;">
            <span style="color:var(--text-muted);">Canary Budget:</span>
            <span style="font-weight:700; color:#5C4300;">1 Probe In-Flight</span>
          </div>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.25rem;">
            Awaiting 1 successful response to reclose circuit.
          </div>
        `;
      }

      return `
        <div class="clay-card" style="padding: 1.5rem; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
              <span style="font-family: var(--font-mono); font-size: 0.875rem; font-weight: 700; color: var(--text-main);">${upstream}</span>
              ${stateBadge}
            </div>
            
            <div class="clay-recessed-soft" style="padding: 1rem; margin-bottom: 1rem;">
              ${statusDetails}
              ${progressBar}
            </div>
          </div>

          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button class="clay-btn clay-btn-error" style="padding: 0.4rem 0.85rem; font-size: 0.75rem; flex: 1;" onclick="BreakerManager.recordFailure('${upstream}')">
              Simulate 500 Fail
            </button>
            <button class="clay-btn clay-btn-tertiary" style="padding: 0.4rem 0.85rem; font-size: 0.75rem; flex: 1;" onclick="BreakerManager.recordSuccess('${upstream}')">
              Simulate 200 OK
            </button>
            <button class="clay-btn" style="padding: 0.4rem 0.85rem; font-size: 0.75rem;" onclick="BreakerManager.manualReset('${upstream}')" title="Reset circuit to Closed">
              Reset
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  renderTransitionHistory() {
    const list = document.getElementById('breaker-history-list');
    if (!list) return;

    if (this.transitionHistory.length === 0) {
      list.innerHTML = `<p style="color: var(--text-muted); font-size: 0.8125rem;">No breaker transitions recorded yet.</p>`;
      return;
    }

    list.innerHTML = this.transitionHistory.map(item => {
      let icon = 'sync';
      let badgeColor = 'var(--secondary-clay)';
      if (item.to === 'OPEN') {
        icon = 'error';
        badgeColor = 'var(--error-clay)';
      } else if (item.to === 'CLOSED') {
        icon = 'check_circle';
        badgeColor = 'var(--tertiary-clay)';
      } else {
        icon = 'science';
        badgeColor = 'var(--warning-clay)';
      }

      return `
        <div class="clay-recessed-soft" style="padding: 0.75rem 1rem; margin-bottom: 0.65rem; display: flex; align-items: flex-start; gap: 0.75rem;">
          <div style="width: 28px; height: 28px; border-radius: 50%; background: ${badgeColor}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">
            <span class="material-symbols-outlined" style="font-size: 1rem; color: var(--text-main);">${icon}</span>
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <span style="font-family: var(--font-mono); font-weight: 700; font-size: 0.8125rem;">${item.upstream} : ${item.from} → ${item.to}</span>
              <span style="font-family: var(--font-mono); font-size: 0.6875rem; color: var(--text-muted);">${item.time}</span>
            </div>
            <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.15rem;">${item.reason}</p>
          </div>
        </div>
      `;
    }).join('');
  },

  updateOverviewSummary() {
    const openCount = Object.values(GatewayData.breakers).filter(b => b.state === 'OPEN').length;
    const closedCount = Object.values(GatewayData.breakers).filter(b => b.state === 'CLOSED').length;
    const halfOpenCount = Object.values(GatewayData.breakers).filter(b => b.state === 'HALF_OPEN').length;

    const el = document.getElementById('kpi-breaker-status');
    if (el) {
      el.innerHTML = `${openCount} <span style="font-size: 1rem; font-weight: 400; color: var(--text-muted);">Open Trips</span>`;
    }

    const sub = document.getElementById('kpi-breaker-sub');
    if (sub) {
      sub.innerHTML = `${closedCount} Closed • ${halfOpenCount} Half-Open`;
    }
  }
};
