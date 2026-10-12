package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var outputDir = flag.String("out-dir", "tmp/keys", "directory for generated key files")
var issuer = flag.String("issuer", "acc-mp", "JWT issuer")
var audience = flag.String("audience", "acc-proxy", "JWT audience")
var lifetime = flag.Duration("lifetime", 15*time.Minute, "token lifetime")

func main() {
	flag.Parse()

	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		fatal(err)
	}
	if err := os.MkdirAll(*outputDir, 0700); err != nil {
		fatal(err)
	}

	privateDER := x509.MarshalPKCS1PrivateKey(privateKey)
	writePEM(filepath.Join(*outputDir, "private.pem"), "RSA PRIVATE KEY", privateDER, 0600)
	publicDER, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	if err != nil {
		fatal(err)
	}
	writePEM(filepath.Join(*outputDir, "public.pem"), "PUBLIC KEY", publicDER, 0644)

	claims := jwt.RegisteredClaims{
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(*lifetime)),
		IssuedAt:  jwt.NewNumericDate(time.Now()),
		Issuer:    *issuer,
		Audience:  jwt.ClaimStrings{*audience},
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodRS256, claims).SignedString(privateKey)
	if err != nil {
		fatal(err)
	}
	fmt.Printf("public key: %s\n", filepath.Join(*outputDir, "public.pem"))
	fmt.Printf("token:\n%s\n", token)
}

func writePEM(filename, blockType string, contents []byte, mode os.FileMode) {
	if err := os.WriteFile(filename, pem.EncodeToMemory(&pem.Block{Type: blockType, Bytes: contents}), mode); err != nil {
		fatal(err)
	}
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
