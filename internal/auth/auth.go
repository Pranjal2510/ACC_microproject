package auth

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

type Middleware struct {
	key      *rsa.PublicKey
	issuer   string
	audience string
	next     http.Handler
}

func New(publicKeyFile, issuer, audience string, next http.Handler) (*Middleware, error) {
	key, err := LoadPublicKey(publicKeyFile)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(issuer) == "" || strings.TrimSpace(audience) == "" {
		return nil, errors.New("issuer and audience are required")
	}
	return &Middleware{key: key, issuer: issuer, audience: audience, next: next}, nil
}

func LoadPublicKey(filename string) (*rsa.PublicKey, error) {
	contents, err := os.ReadFile(filename)
	if err != nil {
		return nil, fmt.Errorf("read public key: %w", err)
	}
	block, _ := pem.Decode(contents)
	if block == nil {
		return nil, errors.New("decode public key PEM: no PEM block found")
	}

	if key, err := x509.ParsePKIXPublicKey(block.Bytes); err == nil {
		if rsaKey, ok := key.(*rsa.PublicKey); ok {
			return rsaKey, nil
		}
	}
	if key, err := x509.ParsePKCS1PublicKey(block.Bytes); err == nil {
		return key, nil
	}
	return nil, errors.New("public key PEM is not an RSA public key")
}

func (middleware *Middleware) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	tokenString, ok := bearerToken(request.Header.Get("Authorization"))
	if !ok {
		writeUnauthorized(writer)
		return
	}

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodRS256 {
			return nil, fmt.Errorf("unexpected signing method %q", token.Method.Alg())
		}
		return middleware.key, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodRS256.Alg()}), jwt.WithIssuer(middleware.issuer), jwt.WithAudience(middleware.audience), jwt.WithExpirationRequired())
	if err != nil || !token.Valid {
		writeUnauthorized(writer)
		return
	}

	middleware.next.ServeHTTP(writer, request)
}

func bearerToken(header string) (string, bool) {
	parts := strings.Fields(header)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
		return "", false
	}
	return parts[1], true
}

func writeUnauthorized(writer http.ResponseWriter) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(writer).Encode(map[string]string{"error": "unauthorized"})
}
