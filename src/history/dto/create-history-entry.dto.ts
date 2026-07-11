import { HistoryActionType } from '@prisma/client';

export type CreateHistoryEntryDto = {
  reservationId: string;
  actorUserId?: string | null;
  actionType: HistoryActionType;
  fieldChanged?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
};
