# ACC-MP Frontend Dashboard

A tactile, claymorphic developer dashboard and operations control plane for the **ACC-MP Go Reverse Proxy & API Gateway**.

## Design Philosophy

This dashboard strictly follows the **Tactile Cloud Core** design system with **enhanced claymorphism features**:
- **Volumetric Multi-Source Lighting**: Specular directional highlights (`rgba(255, 255, 255, 0.95)`) paired with ambient occlusion shadows (`rgba(175, 162, 198, 0.28)`).
- **Concave Troughs & Inset Wells**: Deeply sculpted wells for search boxes, code editors, and toggle tracks.
- **Tactile Push Physics**: Buttons and pill badges depress with realistic concave shadow shifts on click.
- **Squircular & Pill Geometry**: Curved ceramic silhouettes (`rounded-xl` and `9999px`) in warm mineral pastels.

## Views & Capabilities

1. **Overview Dashboard**: Cluster health, live throughput (req/s), p50/p99 latency meters, upstream topology cards, and real-time event streaming.
2. **Route Explorer**: Trie prefix-tree hierarchy inspector, route table, and interactive path resolution simulator with `:id` parameter extraction.
3. **Circuit Breakers**: Finite state machine (Closed, Open, Half-Open), live failure progress meters, 10-second recovery cooldown countdowns, and fault injection triggers.
4. **Configuration & Hot Reload**: Live `routes.json` editor, AST validation dry-run, atomic pointer swap (`atomic.Pointer[router.Router]`) generation tracker, and 2.0s polling daemon heartbeat.
5. **Security & JWT**: RSA 2048-bit public key inspector (`tmp/keys/public.pem`), RS256 token verification sandbox, claims inspector, and token minter.
6. **Load Testing**: Visualization of real k6 benchmark runs from `docs/latency.json`, `docs/breaker-failfast.json`, and `docs/route-reload.json`.
7. **Request Logs**: Searchable and filterable request audit ledger with expandable payload inspector.
8. **Live API Sandbox**: Interactive HTTP client to send real or simulated requests to the Go proxy with JWT tokens.

## How to Run

### Option 1: Direct File
Open `front-end/index.html` directly in any modern browser (Chrome, Edge, Firefox, Safari).

### Option 2: Local HTTP Server
Run a simple HTTP server from the project root:
```powershell
python -m http.server 3000
```
Then navigate to `http://localhost:3000/front-end/`.

### Option 3: Alongside the Go Proxy & Stubs
Start the Go proxy and backend stubs:
```powershell
go run ./stubs -port 9001
go run ./cmd/proxy -port 8080
```
The frontend automatically detects the live proxy on port 8080 and connects seamlessly.
