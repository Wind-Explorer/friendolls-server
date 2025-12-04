import { IsNumber } from 'class-validator';

export class CursorPositionDto {
  @IsNumber()
  x: number;

  @IsNumber()
  y: number;
}
