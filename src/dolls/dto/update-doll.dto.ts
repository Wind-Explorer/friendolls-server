import { PartialType } from '@nestjs/swagger';
import { CreateDollDto } from './create-doll.dto';

export class UpdateDollDto extends PartialType(CreateDollDto) {}
