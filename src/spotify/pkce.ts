import { createHash, randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// PKCE (Proof Key for Code Exchange) helpers — RFC 7636 / Spotify PKCE flow.
//
// We use the S256 method: the code_challenge sent in the authorize URL is the
// base64url-encoded SHA-256 of the code_verifier we hold locally and send only
// at token-exchange time.
// ---------------------------------------------------------------------------

/**
 * Encode a Buffer as base64url (no padding, + → -, / → _).
 */
function toBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Generate a cryptographically random PKCE code verifier.
 * 32 random bytes → 43-char base64url string (within the RFC 7636 range of 43–128 chars).
 */
export function generateCodeVerifier(): string {
  return toBase64Url(randomBytes(32));
}

/**
 * Derive the PKCE code challenge from a verifier using the S256 method.
 * challenge = base64url(SHA-256(verifier))
 */
export function deriveCodeChallenge(verifier: string): string {
  return toBase64Url(createHash('sha256').update(verifier).digest());
}

/**
 * Generate a random state token for CSRF protection.
 * Sent in the authorize URL and validated when the callback arrives.
 */
export function generateState(): string {
  return toBase64Url(randomBytes(16));
}
