import { PartialType } from '@nestjs/mapped-types';
import { CreateSpecialEventDto } from './create-special-event.dto';

export class UpdateSpecialEventDto extends PartialType(CreateSpecialEventDto) {}
