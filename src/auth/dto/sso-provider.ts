export const SSO_PROVIDERS = ['google', 'discord'] as const;

export type SsoProvider = (typeof SSO_PROVIDERS)[number];
