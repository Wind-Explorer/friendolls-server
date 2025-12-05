/**
 * DTO for updating user profile.
 *
 * Currently all profile fields (name, email, username, picture, roles) are managed by Keycloak
 * and cannot be updated locally. This DTO exists for future extensibility if local profile
 * fields are added (e.g., preferences, settings, bio, etc.).
 *
 * To update profile data, users must update their profile in Keycloak. Changes will sync
 * automatically on next login.
 */
export class UpdateUserDto {
  // Currently no fields are updatable locally
  // Reserved for future local profile extensions
}
