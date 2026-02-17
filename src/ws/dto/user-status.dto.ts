import { IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PresenceStatusDto } from './app-metadata.dto';

export enum UserState {
  IDLE = 'idle',
  RESTING = 'resting',
}

export class UserStatusDto {
  @ValidateNested()
  @Type(() => PresenceStatusDto)
  presenceStatus: PresenceStatusDto;

  @IsEnum(UserState)
  state: UserState;
}
