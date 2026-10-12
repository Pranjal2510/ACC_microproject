package proxy

import (
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"sync"
	"sync/atomic"
	"time"

	"acc-mp/internal/breaker"
	"acc-mp/internal/config"
	"acc-mp/internal/router"
)

type Handler struct {
	current  atomic.Pointer[router.Router]
	logger   *log.Logger
	breakers sync.Map
	config   breaker.Config
	clock    breaker.Clock
}

func NewHandler(routeTable *router.Router) *Handler {
	return NewHandlerWithBreaker(routeTable, breaker.Config{
		FailureThreshold: 3,
		OpenTimeout:      10 * time.Second,
		HalfOpenProbes:   1,
	}, breaker.RealClock{})
}

func NewHandlerWithBreaker(routeTable *router.Router, breakerConfig breaker.Config, clock breaker.Clock) *Handler {
	handler := &Handler{logger: log.Default(), config: breakerConfig}
	handler.clock = clock
	if routeTable != nil {
		handler.current.Store(routeTable)
	}
	return handler
}

func (handler *Handler) Reload(configuration config.Config) error {
	if err := configuration.Validate(); err != nil {
		handler.logger.Printf("rejecting route reload: %v", err)
		return err
	}

	newRouter := router.New()
	for _, route := range configuration.Routes {
		newRouter.Insert(route.Method, route.Path, route.Upstream)
	}
	handler.current.Store(newRouter)
	return nil
}

func (handler *Handler) ReloadFile(filename string) error {
	configuration, err := config.Load(filename)
	if err != nil {
		handler.logger.Printf("rejecting route reload from %s: %v", filename, err)
		return err
	}
	return handler.Reload(configuration)
}

func (handler *Handler) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	routeTable := handler.current.Load()
	if routeTable == nil {
		http.Error(writer, "service unavailable", http.StatusServiceUnavailable)
		return
	}

	upstream, _, found := routeTable.Lookup(request.Method, request.URL.Path)
	if !found {
		http.NotFound(writer, request)
		return
	}

	circuit := handler.breakerFor(upstream)
	if !circuit.Allow() {
		http.Error(writer, "upstream circuit open", http.StatusServiceUnavailable)
		return
	}

	target, err := url.Parse(upstream)
	if err != nil || target.Scheme == "" || target.Host == "" {
		circuit.Failure()
		http.Error(writer, "bad gateway", http.StatusBadGateway)
		return
	}

	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.ErrorHandler = func(writer http.ResponseWriter, request *http.Request, err error) {
		http.Error(writer, "bad gateway", http.StatusBadGateway)
	}
	responseWriter := &statusWriter{ResponseWriter: writer}
	proxy.ServeHTTP(responseWriter, request)
	if responseWriter.statusCode >= http.StatusInternalServerError {
		circuit.Failure()
	} else {
		circuit.Success()
	}
}

func (handler *Handler) breakerFor(upstream string) *breaker.CircuitBreaker {
	if existing, ok := handler.breakers.Load(upstream); ok {
		return existing.(*breaker.CircuitBreaker)
	}
	created := breaker.New(handler.config, handler.clock)
	actual, _ := handler.breakers.LoadOrStore(upstream, created)
	return actual.(*breaker.CircuitBreaker)
}

type statusWriter struct {
	http.ResponseWriter
	statusCode int
}

func (writer *statusWriter) WriteHeader(statusCode int) {
	if writer.statusCode != 0 {
		return
	}
	writer.statusCode = statusCode
	writer.ResponseWriter.WriteHeader(statusCode)
}

func (writer *statusWriter) Write(body []byte) (int, error) {
	if writer.statusCode == 0 {
		writer.WriteHeader(http.StatusOK)
	}
	return writer.ResponseWriter.Write(body)
}
