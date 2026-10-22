/**
 * ACC-MP GATEWAY CORE DATA STORE
 * Mirrors the Go backend state (routes, breakers, configs, telemetry, JWT auth)
 */

window.GatewayData = {
  // Current active routes matching routes.json
  routes: [
    { id: "r1", method: "GET", path: "/users", upstream: "http://localhost:9001", auth: "RS256", breaker: "Active (Threshold: 3)", latency: "1.2ms" },
    { id: "r2", method: "GET", path: "/products", upstream: "http://localhost:9001", auth: "RS256", breaker: "Active (Threshold: 3)", latency: "2.1ms" },
    { id: "r3", method: "GET", path: "/orders", upstream: "http://localhost:9001", auth: "RS256", breaker: "Active (Threshold: 3)", latency: "4.8ms" },
    { id: "r4", method: "GET", path: "/users/:id", upstream: "http://localhost:9001", auth: "RS256", breaker: "Active (Threshold: 3)", latency: "1.4ms" },
    { id: "r5", method: "POST", path: "/orders", upstream: "http://localhost:9001", auth: "RS256", breaker: "Active (Threshold: 3)", latency: "5.6ms" },
    { id: "r6", method: "GET", path: "/products/:id", upstream: "http://localhost:9002", auth: "RS256", breaker: "Active (Threshold: 3)", latency: "2.3ms" },
    { id: "r7", method: "GET", path: "/healthz", upstream: "Gateway Internal", auth: "Public", breaker: "Bypassed", latency: "0.2ms" }
  ],

  // Upstream backend service nodes (Stub instances)
  upstreams: [
    {
      id: "us-1",
      name: "stub-users-products (Port 9001)",
      url: "http://localhost:9001",
      status: "healthy", // healthy, slow, failed
      healthCode: "200 OK",
      p99Latency: "2.4ms",
      errorRate: "0.00%",
      lastProbe: "2s ago",
      routesHandled: ["/users", "/products", "/orders"]
    },
    {
      id: "us-2",
      name: "stub-slow-simulator (Port 9002)",
      url: "http://localhost:9002",
      status: "healthy",
      healthCode: "200 OK",
      p99Latency: "3.8ms",
      errorRate: "0.00%",
      lastProbe: "3s ago",
      routesHandled: ["/products/:id"]
    },
    {
      id: "us-3",
      name: "stub-chaos-fail (Port 9003)",
      url: "http://localhost:9003",
      status: "healthy",
      healthCode: "200 OK",
      p99Latency: "1.9ms",
      errorRate: "0.00%",
      lastProbe: "1s ago",
      routesHandled: ["Custom Test Routes"]
    }
  ],

  // Circuit Breakers mapped per upstream (internal/breaker)
  breakers: {
    "http://localhost:9001": {
      upstream: "http://localhost:9001",
      state: "CLOSED", // CLOSED, OPEN, HALF_OPEN
      failures: 0,
      failureThreshold: 3,
      openTimeoutMs: 10000,
      halfOpenProbes: 1,
      probesInFlight: 0,
      probeSuccesses: 0,
      openedAt: null,
      cooldownRemaining: 0,
      fast503ShedCount: 0,
      successCount: 1420
    },
    "http://localhost:9002": {
      upstream: "http://localhost:9002",
      state: "CLOSED",
      failures: 0,
      failureThreshold: 3,
      openTimeoutMs: 10000,
      halfOpenProbes: 1,
      probesInFlight: 0,
      probeSuccesses: 0,
      openedAt: null,
      cooldownRemaining: 0,
      fast503ShedCount: 0,
      successCount: 840
    },
    "http://localhost:9003": {
      upstream: "http://localhost:9003",
      state: "CLOSED",
      failures: 0,
      failureThreshold: 3,
      openTimeoutMs: 10000,
      halfOpenProbes: 1,
      probesInFlight: 0,
      probeSuccesses: 0,
      openedAt: null,
      cooldownRemaining: 0,
      fast503ShedCount: 0,
      successCount: 310
    }
  },

  // Configuration status and polling watcher
  config: {
    filename: "routes.json",
    path: "c:/projects/ACC_microproject/routes.json",
    pollingInterval: "2.0s",
    activeGeneration: 42,
    lastSwapTime: "Just now",
    sha: "4f8a2c79e",
    droppedConnections: 0,
    rawContent: JSON.stringify({
      "routes": [
        {
          "method": "GET",
          "path": "/users",
          "upstream": "http://localhost:9001"
        },
        {
          "method": "GET",
          "path": "/products",
          "upstream": "http://localhost:9001"
        },
        {
          "method": "GET",
          "path": "/orders",
          "upstream": "http://localhost:9001"
        }
      ]
    }, null, 2)
  },

  // Security specs & RSA keys
  security: {
    algorithm: "RS256",
    keyType: "RSA 2048-bit PKCS#1",
    publicKeyFile: "tmp/keys/public.pem",
    issuer: "acc-mp",
    audience: "acc-proxy",
    tokenLifetime: "15m",
    publicKeyPem: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0wM5YxX3lV2vG...
...[RSA 2048-BIT ACC-MP PROXY PUBLIC KEY LOADED IN CACHE]...
-----END PUBLIC KEY-----`
  },

  // Initial audit / request log entries
  logs: [
    { id: "req-9842", time: "10:45:12", method: "GET", path: "/users", status: 200, latency: "1.4ms", upstream: "http://localhost:9001", client: "127.0.0.1", breaker: "CLOSED" },
    { id: "req-9841", time: "10:45:10", method: "GET", path: "/products", status: 200, latency: "2.1ms", upstream: "http://localhost:9001", client: "127.0.0.1", breaker: "CLOSED" },
    { id: "req-9840", time: "10:45:08", method: "GET", path: "/orders", status: 200, latency: "3.7ms", upstream: "http://localhost:9001", client: "127.0.0.1", breaker: "CLOSED" },
    { id: "req-9839", time: "10:45:02", method: "GET", path: "/users/2", status: 200, latency: "1.8ms", upstream: "http://localhost:9001", client: "127.0.0.1", breaker: "CLOSED" },
    { id: "req-9838", time: "10:44:50", method: "POST", path: "/orders", status: 201, latency: "6.2ms", upstream: "http://localhost:9001", client: "127.0.0.1", breaker: "CLOSED" }
  ],

  // k6 Benchmark run results from docs/
  benchmarks: {
    latency: {
      directAvg: "0.54ms",
      gatewayAvg: "1.08ms",
      p50: "1.08ms",
      p90: "1.64ms",
      p95: "2.15ms",
      p99: "14.2ms",
      overhead: "0.54ms"
    },
    failfast: {
      totalRequests: 147,
      fast503Total: 143,
      avgFailfastLatency: "1.46ms",
      minLatency: "0.31ms",
      maxLatency: "21.8ms",
      successChecks: "100.00%",
      timeSavedSec: "42.9s"
    },
    routeReload: {
      vus: 10,
      duration: "60s",
      droppedRequests: 0,
      status: "PASSED (0 failed requests during continuous JSON mutations)"
    }
  }
};
