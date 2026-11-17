// Standalone Node.js Gateway, Stub Service & Dashboard Server
// Replaces the Go binaries when Go is not installed on the system.

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const STUB_PORT = 9001;
const PROXY_PORT = 8081;
const DASHBOARD_PORT = 3000;
const ROUTES_FILE = path.join(__dirname, 'routes.json');
const FRONTEND_DIR = path.join(__dirname, 'front-end');

// ==========================================
// 1. BACKEND STUB SERVICE (Port 9001)
// ==========================================
const stubState = {
  failed: false,
  delayMs: 0
};

const stubServer = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Admin controls
  if (pathname === '/admin/fail') {
    stubState.failed = true;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'failure mode enabled' }));
    return;
  }

  if (pathname === '/admin/reset') {
    stubState.failed = false;
    stubState.delayMs = 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'reset successful' }));
    return;
  }

  if (pathname === '/admin/slow') {
    const ms = parseInt(parsedUrl.query.ms, 10);
    if (isNaN(ms) || ms < 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ms must be a non-negative integer' }));
      return;
    }
    stubState.delayMs = ms;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'delay updated', ms: ms }));
    return;
  }

  // Execute with delay & failure simulation
  setTimeout(() => {
    if (stubState.failed) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'failure mode enabled' }));
      return;
    }

    if (pathname === '/users') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        { id: 1, name: "Ada Lovelace" },
        { id: 2, name: "Grace Hopper" }
      ], null, 2));
    } else if (pathname === '/products') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        { id: 1, name: "Notebook", price: 12.50 },
        { id: 2, name: "Pen", price: 2.75 }
      ], null, 2));
    } else if (pathname === '/orders') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        { id: 1, user_id: 1, product_id: 1, quantity: 2 },
        { id: 2, user_id: 2, product_id: 2, quantity: 5 }
      ], null, 2));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '404 not found on stub' }));
    }
  }, stubState.delayMs);
});

// ==========================================
// 2. REVERSE PROXY & GATEWAY (Port 8081)
// ==========================================
let routesConfig = { routes: [] };
const circuitBreakers = {}; // upstream -> { failures, state: 'CLOSED'|'OPEN'|'HALF-OPEN', openUntil: 0 }

function getCircuitBreaker(upstream) {
  if (!circuitBreakers[upstream]) {
    circuitBreakers[upstream] = {
      failures: 0,
      state: 'CLOSED',
      openUntil: 0
    };
  }
  const cb = circuitBreakers[upstream];
  const now = Date.now();
  if (cb.state === 'OPEN' && now >= cb.openUntil) {
    cb.state = 'HALF-OPEN';
  }
  return cb;
}

function recordBreakerSuccess(upstream) {
  const cb = getCircuitBreaker(upstream);
  cb.failures = 0;
  cb.state = 'CLOSED';
}

function recordBreakerFailure(upstream) {
  const cb = getCircuitBreaker(upstream);
  cb.failures++;
  if (cb.failures >= 3 || cb.state === 'HALF-OPEN') {
    cb.state = 'OPEN';
    cb.openUntil = Date.now() + 10000; // 10s cooldown
  }
}

function loadRoutes() {
  try {
    const raw = fs.readFileSync(ROUTES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.routes)) {
      routesConfig = parsed;
      console.log(`[Router] Loaded ${parsed.routes.length} routes from routes.json`);
    }
  } catch (err) {
    console.error(`[Router] Failed to load routes: ${err.message}`);
  }
}

// Initial load & 2-second poller
loadRoutes();
fs.watchFile(ROUTES_FILE, { interval: 2000 }, () => {
  console.log(`[Router] routes.json modified, reloading...`);
  loadRoutes();
});

const proxyServer = http.createServer((req, res) => {
  // CORS support
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url);
  const route = routesConfig.routes.find(r => r.method === req.method && r.path === parsedUrl.pathname);

  if (!route) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '404 route not found in gateway' }));
    return;
  }

  const upstream = route.upstream;
  const cb = getCircuitBreaker(upstream);

  if (cb.state === 'OPEN') {
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    res.end('upstream circuit open\n');
    return;
  }

  const upstreamUrl = url.parse(upstream);
  const proxyReq = http.request({
    hostname: upstreamUrl.hostname,
    port: upstreamUrl.port,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: upstreamUrl.host
    }
  }, (proxyRes) => {
    if (proxyRes.statusCode >= 500) {
      recordBreakerFailure(upstream);
    } else {
      recordBreakerSuccess(upstream);
    }

    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    recordBreakerFailure(upstream);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'bad gateway', message: err.message }));
  });

  req.pipe(proxyReq);
});

// ==========================================
// 3. FRONTEND STATIC FILE SERVER (Port 3000)
// ==========================================
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const frontendServer = http.createServer((req, res) => {
  let reqPath = url.parse(req.url).pathname;
  if (reqPath === '/' || reqPath === '/front-end' || reqPath === '/front-end/') {
    reqPath = '/index.html';
  } else if (reqPath.startsWith('/front-end/')) {
    reqPath = reqPath.replace('/front-end/', '/');
  }

  const safePath = path.normalize(path.join(FRONTEND_DIR, reqPath));
  if (!safePath.startsWith(FRONTEND_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(safePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File Not Found');
      return;
    }
    const ext = path.extname(safePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ==========================================
// LAUNCH SERVERS
// ==========================================
stubServer.listen(STUB_PORT, () => {
  console.log(`[Stub Server] Listening on http://localhost:${STUB_PORT}`);
});

proxyServer.listen(PROXY_PORT, () => {
  console.log(`[Gateway Proxy] Listening on http://localhost:${PROXY_PORT}`);
});

frontendServer.listen(DASHBOARD_PORT, () => {
  console.log(`[Frontend Dashboard] Ready at http://localhost:${DASHBOARD_PORT}`);
  console.log(`\n>>> SUCCESS: Frontend and Backend are CONNECTED! <<<`);
});
