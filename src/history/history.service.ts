import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHistoryEntryDto } from './dto/create-history-entry.dto';
import { ListHistoryQueryDto } from './dto/list-history-query.dto';

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

  async listByReservation(
    reservationId: string,
    query: ListHistoryQueryDto = {},
  ) {
    const limit = query.limit ?? 20;
    const recordsWithLookahead = await this.prisma.reservationHistory.findMany({
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
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      take: limit + 1,
    });
    const hasMore = recordsWithLookahead.length > limit;
    const records = hasMore
      ? recordsWithLookahead.slice(0, limit)
      : recordsWithLookahead;

    return {
      nextCursor: hasMore ? (records.at(-1)?.id ?? null) : null,
      hasMore,
      items: records.map((record) => ({
        id: record.id,
        reservationId: record.reservationId,
        actionType: record.actionType,
        fieldChanged: record.fieldChanged,
        oldValue: record.oldValueJson,
        newValue: record.newValueJson,
        createdAt: record.createdAt,
        actor: record.actor,
      })),
    };
  }
}
