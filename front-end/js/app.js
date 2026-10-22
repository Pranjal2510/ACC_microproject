/**
 * MASTER APPLICATION ORCHESTRATOR
 * Tab routing, telemetry loop, toast notifications & backend connectivity
 */

document.addEventListener('DOMContentLoaded', () => {
  // Global Toast function
  window.showToast = function(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'clay-toast';

    let icon = 'info';
    let iconColor = 'var(--primary-clay-dark)';

    if (type === 'success') {
      icon = 'check_circle';
      iconColor = 'var(--tertiary-clay-dark)';
    } else if (type === 'warning') {
      icon = 'warning';
      iconColor = 'var(--warning-clay-dark)';
    } else if (type === 'error') {
      icon = 'error';
      iconColor = 'var(--error-clay-dark)';
    }

    toast.innerHTML = `
      <span class="material-symbols-outlined" style="color: ${iconColor}; font-size: 1.35rem;">${icon}</span>
      <span style="color: var(--text-main);">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  };

  // View Navigation
  const navItems = document.querySelectorAll('.nav-item');
  const viewSections = document.querySelectorAll('.view-section');
  const breadcrumbCurrent = document.getElementById('breadcrumb-current');

  function switchView(viewId) {
    navItems.forEach(item => {
      if (item.getAttribute('data-view') === viewId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    viewSections.forEach(section => {
      if (section.id === `view-${viewId}`) {
        section.classList.add('active');
      } else {
        section.classList.remove('active');
      }
    });

    if (breadcrumbCurrent) {
      const titles = {
        'overview': 'Overview',
        'routes': 'Route Explorer',
        'breakers': 'Circuit Breakers',
        'config': 'Configuration',
        'security': 'Security & JWT',
        'loadtest': 'Load Testing',
        'logs': 'Request Logs',
        'sandbox': 'Live Gateway Sandbox'
      };
      breadcrumbCurrent.textContent = titles[viewId] || 'Overview';
    }

    // Refresh view data if needed
    if (viewId === 'routes' && window.RoutesManager) {
      window.RoutesManager.renderRoutesTable();
    } else if (viewId === 'breakers' && window.BreakerManager) {
      window.BreakerManager.render();
    } else if (viewId === 'loadtest' && window.LoadtestManager) {
      window.LoadtestManager.render();
    } else if (viewId === 'logs' && window.SandboxManager) {
      window.SandboxManager.renderLogs();
    }

    window.location.hash = viewId;
  }

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const viewId = item.getAttribute('data-view');
      switchView(viewId);
    });
  });

  // Check URL Hash on load
  const initialHash = window.location.hash.replace('#', '') || 'overview';
  if (document.getElementById(`view-${initialHash}`)) {
    switchView(initialHash);
  } else {
    switchView('overview');
  }

  // Live Gateway Connectivity Ping
  async function checkGatewayLive() {
    const badge = document.getElementById('gateway-connection-badge');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 800);
      const res = await fetch('http://localhost:8080/users', { signal: controller.signal });
      clearTimeout(timeoutId);

      if (badge) {
        badge.innerHTML = `
          <span class="w-2 h-2 rounded-full" style="width:8px; height:8px; border-radius:50%; background:var(--tertiary-clay-dark); display:inline-block;"></span>
          <span style="font-family:var(--font-mono); font-size:0.6875rem; font-weight:700; color:var(--tertiary-clay-deep);">LIVE GATEWAY (:8080)</span>
        `;
        badge.style.backgroundColor = "var(--tertiary-clay-light)";
      }
    } catch (e) {
      if (badge) {
        badge.innerHTML = `
          <span class="w-2 h-2 rounded-full" style="width:8px; height:8px; border-radius:50%; background:var(--secondary-clay-dark); display:inline-block;"></span>
          <span style="font-family:var(--font-mono); font-size:0.6875rem; font-weight:700; color:var(--secondary-clay-deep);">DEMO SIMULATION MODE</span>
        `;
        badge.style.backgroundColor = "var(--secondary-clay-light)";
      }
    }
  }

  checkGatewayLive();
  setInterval(checkGatewayLive, 5000);

  // Initialize submodules
  if (window.RoutesManager) window.RoutesManager.renderRoutesTable();
  if (window.BreakerManager) window.BreakerManager.init();
  if (window.ConfigManager) window.ConfigManager.init();
  if (window.SecurityManager) window.SecurityManager.init();
  if (window.LoadtestManager) window.LoadtestManager.render();
  if (window.SandboxManager) window.SandboxManager.init();

  // Export Snapshot function
  const exportBtn = document.getElementById('btn-export-snapshot');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const snapshot = {
        timestamp: new Date().toISOString(),
        gateway: "acc-mp",
        version: "v1.4.2 Go 1.22",
        generation: GatewayData.config.activeGeneration,
        routes: GatewayData.routes,
        breakers: GatewayData.breakers,
        benchmarks: GatewayData.benchmarks
      };
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `acc-mp-gateway-snapshot-gen${GatewayData.config.activeGeneration}.json`;
      a.click();
      URL.revokeObjectURL(url);
      window.showToast("Gateway configuration & telemetry snapshot exported", "success");
    });
  }

  // Quick Action Buttons
  const reloadBtn = document.getElementById('btn-global-reload');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      if (window.ConfigManager) {
        window.ConfigManager.forceAtomicSwap();
      }
    });
  }
});
