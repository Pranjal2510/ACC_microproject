package config

import "testing"

func TestValidate(t *testing.T) {
	tests := []struct {
		name    string
		config  Config
		wantErr bool
	}{
		{
			name: "valid routes",
			config: Config{Routes: []Route{
				{Method: "GET", Path: "/users", Upstream: "http://localhost:9001"},
				{Method: "POST", Path: "/users", Upstream: "https://users.example.com"},
			}},
		},
		{
			name: "duplicate method and path",
			config: Config{Routes: []Route{
				{Method: "GET", Path: "/users", Upstream: "http://localhost:9001"},
				{Method: "get", Path: "/users/", Upstream: "http://localhost:9002"},
			}},
			wantErr: true,
		},
		{
			name:    "empty path",
			config:  Config{Routes: []Route{{Method: "GET", Path: " ", Upstream: "http://localhost:9001"}}},
			wantErr: true,
		},
		{
			name:    "relative path",
			config:  Config{Routes: []Route{{Method: "GET", Path: "users", Upstream: "http://localhost:9001"}}},
			wantErr: true,
		},
		{
			name:    "bad URL",
			config:  Config{Routes: []Route{{Method: "GET", Path: "/users", Upstream: "localhost:9001"}}},
			wantErr: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := test.config.Validate()
			if (err != nil) != test.wantErr {
				t.Fatalf("Validate() error = %v, wantErr %t", err, test.wantErr)
			}
		})
	}
}
