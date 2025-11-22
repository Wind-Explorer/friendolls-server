import { ApiProperty } from '@nestjs/swagger';

/**
 * User entity representing a user in the system.
 * Users are synced from Keycloak via OIDC authentication.
 */
export class User {
  /**
   * Internal unique identifier (UUID)
   */
  @ApiProperty({
    description: 'Internal unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  /**
   * Keycloak subject identifier (unique per user in Keycloak)
   */
  @ApiProperty({
    description: 'Keycloak subject identifier from the JWT token',
    example: 'f:a1b2c3d4-e5f6-7890-abcd-ef1234567890:johndoe',
  })
  keycloakSub: string;

  /**
   * User's display name
   */
  @ApiProperty({
    description: "User's display name",
    example: 'John Doe',
  })
  name: string;

  /**
   * User's email address
   */
  @ApiProperty({
    description: "User's email address",
    example: 'john.doe@example.com',
  })
  email: string;

  /**
   * User's preferred username from Keycloak
   */
  @ApiProperty({
    description: "User's preferred username from Keycloak",
    example: 'johndoe',
    required: false,
  })
  username?: string;

  /**
   * URL to user's profile picture
   */
  @ApiProperty({
    description: "URL to user's profile picture",
    example: 'https://example.com/avatars/johndoe.jpg',
    required: false,
  })
  picture?: string;

  /**
   * User's roles from Keycloak
   */
  @ApiProperty({
    description: "User's roles from Keycloak",
    example: ['user', 'premium'],
    type: [String],
    required: false,
  })
  roles?: string[];

  /**
   * Timestamp when the user was first created in the system
   */
  @ApiProperty({
    description: 'Timestamp when the user was first created',
    example: '2024-01-15T10:30:00.000Z',
  })
  createdAt: Date;

  /**
   * Timestamp when the user profile was last updated
   */
  @ApiProperty({
    description: 'Timestamp when the user was last updated',
    example: '2024-01-20T14:45:00.000Z',
  })
  updatedAt: Date;

  /**
   * Timestamp of last login
   */
  @ApiProperty({
    description: 'Timestamp of last login',
    example: '2024-01-20T14:45:00.000Z',
    required: false,
  })
  lastLoginAt?: Date;
}
