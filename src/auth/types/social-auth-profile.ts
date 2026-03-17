import type { SsoProvider } from '../dto/sso-provider';

export interface SocialAuthProfile {
  provider: SsoProvider;
  providerSubject: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string;
  username?: string;
  picture?: string;
}
