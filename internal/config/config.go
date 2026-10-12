package config

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path"
	"strings"
)

type Config struct {
	Routes []Route `json:"routes"`
}

type Route struct {
	Method   string `json:"method"`
	Path     string `json:"path"`
	Upstream string `json:"upstream"`
}

func Load(filename string) (Config, error) {
	file, err := os.Open(filename)
	if err != nil {
		return Config{}, err
	}
	defer file.Close()

	var configuration Config
	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&configuration); err != nil {
		return Config{}, fmt.Errorf("decode routes: %w", err)
	}
	if err := configuration.Validate(); err != nil {
		return Config{}, err
	}
	return configuration, nil
}

func (configuration Config) Validate() error {
	seen := make(map[string]struct{}, len(configuration.Routes))
	for index, route := range configuration.Routes {
		method := strings.ToUpper(strings.TrimSpace(route.Method))
		if method == "" {
			return fmt.Errorf("route %d: method is empty", index)
		}
		if strings.TrimSpace(route.Path) == "" || !strings.HasPrefix(strings.TrimSpace(route.Path), "/") {
			return fmt.Errorf("route %d: path must be a non-empty absolute path", index)
		}

		normalizedPath := path.Clean(strings.TrimSpace(route.Path))
		key := method + " " + normalizedPath
		if _, exists := seen[key]; exists {
			return fmt.Errorf("route %d: duplicate route %q", index, key)
		}
		seen[key] = struct{}{}

		target, err := url.Parse(strings.TrimSpace(route.Upstream))
		if err != nil || target.Host == "" || (target.Scheme != "http" && target.Scheme != "https") {
			return fmt.Errorf("route %d: invalid upstream URL %q", index, route.Upstream)
		}
	}
	return nil
}
