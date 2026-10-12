package breaker

import (
	"sync"
	"time"
)

type State uint8

const (
	Closed State = iota
	Open
	HalfOpen
)

type Clock interface {
	Now() time.Time
}

type RealClock struct{}

func (RealClock) Now() time.Time {
	return time.Now()
}

type Config struct {
	FailureThreshold int
	OpenTimeout      time.Duration
	HalfOpenProbes   int
}

type CircuitBreaker struct {
	mu             sync.Mutex
	config         Config
	clock          Clock
	state          State
	failures       int
	openedAt       time.Time
	probesInFlight int
	probeSuccesses int
}

func New(config Config, clock Clock) *CircuitBreaker {
	if config.FailureThreshold < 1 {
		config.FailureThreshold = 1
	}
	if config.OpenTimeout <= 0 {
		config.OpenTimeout = 10 * time.Second
	}
	if config.HalfOpenProbes < 1 {
		config.HalfOpenProbes = 1
	}
	if clock == nil {
		clock = RealClock{}
	}
	return &CircuitBreaker{config: config, clock: clock}
}

func (breaker *CircuitBreaker) Allow() bool {
	breaker.mu.Lock()
	defer breaker.mu.Unlock()

	switch breaker.state {
	case Closed:
		return true
	case Open:
		if breaker.clock.Now().Before(breaker.openedAt.Add(breaker.config.OpenTimeout)) {
			return false
		}
		breaker.state = HalfOpen
		breaker.probesInFlight = 0
		breaker.probeSuccesses = 0
	}

	if breaker.probesInFlight >= breaker.config.HalfOpenProbes {
		return false
	}
	breaker.probesInFlight++
	return true
}

func (breaker *CircuitBreaker) Success() {
	breaker.mu.Lock()
	defer breaker.mu.Unlock()

	switch breaker.state {
	case Closed:
		breaker.failures = 0
	case HalfOpen:
		if breaker.probesInFlight > 0 {
			breaker.probesInFlight--
		}
		breaker.probeSuccesses++
		if breaker.probeSuccesses >= breaker.config.HalfOpenProbes {
			breaker.state = Closed
			breaker.failures = 0
			breaker.probesInFlight = 0
			breaker.probeSuccesses = 0
		}
	}
}

func (breaker *CircuitBreaker) Failure() {
	breaker.mu.Lock()
	defer breaker.mu.Unlock()

	switch breaker.state {
	case Closed:
		breaker.failures++
		if breaker.failures >= breaker.config.FailureThreshold {
			breaker.open()
		}
	case HalfOpen:
		breaker.open()
	}
}

func (breaker *CircuitBreaker) State() State {
	breaker.mu.Lock()
	defer breaker.mu.Unlock()
	return breaker.state
}

func (breaker *CircuitBreaker) open() {
	breaker.state = Open
	breaker.openedAt = breaker.clock.Now()
	breaker.failures = 0
	breaker.probesInFlight = 0
	breaker.probeSuccesses = 0
}
