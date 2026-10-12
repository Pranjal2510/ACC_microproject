package auth

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestMiddleware(t *testing.T) {
	privateKey, publicKeyFile := testKeyFile(t)
	middleware, err := New(publicKeyFile, "acc-issuer", "acc-audience", http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(http.StatusOK)
	}))
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name       string
		token      string
		wantStatus int
	}{
		{name: "valid", token: signToken(t, privateKey, time.Now().Add(time.Hour), "acc-issuer", "acc-audience"), wantStatus: http.StatusOK},
		{name: "missing", wantStatus: http.StatusUnauthorized},
		{name: "expired", token: signToken(t, privateKey, time.Now().Add(-time.Hour), "acc-issuer", "acc-audience"), wantStatus: http.StatusUnauthorized},
		{name: "wrong issuer", token: signToken(t, privateKey, time.Now().Add(time.Hour), "wrong-issuer", "acc-audience"), wantStatus: http.StatusUnauthorized},
		{name: "wrong audience", token: signToken(t, privateKey, time.Now().Add(time.Hour), "acc-issuer", "wrong-audience"), wantStatus: http.StatusUnauthorized},
		{name: "tampered", token: tamperToken(t, signToken(t, privateKey, time.Now().Add(time.Hour), "acc-issuer", "acc-audience")), wantStatus: http.StatusUnauthorized},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/users", nil)
			if test.token != "" {
				request.Header.Set("Authorization", "Bearer "+test.token)
			}
			response := httptest.NewRecorder()

			middleware.ServeHTTP(response, request)

			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d; body = %s", response.Code, test.wantStatus, response.Body.String())
			}
			if test.wantStatus == http.StatusUnauthorized && response.Body.String() != "{\"error\":\"unauthorized\"}\n" {
				t.Fatalf("body = %q, want short JSON unauthorized error", response.Body.String())
			}
		})
	}
}

func testKeyFile(t *testing.T) (*rsa.PrivateKey, string) {
	t.Helper()
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	publicDER, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	if err != nil {
		t.Fatal(err)
	}
	filename := t.TempDir() + "\\public.pem"
	if err := os.WriteFile(filename, pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: publicDER}), 0600); err != nil {
		t.Fatal(err)
	}
	return privateKey, filename
}

func signToken(t *testing.T, privateKey *rsa.PrivateKey, expiresAt time.Time, issuer, audience string) string {
	t.Helper()
	claims := jwt.RegisteredClaims{
		ExpiresAt: jwt.NewNumericDate(expiresAt),
		Issuer:    issuer,
		Audience:  jwt.ClaimStrings{audience},
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodRS256, claims).SignedString(privateKey)
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func tamperToken(t *testing.T, token string) string {
	t.Helper()
	return token[:len(token)-1] + "x"
}
