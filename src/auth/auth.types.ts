export interface AuthTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
}

export interface AccessTokenClaims {
  sub: string;
  email: string;
  roles: string[];
  typ: 'access';
}

export interface RefreshTokenClaims {
  sub: string;
  sid: string;
  jti: string;
  typ: 'refresh';
}
