package proxy

import (
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"acc-mp/internal/breaker"
	"acc-mp/internal/config"
	"acc-mp/internal/router"
)

func TestHandler(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		writer.WriteHeader(http.StatusOK)
		_, _ = writer.Write([]byte(`{"service":"users"}`))
	}))
	defer upstream.Close()

	routes := router.New()
	routes.Insert("GET", "/users", upstream.URL)
	handler := NewHandler(routes)

	tests := []struct {
		name       string
		method     string
		path       string
		wantStatus int
		wantBody   string
	}{
		{name: "forwards matched route", method: "GET", path: "/users", wantStatus: http.StatusOK, wantBody: `{"service":"users"}`},
		{name: "returns not found", method: "GET", path: "/missing", wantStatus: http.StatusNotFound},
		{name: "returns not found for unknown method", method: "POST", path: "/users", wantStatus: http.StatusNotFound},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(test.method, test.path, nil)
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d", response.Code, test.wantStatus)
			}
			if test.wantBody != "" && response.Body.String() != test.wantBody {
				t.Fatalf("body = %q, want %q", response.Body.String(), test.wantBody)
			}
		})
	}
}

func TestHandlerReturnsBadGatewayWhenUpstreamIsDown(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {}))
	upstreamURL := upstream.URL
	upstream.Close()

	routes := router.New()
	routes.Insert("GET", "/users", upstreamURL)

	request := httptest.NewRequest(http.MethodGet, "/users", nil)
	response := httptest.NewRecorder()
	NewHandler(routes).ServeHTTP(response, request)

	if response.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusBadGateway)
	}
}

func TestHandlerPreservesUpstreamResponse(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(http.StatusCreated)
		_, _ = writer.Write([]byte("created"))
	}))
	defer upstream.Close()

	routes := router.New()
	routes.Insert("GET", "/users", upstream.URL)

	request := httptest.NewRequest(http.MethodGet, "/users", nil)
	response := httptest.NewRecorder()
	NewHandler(routes).ServeHTTP(response, request)

	body, err := io.ReadAll(response.Result().Body)
	if err != nil {
		t.Fatal(err)
	}
	if response.Code != http.StatusCreated || string(body) != "created" {
		t.Fatalf("response = (%d, %q), want (%d, %q)", response.Code, body, http.StatusCreated, "created")
	}
}

func TestHandlerReloadsWhileServingRequests(t *testing.T) {
	upstreamA := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		_, _ = writer.Write([]byte("service-a"))
	}))
	defer upstreamA.Close()
	upstreamB := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		_, _ = writer.Write([]byte("service-b"))
	}))
	defer upstreamB.Close()

	handler := NewHandler(nil)
	configurationA := config.Config{Routes: []config.Route{{Method: "GET", Path: "/users", Upstream: upstreamA.URL}}}
	configurationB := config.Config{Routes: []config.Route{{Method: "GET", Path: "/users", Upstream: upstreamB.URL}}}
	if err := handler.Reload(configurationA); err != nil {
		t.Fatal(err)
	}

	var waitGroup sync.WaitGroup
	errors := make(chan string, 1)
	for worker := 0; worker < 8; worker++ {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			for requestNumber := 0; requestNumber < 100; requestNumber++ {
				request := httptest.NewRequest(http.MethodGet, "/users", nil)
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				if response.Code != http.StatusOK || (response.Body.String() != "service-a" && response.Body.String() != "service-b") {
					select {
					case errors <- responseResult(response):
					default:
					}
					return
				}
			}
		}()
	}

	for reloadNumber := 0; reloadNumber < 100; reloadNumber++ {
		configuration := configurationA
		if reloadNumber%2 == 1 {
			configuration = configurationB
		}
		if err := handler.Reload(configuration); err != nil {
			t.Fatal(err)
		}
	}
	waitGroup.Wait()

	select {
	case message := <-errors:
		t.Fatal(message)
	default:
	}

	invalid := config.Config{Routes: []config.Route{
		{Method: "GET", Path: "/users", Upstream: upstreamB.URL},
		{Method: "get", Path: "/users/", Upstream: upstreamA.URL},
	}}
	if err := handler.Reload(invalid); err == nil {
		t.Fatal("Reload(invalid) returned nil error")
	}

	request := httptest.NewRequest(http.MethodGet, "/users", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || response.Body.String() != "service-b" {
		t.Fatalf("old route was not preserved after invalid reload: status=%d body=%q", response.Code, response.Body.String())
	}
}

func responseResult(response *httptest.ResponseRecorder) string {
	return "unexpected response: status=" + response.Result().Status + " body=" + response.Body.String()
}

func TestHandlerCircuitBreakerReopensAndRecovers(t *testing.T) {
	var healthy atomic.Bool
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if !healthy.Load() {
			http.Error(writer, "down", http.StatusBadGateway)
			return
		}
		_, _ = writer.Write([]byte("healthy"))
	}))
	defer upstream.Close()

	routes := router.New()
	routes.Insert("GET", "/users", upstream.URL)
	clock := &proxyClock{now: time.Unix(0, 0)}
	handler := NewHandlerWithBreaker(routes, breaker.Config{
		FailureThreshold: 2,
		OpenTimeout:      time.Minute,
		HalfOpenProbes:   1,
	}, clock)

	request := func() *httptest.ResponseRecorder {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/users", nil))
		return response
	}

	if response := request(); response.Code != http.StatusBadGateway {
		t.Fatalf("first failed request status = %d, want %d", response.Code, http.StatusBadGateway)
	}
	if response := request(); response.Code != http.StatusBadGateway {
		t.Fatalf("second failed request status = %d, want %d", response.Code, http.StatusBadGateway)
	}
	if response := request(); response.Code != http.StatusServiceUnavailable {
		t.Fatalf("open circuit status = %d, want %d", response.Code, http.StatusServiceUnavailable)
	}

	healthy.Store(true)
	if response := request(); response.Code != http.StatusServiceUnavailable {
		t.Fatalf("circuit before timeout status = %d, want %d", response.Code, http.StatusServiceUnavailable)
	}
	clock.Advance(time.Minute)
	if response := request(); response.Code != http.StatusOK || response.Body.String() != "healthy" {
		t.Fatalf("half-open probe response = (%d, %q), want (200, %q)", response.Code, response.Body.String(), "healthy")
	}
	if response := request(); response.Code != http.StatusOK {
		t.Fatalf("closed circuit response status = %d, want %d", response.Code, http.StatusOK)
	}
}

type proxyClock struct {
	mu  sync.Mutex
	now time.Time
}

func (clock *proxyClock) Now() time.Time {
	clock.mu.Lock()
	defer clock.mu.Unlock()
	return clock.now
}

func (clock *proxyClock) Advance(duration time.Duration) {
	clock.mu.Lock()
	clock.now = clock.now.Add(duration)
	clock.mu.Unlock()
}
