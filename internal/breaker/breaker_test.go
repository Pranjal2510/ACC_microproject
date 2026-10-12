package breaker

import (
	"sync"
	"testing"
	"time"
)

type fakeClock struct {
	mu  sync.Mutex
	now time.Time
}

func (clock *fakeClock) Now() time.Time {
	clock.mu.Lock()
	defer clock.mu.Unlock()
	return clock.now
}

func (clock *fakeClock) Advance(duration time.Duration) {
	clock.mu.Lock()
	clock.now = clock.now.Add(duration)
	clock.mu.Unlock()
}

func TestCircuitBreakerLifecycle(t *testing.T) {
	clock := &fakeClock{now: time.Unix(0, 0)}
	breaker := New(Config{FailureThreshold: 2, OpenTimeout: time.Minute, HalfOpenProbes: 2}, clock)

	if !breaker.Allow() || !breaker.Allow() {
		t.Fatal("closed breaker should allow requests")
	}
	breaker.Success()
	breaker.Failure()
	if breaker.State() != Closed {
		t.Fatalf("state after one failure = %v, want Closed", breaker.State())
	}
	breaker.Failure()
	if breaker.State() != Open {
		t.Fatalf("state after threshold = %v, want Open", breaker.State())
	}
	if breaker.Allow() {
		t.Fatal("open breaker should reject requests before timeout")
	}

	clock.Advance(time.Minute)
	if !breaker.Allow() || !breaker.Allow() {
		t.Fatal("half-open breaker should allow its probe limit")
	}
	if breaker.Allow() {
		t.Fatal("half-open breaker should reject requests over its probe limit")
	}
	breaker.Success()
	if breaker.State() != HalfOpen {
		t.Fatalf("state after first successful probe = %v, want HalfOpen", breaker.State())
	}
	breaker.Success()
	if breaker.State() != Closed {
		t.Fatalf("state after successful probes = %v, want Closed", breaker.State())
	}
}

func TestHalfOpenFailureReopens(t *testing.T) {
	clock := &fakeClock{now: time.Unix(0, 0)}
	breaker := New(Config{FailureThreshold: 1, OpenTimeout: time.Minute, HalfOpenProbes: 1}, clock)

	if !breaker.Allow() {
		t.Fatal("closed breaker should allow request")
	}
	breaker.Failure()
	clock.Advance(time.Minute)
	if !breaker.Allow() {
		t.Fatal("breaker should allow half-open probe")
	}
	breaker.Failure()
	if breaker.State() != Open {
		t.Fatalf("state after failed probe = %v, want Open", breaker.State())
	}
}
