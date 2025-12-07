import { ApiProperty } from '@nestjs/swagger';

export class UserBasicDto {
  @ApiProperty({
    description: 'User unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: "User's display name",
    example: 'John Doe',
  })
  name: string;

  @ApiProperty({
    description: "User's username",
    example: 'johndoe',
    required: false,
  })
  username?: string;

  @ApiProperty({
    description: "User's profile picture URL",
    example: 'https://example.com/avatar.jpg',
    required: false,
  })
  picture?: string;
}

export class FriendRequestResponseDto {
  @ApiProperty({
    description: 'Friend request unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Sender information',
    type: UserBasicDto,
  })
  sender: UserBasicDto;

  @ApiProperty({
    description: 'Receiver information',
    type: UserBasicDto,
  })
  receiver: UserBasicDto;

  @ApiProperty({
    description: 'Friend request status',
    enum: ['PENDING', 'ACCEPTED', 'DENIED'],
    example: 'PENDING',
  })
  status: string;

  @ApiProperty({
    description: 'Friend request creation timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Friend request last update timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  updatedAt: Date;
}

export class FriendshipResponseDto {
  @ApiProperty({
    description: 'Friendship unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Friend information',
    type: UserBasicDto,
  })
  friend: UserBasicDto;

  @ApiProperty({
    description: 'Friendship creation timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  createdAt: Date;
}
