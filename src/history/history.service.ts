import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHistoryEntryDto } from './dto/create-history-entry.dto';

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async createEntry(input: CreateHistoryEntryDto): Promise<void> {
    await this.prisma.reservationHistory.create({
      data: {
        reservationId: input.reservationId,
        actorUserId: input.actorUserId ?? null,
        actionType: input.actionType,
        fieldChanged: input.fieldChanged ?? null,
        oldValueJson:
          input.oldValue === undefined
            ? undefined
            : input.oldValue === null
              ? Prisma.JsonNull
              : (input.oldValue as Prisma.InputJsonValue),
        newValueJson:
          input.newValue === undefined
            ? undefined
            : input.newValue === null
              ? Prisma.JsonNull
              : (input.newValue as Prisma.InputJsonValue),
      },
    });
  }

  async listByReservation(reservationId: string) {
    const records = await this.prisma.reservationHistory.findMany({
      where: { reservationId },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return records.map((record) => ({
      id: record.id,
      reservationId: record.reservationId,
      actionType: record.actionType,
      fieldChanged: record.fieldChanged,
      oldValue: record.oldValueJson,
      newValue: record.newValueJson,
      createdAt: record.createdAt,
      actor: record.actor,
    }));
  }
}
