# Local load tests

These tests use k6 and write raw JSON output under `docs/`. Set `TOKEN` to a valid JWT for gateway requests.

Install k6 if needed, then run from the repository root:

```powershell
k6 run --out json=docs/route-reload.json loadtest/route_reload.js
k6 run --out json=docs/breaker-failfast.json loadtest/breaker_failfast.js
k6 run --out json=docs/latency.json loadtest/latency.js
```

## Route reload

Start the fake service and authenticated gateway, then run `route_reload.js`. While it runs, edit `routes.json` between valid route configurations. The `route_reload_failed_requests` counter must remain zero.

```powershell
$env:TOKEN = 'PASTE_VALID_TOKEN'
k6 run --out json=docs/route-reload.json loadtest/route_reload.js
```

## Breaker fail-fast

Start `breaker_failfast.js`, then stop the fake service on port `9001`. The first `503` is recorded as `breaker_first_503_ms`; `breaker_fast_503_total` confirms that the circuit opened instead of waiting on repeated upstream timeouts. Restart the service and wait for the half-open probe to recover it.

```powershell
$env:TOKEN = 'PASTE_VALID_TOKEN'
k6 run --out json=docs/breaker-failfast.json loadtest/breaker_failfast.js
```

## Latency comparison

`latency.js` records `direct_latency_ms` and `gateway_latency_ms` as k6 Trend metrics. The k6 summary reports p50 and p99 for both metrics.

```powershell
$env:TOKEN = 'PASTE_VALID_TOKEN'
k6 run --out json=docs/latency.json loadtest/latency.js
```

The JSON files are raw k6 samples and should be kept with the local run artifacts. They are intentionally not generated with fabricated values when k6 is unavailable.
