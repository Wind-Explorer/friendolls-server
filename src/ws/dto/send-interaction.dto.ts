import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class SendInteractionDto {
  @IsUUID()
  @IsNotEmpty()
  recipientUserId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  content: string;

  @IsString()
  @IsNotEmpty()
  type: string;
}
