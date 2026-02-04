import { IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AppMetadataDto } from './app-metadata.dto';

export enum UserState {
  IDLE = 'idle',
  RESTING = 'resting',
}

export class UserStatusDto {
  @ValidateNested()
  @Type(() => AppMetadataDto)
  appMetadata: AppMetadataDto;

  @IsEnum(UserState)
  state: UserState;
}
