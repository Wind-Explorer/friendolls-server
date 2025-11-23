import { ApiProperty } from '@nestjs/swagger';
import { User as PrismaUser } from '@prisma/client';

/**
 * User entity representing a user in the system.
 * Users are synced from Keycloak via OIDC authentication.
 *
 * This is a re-export of the Prisma User type for consistency.
 * Swagger decorators are applied at the controller level.
 */
export type User = PrismaUser;

/**
 * User response DTO for Swagger documentation
 * This class is only used for API documentation purposes
 */
export class UserResponseDto implements PrismaUser {
  @ApiProperty({
    description: 'Internal unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Keycloak subject identifier from the JWT token',
    example: 'f:a1b2c3d4-e5f6-7890-abcd-ef1234567890:johndoe',
  })
  keycloakSub: string;

  @ApiProperty({
    description: "User's display name",
    example: 'John Doe',
  })
  name: string;

  @ApiProperty({
    description: "User's email address",
    example: 'john.doe@example.com',
  })
  email: string;

  @ApiProperty({
    description: "User's preferred username from Keycloak",
    example: 'johndoe',
    required: false,
    nullable: true,
  })
  username: string | null;

  @ApiProperty({
    description: "URL to user's profile picture",
    example: 'https://example.com/avatars/johndoe.jpg',
    required: false,
    nullable: true,
  })
  picture: string | null;

  @ApiProperty({
    description: "User's roles from Keycloak",
    example: ['user', 'premium'],
    type: [String],
    isArray: true,
  })
  roles: string[];

  @ApiProperty({
    description: 'Timestamp when the user was first created',
    example: '2024-01-15T10:30:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Timestamp when the user was last updated',
    example: '2024-01-20T14:45:00.000Z',
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Timestamp of last login',
    example: '2024-01-20T14:45:00.000Z',
    required: false,
    nullable: true,
  })
  lastLoginAt: Date | null;
}
