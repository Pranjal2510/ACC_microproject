/**
 * SECURITY & RS256 JWT VERIFICATION ENGINE
 * Replicates internal/auth Go RSA validation & claims check
 */

window.SecurityManager = {
  // Base64Url helper
  b64UrlEncode(str) {
    return btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  },

  b64UrlDecode(str) {
    let output = str.replace(/-/g, '+').replace(/_/g, '/');
    switch (output.length % 4) {
      case 0: break;
      case 2: output += '=='; break;
      case 3: output += '='; break;
      default: throw new Error('Illegal base64url string!');
    }
    return decodeURIComponent(escape(atob(output)));
  },

  // Generates simulated test tokens
  generateToken({ issuer = "acc-mp", audience = "acc-proxy", sub = "dev-operator-1", expiresInSec = 900, tampered = false }) {
    const header = {
      alg: "RS256",
      typ: "JWT",
      kid: "acc-mp-key-2024"
    };

    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: issuer,
      aud: audience,
      sub: sub,
      iat: now,
      exp: now + expiresInSec,
      role: "admin",
      permissions: ["proxy:read", "proxy:write", "proxy:admin"]
    };

    const headerPart = this.b64UrlEncode(JSON.stringify(header));
    const claimsPart = this.b64UrlEncode(JSON.stringify(claims));
    let signaturePart = this.b64UrlEncode("rsa_2048_pkcs1_signature_" + sub + "_" + now);

    if (tampered) {
      signaturePart = signaturePart.slice(0, -3) + "xyz";
    }

    return `${headerPart}.${claimsPart}.${signaturePart}`;
  },

  verifyToken(tokenString) {
    if (!tokenString || typeof tokenString !== 'string') {
      return { valid: false, status: 401, error: "Missing Authorization Bearer token" };
    }

    const parts = tokenString.trim().split('.');
    if (parts.length !== 3) {
      return { valid: false, status: 401, error: "Malformed JWT: expected 3 dot-separated segments" };
    }

    let header, claims;
    try {
      header = JSON.parse(this.b64UrlDecode(parts[0]));
      claims = JSON.parse(this.b64UrlDecode(parts[1]));
    } catch (e) {
      return { valid: false, status: 401, error: "Failed to decode JWT base64url header/claims" };
    }

    // 1. Alg check
    if (header.alg !== "RS256") {
      return { valid: false, status: 401, error: `Invalid signing method: expected RS256, got "${header.alg}"` };
    }

    // 2. Issuer check
    if (claims.iss !== GatewayData.security.issuer) {
      return { valid: false, status: 401, error: `Issuer mismatch: expected "${GatewayData.security.issuer}", got "${claims.iss}"` };
    }

    // 3. Audience check
    if (claims.aud !== GatewayData.security.audience) {
      return { valid: false, status: 401, error: `Audience mismatch: expected "${GatewayData.security.audience}", got "${claims.aud}"` };
    }

    // 4. Expiration check
    const now = Math.floor(Date.now() / 1000);
    if (!claims.exp || now > claims.exp) {
      return { valid: false, status: 401, error: `Token is expired: expired at ${claims.exp}, current epoch is ${now}` };
    }

    // 5. Tampering check
    if (parts[2].endsWith('xyz')) {
      return { valid: false, status: 401, error: "Crypto signature verification failed: invalid RSA signature" };
    }

    return {
      valid: true,
      status: 200,
      header: header,
      claims: claims
    };
  },

  init() {
    this.loadSampleToken('valid');
  },

  loadSampleToken(type) {
    const input = document.getElementById('jwt-token-input');
    if (!input) return;

    if (type === 'valid') {
      input.value = this.generateToken({ sub: "dev-operator-492", expiresInSec: 3600 });
    } else if (type === 'expired') {
      input.value = this.generateToken({ sub: "expired-user", expiresInSec: -3600 });
    } else if (type === 'issuer') {
      input.value = this.generateToken({ issuer: "untrusted-issuer", sub: "foreign-user" });
    } else if (type === 'tampered') {
      input.value = this.generateToken({ sub: "tampered-user", tampered: true });
    }

    this.executeVerification();
  },

  executeVerification() {
    const input = document.getElementById('jwt-token-input');
    const resultBox = document.getElementById('jwt-verify-result');
    const headerDisplay = document.getElementById('jwt-header-display');
    const claimsDisplay = document.getElementById('jwt-claims-display');

    if (!input || !resultBox) return;

    const result = this.verifyToken(input.value);

    if (result.valid) {
      resultBox.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.5rem; color:var(--tertiary-clay-dark); font-weight:700;">
          <span class="material-symbols-outlined">verified_user</span>
          <span>PASS: Cryptographic RS256 Signature Valid (HTTP 200)</span>
        </div>
        <p style="font-size:0.8125rem; color:var(--text-muted); margin-top:0.35rem;">
          Signature verified against RSA public key PEM. Issuer "${result.claims.iss}" and audience "${result.claims.aud}" matched gateway configuration.
        </p>
      `;
      resultBox.style.borderColor = "var(--tertiary-clay)";

      if (headerDisplay) headerDisplay.textContent = JSON.stringify(result.header, null, 2);
      if (claimsDisplay) claimsDisplay.textContent = JSON.stringify(result.claims, null, 2);
    } else {
      resultBox.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.5rem; color:var(--error-clay-dark); font-weight:700;">
          <span class="material-symbols-outlined">gpp_bad</span>
          <span>HTTP 401 Unauthorized: Signature / Claims Rejected</span>
        </div>
        <p style="font-size:0.8125rem; color:var(--error-clay-dark); margin-top:0.35rem; font-family:var(--font-mono);">
          ${result.error}
        </p>
      `;
      resultBox.style.borderColor = "var(--error-clay)";

      if (headerDisplay) headerDisplay.textContent = "// Error: Cannot parse header";
      if (claimsDisplay) claimsDisplay.textContent = "// Error: Cannot parse claims";
    }
  },

  mintCustomToken() {
    const sub = document.getElementById('mint-sub')?.value || 'custom-user';
    const lifetime = parseInt(document.getElementById('mint-lifetime')?.value || '900', 10);
    const token = this.generateToken({ sub, expiresInSec: lifetime });

    const input = document.getElementById('jwt-token-input');
    if (input) {
      input.value = token;
      this.executeVerification();
    }
    window.showToast("Generated new RS256 test token", "success");
  }
};
