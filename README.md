# Acc microproject step 1

Run three independent stub instances from the repository root:

```powershell
go run ./stubs -port 9001
go run ./stubs -port 9002
go run ./stubs -port 9003
```

Each instance exposes JSON endpoints:

```powershell
curl http://localhost:9001/users
curl http://localhost:9001/products
curl http://localhost:9001/orders
```

Configure delay for one instance. The delay applies to later requests in that instance:

```powershell
curl "http://localhost:9002/admin/slow?ms=500"
```

Enable failure mode for one instance. The command that enables it succeeds; all later requests to that instance return `500`:

```powershell
curl http://localhost:9003/admin/fail
curl -i http://localhost:9003/users
```

# Acc microproject step 4

Start the fake user service and hot-reloading proxy in separate terminals:

```powershell
go run ./stubs -port 9001
go run ./cmd/proxy
```

The proxy reads [routes.json](routes.json) at startup and checks it every two seconds. Requests use the current valid route table:

```powershell
curl.exe http://localhost:8080/users
```

Edit an upstream or add a valid route in `routes.json`; the proxy will pick it up on the next poll. Duplicate routes, empty paths, and invalid upstream URLs are rejected, leaving the previous route table active.

# Acc microproject step 6

The proxy has one circuit breaker per upstream. By default, three consecutive upstream failures open the circuit. Open circuits return `503` immediately; after ten seconds, one half-open probe is allowed. A successful probe closes the circuit, while a failed probe opens it again.
