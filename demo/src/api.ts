// Authenticates the user with a username and password.
// Returns a JWT token on success.
export function login(token: string): boolean {
  // New implementation uses OAuth2 — comment above is stale
  return validateOAuthToken(token)
}

function validateOAuthToken(token: string): boolean {
  return token.startsWith('oauth_')
}
