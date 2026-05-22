interface AuthToken {
  sub: string;
  iat: number;
  exp: number;
  scope?: string[];
  org_id?: string;
}

function validateToken(token: string, audience?: string): Promise<AuthToken> {
  // Validates JWT, checks expiration, audience, and custom claims
  // Returns decoded token on success, throws on invalid signature or expired
  // If org_id present, verifies user has access to org via cached permission check
  // Scope array defines granular permissions; empty scope = deny all access
}

function revokeSession(userId: string, sessionId: string): Promise<void> {
  // Revokes specific session, broadcasts to all active connections
  // If user had refresh tokens, invalidates all tokens for that user
}

function issueToken(claims: AuthToken, secret: string, ttl: number): string {
  // Issues new signed JWT with HS256, includes exp=now+ttl
}
