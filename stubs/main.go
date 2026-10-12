package main

import (
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"
)

type serverState struct {
	mu        sync.RWMutex
	failed    bool
	delay     time.Duration
}

var port = flag.Int("port", 9001, "HTTP server port")

func main() {
	flag.Parse()

	state := &serverState{}
	mux := http.NewServeMux()

	mux.HandleFunc("GET /users", state.jsonHandler([]map[string]any{
		{"id": 1, "name": "Ada Lovelace"},
		{"id": 2, "name": "Grace Hopper"},
	}))
	mux.HandleFunc("GET /products", state.jsonHandler([]map[string]any{
		{"id": 1, "name": "Notebook", "price": 12.50},
		{"id": 2, "name": "Pen", "price": 2.75},
	}))
	mux.HandleFunc("GET /orders", state.jsonHandler([]map[string]any{
		{"id": 1, "user_id": 1, "product_id": 1, "quantity": 2},
		{"id": 2, "user_id": 2, "product_id": 2, "quantity": 5},
	}))
	mux.HandleFunc("GET /admin/fail", state.failHandler)
	mux.HandleFunc("GET /admin/slow", state.slowHandler)

	address := ":" + strconv.Itoa(*port)
	log.Printf("stub server listening on %s", address)
	if err := http.ListenAndServe(address, mux); err != nil {
		log.Fatal(err)
	}
}

func (state *serverState) jsonHandler(payload any) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		if !state.beforeRequest(writer) {
			return
		}

		writer.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(writer).Encode(payload)
	}
}

func (state *serverState) failHandler(writer http.ResponseWriter, request *http.Request) {
	if !state.beforeRequest(writer) {
		return
	}

	state.mu.Lock()
	state.failed = true
	state.mu.Unlock()

	writeJSON(writer, http.StatusOK, map[string]string{"status": "failure mode enabled"})
}

func (state *serverState) slowHandler(writer http.ResponseWriter, request *http.Request) {
	if !state.beforeRequest(writer) {
		return
	}

	milliseconds, err := strconv.Atoi(request.URL.Query().Get("ms"))
	if err != nil || milliseconds < 0 {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "ms must be a non-negative integer"})
		return
	}

	state.mu.Lock()
	state.delay = time.Duration(milliseconds) * time.Millisecond
	state.mu.Unlock()

	writeJSON(writer, http.StatusOK, map[string]any{
		"status": "delay updated",
		"ms":     milliseconds,
	})
}

func (state *serverState) beforeRequest(writer http.ResponseWriter) bool {
	state.mu.RLock()
	failed := state.failed
	delay := state.delay
	state.mu.RUnlock()

	if failed {
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "failure mode enabled"})
		return false
	}

	if delay > 0 {
		time.Sleep(delay)
	}
	return true
}

func writeJSON(writer http.ResponseWriter, status int, payload any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(payload)
}
