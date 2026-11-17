/**
 * ROUTE EXPLORER & TRIE ROUTER SIMULATOR
 * Replicates internal/router Go prefix-tree matching with static-precedence & params
 */

window.RoutesManager = {
  // Simulates internal/router Trie lookup
  lookup(method, requestPath) {
    const cleanPath = '/' + requestPath.trim().replace(/^\/+|\/+$/g, '');
    const segments = cleanPath === '/' ? [] : cleanPath.slice(1).split('/');
    const upperMethod = method.toUpperCase();

    let bestMatch = null;

    for (const r of GatewayData.routes) {
      if (r.method.toUpperCase() !== upperMethod) continue;

      const rClean = '/' + r.path.trim().replace(/^\/+|\/+$/g, '');
      const rSegments = rClean === '/' ? [] : rClean.slice(1).split('/');

      // Check if candidate matches
      if (rSegments.length !== segments.length && !r.path.endsWith('/*')) {
        continue;
      }

      let matched = true;
      let staticCount = 0;
      const params = {};

      for (let i = 0; i < rSegments.length; i++) {
        const segPattern = rSegments[i];
        const segActual = segments[i];

        if (segPattern.startsWith(':')) {
          const paramName = segPattern.slice(1);
          params[paramName] = segActual;
        } else if (segPattern === segActual) {
          staticCount++;
        } else {
          matched = false;
          break;
        }
      }

      if (matched) {
        const candidate = {
          route: r,
          params: params,
          depth: rSegments.length,
          staticCount: staticCount
        };

        if (!bestMatch || 
            candidate.depth > bestMatch.depth || 
            (candidate.depth === bestMatch.depth && candidate.staticCount > bestMatch.staticCount)) {
          bestMatch = candidate;
        }
      }
    }

    return bestMatch;
  },

  renderRoutesTable(filter = '') {
    const tbody = document.getElementById('routes-table-body');
    if (!tbody) return;

    const term = filter.toLowerCase().trim();
    const filtered = GatewayData.routes.filter(r => 
      !term || r.path.toLowerCase().includes(term) || r.method.toLowerCase().includes(term) || r.upstream.toLowerCase().includes(term)
    );

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">No matching routes found</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(r => {
      const methodBadge = `<span class="clay-pill badge-${r.method.toLowerCase()}">${r.method}</span>`;
      const authBadge = r.auth === 'Public' 
        ? `<span class="clay-pill" style="background:var(--surface-trough); color:var(--text-muted);">Public</span>` 
        : `<span class="clay-pill" style="background:var(--primary-clay-light); color:var(--primary-clay-deep);">🔒 RS256</span>`;

      return `
        <tr>
          <td>${methodBadge}</td>
          <td><code style="font-family: var(--font-mono); font-weight: 600; color: var(--text-main);">${r.path}</code></td>
          <td><span style="font-family: var(--font-mono); color: var(--secondary-clay-dark); font-size: 0.8125rem;">${r.upstream}</span></td>
          <td>${authBadge}</td>
          <td><span style="font-family: var(--font-mono); font-size: 0.8125rem; color: var(--tertiary-clay-dark);">${r.latency}</span></td>
          <td>
            <button class="clay-btn" style="padding: 0.3rem 0.75rem; font-size: 0.75rem;" onclick="RoutesManager.testSpecificRoute('${r.method}', '${r.path}')">
              Test
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  testSpecificRoute(method, path) {
    const methodSelect = document.getElementById('test-method');
    const pathInput = document.getElementById('test-path');
    if (methodSelect && pathInput) {
      methodSelect.value = method;
      pathInput.value = path.replace(':id', '42');
      this.executeRouteTest();
    }
  },

  executeRouteTest() {
    const method = document.getElementById('test-method')?.value || 'GET';
    const path = document.getElementById('test-path')?.value || '/users';
    const resultBox = document.getElementById('test-resolution-result');
    if (!resultBox) return;

    const match = this.lookup(method, path);

    if (match) {
      const paramStr = Object.keys(match.params).length > 0 
        ? JSON.stringify(match.params, null, 2) 
        : "None (Static match)";

      resultBox.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--tertiary-clay-dark); font-weight: 700; margin-bottom: 0.5rem;">
          <span class="material-symbols-outlined" style="font-size: 1.25rem;">check_circle</span>
          <span>MATCH FOUND (200 OK Upstream Target)</span>
        </div>
        <div style="display: grid; grid-template-columns: 120px 1fr; gap: 0.5rem; font-family: var(--font-mono); font-size: 0.8125rem;">
          <span style="color: var(--text-muted);">Pattern:</span>
          <span style="font-weight: 600; color: var(--text-main);">${match.route.path}</span>

          <span style="color: var(--text-muted);">Upstream:</span>
          <span style="color: var(--secondary-clay-dark); font-weight: 600;">${match.route.upstream}${path}</span>

          <span style="color: var(--text-muted);">Parameters:</span>
          <span style="color: var(--primary-clay-dark); font-weight: 600;">${paramStr}</span>

          <span style="color: var(--text-muted);">Specificity:</span>
          <span>Depth: ${match.depth} • Static Segments: ${match.staticCount}</span>
        </div>
      `;
      resultBox.style.borderColor = "var(--tertiary-clay)";
    } else {
      resultBox.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--error-clay-dark); font-weight: 700; margin-bottom: 0.5rem;">
          <span class="material-symbols-outlined" style="font-size: 1.25rem;">cancel</span>
          <span>404 NOT FOUND</span>
        </div>
        <p style="font-size: 0.8125rem; color: var(--text-muted);">
          No registered route matches HTTP method <strong>${method}</strong> and path <strong>${path}</strong>.
          The Go proxy will return standard HTTP 404.
        </p>
      `;
      resultBox.style.borderColor = "var(--error-clay)";
    }
  }
};
