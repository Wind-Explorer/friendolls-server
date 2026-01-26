import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export enum UserState {
  IDLE = 'idle',
  RESTING = 'resting',
}

export class UserStatusDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  activeApp: string;

  @IsEnum(UserState)
  state: UserState;
}
