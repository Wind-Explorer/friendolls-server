import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

/**
 * DTO for updating user profile.
 * Only allows updating safe, user-controlled fields.
 * Security-sensitive fields (keycloakSub, roles, email, etc.) are managed by Keycloak.
 */
export class UpdateUserDto {
  /**
   * User's display name
   */
  @ApiProperty({
    description: "User's display name",
    example: 'John Doe',
    required: false,
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Name must not be empty' })
  @MaxLength(100, { message: 'Name must not exceed 100 characters' })
  name?: string;
}
