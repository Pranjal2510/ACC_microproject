package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"time"

	"acc-mp/internal/auth"
	"acc-mp/internal/proxy"
)

var port = flag.String("port", "8080", "HTTP proxy port")
var routesFile = flag.String("routes", "routes.json", "Route configuration file")
var publicKeyFile = flag.String("public-key", "tmp/keys/public.pem", "RSA public key PEM file")
var issuer = flag.String("issuer", "acc-mp", "expected JWT issuer")
var audience = flag.String("audience", "acc-proxy", "expected JWT audience")

func main() {
	flag.Parse()

	handler := proxy.NewHandler(nil)
	if err := handler.ReloadFile(*routesFile); err != nil {
		log.Fatalf("unable to load routes: %v", err)
	}
	go pollRoutes(handler, *routesFile)

	authenticatedHandler, err := auth.New(*publicKeyFile, *issuer, *audience, handler)
	if err != nil {
		log.Fatalf("unable to load authentication key: %v", err)
	}

	address := ":" + *port
	log.Printf("proxy listening on %s", address)
	if err := http.ListenAndServe(address, authenticatedHandler); err != nil {
		log.Fatal(err)
	}
}

func pollRoutes(handler *proxy.Handler, filename string) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	var lastModTime time.Time
	var lastSize int64
	for range ticker.C {
		info, err := os.Stat(filename)
		if err != nil {
			log.Printf("unable to stat routes file: %v", err)
			continue
		}
		if info.ModTime().Equal(lastModTime) && info.Size() == lastSize {
			continue
		}
		if err := handler.ReloadFile(filename); err != nil {
			continue
		}
		lastModTime = info.ModTime()
		lastSize = info.Size()
		log.Printf("reloaded routes from %s", filename)
	}
}
