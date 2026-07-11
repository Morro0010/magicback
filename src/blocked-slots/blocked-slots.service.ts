import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  parseEventDate,
  rangesOverlap,
  validateTimeRange,
} from '../common/utils/date.util';
import { CreateBlockedSlotDto } from './dto/create-blocked-slot.dto';
import { UpdateBlockedSlotDto } from './dto/update-blocked-slot.dto';

@Injectable()
export class BlockedSlotsService {
  constructor(private readonly prisma: PrismaService) {}

  async createBlockedSlot(dto: CreateBlockedSlotDto, actorUserId: string) {
    try {
      validateTimeRange(dto.startTime, dto.endTime);
    } catch {
      throw new BadRequestException('Invalid time range');
    }

    const date = parseEventDate(dto.date);

    const existingSlots = await this.prisma.blockedSlot.findMany({
      where: { date },
    });

    const hasOverlap = existingSlots.some((slot) =>
      rangesOverlap(dto.startTime, dto.endTime, slot.startTime, slot.endTime),
    );

    if (hasOverlap) {
      throw new ConflictException('Blocked slot overlaps an existing blocked slot');
    }

    const blocked = await this.prisma.blockedSlot.create({
      data: {
        date,
        startTime: dto.startTime,
        endTime: dto.endTime,
        reason: dto.reason?.trim() ?? null,
        createdByUserId: actorUserId,
      },
    });

    return {
      id: blocked.id,
      date: blocked.date,
      startTime: blocked.startTime,
      endTime: blocked.endTime,
      reason: blocked.reason,
      createdAt: blocked.createdAt,
    };
  }

  async updateBlockedSlot(id: string, dto: UpdateBlockedSlotDto) {
    const existing = await this.prisma.blockedSlot.findUnique({
      where: { id },
      include: { specialEvent: { select: { id: true, name: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Blocked slot not found');
    }
    if (existing.specialEvent) {
      throw new BadRequestException('Este bloqueo pertenece a un evento especial. Adminístralo desde Eventos especiales.');
    }

    const date = dto.date ? parseEventDate(dto.date) : existing.date;
    const startTime = dto.startTime ?? existing.startTime;
    const endTime = dto.endTime ?? existing.endTime;

    try {
      validateTimeRange(startTime, endTime);
    } catch {
      throw new BadRequestException('Invalid time range');
    }

    const existingSlots = await this.prisma.blockedSlot.findMany({
      where: {
        date,
        id: { not: id },
      },
    });

    const hasOverlap = existingSlots.some((slot) =>
      rangesOverlap(startTime, endTime, slot.startTime, slot.endTime),
    );
    if (hasOverlap) {
      throw new ConflictException('Blocked slot overlaps an existing blocked slot');
    }

    const updated = await this.prisma.blockedSlot.update({
      where: { id },
      data: {
        date,
        startTime,
        endTime,
        reason: dto.reason === undefined ? undefined : dto.reason?.trim() || null,
      },
    });

    return {
      id: updated.id,
      date: updated.date,
      startTime: updated.startTime,
      endTime: updated.endTime,
      reason: updated.reason,
      createdAt: updated.createdAt,
    };
  }

  async listBlockedSlots() {
    const blockedSlots = await this.prisma.blockedSlot.findMany({
      include: { specialEvent: { select: { id: true, name: true } } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

    return blockedSlots.map((slot) => ({
      id: slot.id,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      reason: slot.reason,
      specialEventId: slot.specialEvent?.id ?? null,
      specialEventName: slot.specialEvent?.name ?? null,
      createdAt: slot.createdAt,
    }));
  }

  async deleteBlockedSlot(id: string): Promise<{ ok: true }> {
    const existing = await this.prisma.blockedSlot.findUnique({
      where: { id },
      include: { specialEvent: { select: { id: true } } },
    });

    if (!existing) {
      throw new NotFoundException('Blocked slot not found');
    }
    if (existing.specialEvent) {
      throw new BadRequestException('Este bloqueo pertenece a un evento especial. Adminístralo desde Eventos especiales.');
    }

    await this.prisma.blockedSlot.delete({ where: { id } });
    return { ok: true };
  }
}
