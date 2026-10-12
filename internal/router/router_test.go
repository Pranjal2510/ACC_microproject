package router

import (
	"reflect"
	"testing"
)

func TestRouterLookup(t *testing.T) {
	router := New()
	router.Insert("GET", "/users", "users")
	router.Insert("POST", "/users", "create-users")
	router.Insert("GET", "/users/:id", "user")
	router.Insert("GET", "/users/admin", "admin")
	router.Insert("GET", "/api", "api")
	router.Insert("GET", "/api/:version", "api-version")
	router.Insert("GET", "/api/v1", "api-v1")

	tests := []struct {
		name         string
		method       string
		path         string
		wantUpstream string
		wantParams   Params
		wantFound    bool
	}{
		{name: "static path", method: "GET", path: "/users", wantUpstream: "users", wantFound: true},
		{name: "trailing slash", method: "GET", path: "/users/", wantUpstream: "users", wantFound: true},
		{name: "path parameter", method: "GET", path: "/users/42", wantUpstream: "user", wantParams: Params{"id": "42"}, wantFound: true},
		{name: "static beats parameter", method: "GET", path: "/users/admin", wantUpstream: "admin", wantFound: true},
		{name: "longest prefix", method: "GET", path: "/api/v1/orders", wantUpstream: "api-v1", wantFound: true},
		{name: "method-specific route", method: "POST", path: "/users", wantUpstream: "create-users", wantFound: true},
		{name: "unknown method", method: "DELETE", path: "/users", wantFound: false},
		{name: "unknown path", method: "GET", path: "/products", wantFound: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			upstream, params, found := router.Lookup(test.method, test.path)
			if upstream != test.wantUpstream || found != test.wantFound || !reflect.DeepEqual(params, test.wantParams) {
				t.Fatalf("Lookup(%q, %q) = (%q, %#v, %t), want (%q, %#v, %t)", test.method, test.path, upstream, params, found, test.wantUpstream, test.wantParams, test.wantFound)
			}
		})
	}
}

func BenchmarkRouterLookup(b *testing.B) {
	router := New()
	router.Insert("GET", "/users", "users")
	router.Insert("GET", "/users/:id", "user")
	router.Insert("GET", "/users/:id/orders", "orders")

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		router.Lookup("GET", "/users/42/orders")
	}
}
