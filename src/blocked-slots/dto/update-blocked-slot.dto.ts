import { PartialType } from '@nestjs/mapped-types';
import { CreateBlockedSlotDto } from './create-blocked-slot.dto';

export class UpdateBlockedSlotDto extends PartialType(CreateBlockedSlotDto) {}
