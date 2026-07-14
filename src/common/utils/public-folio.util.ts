import { Prisma } from '@prisma/client';

type SequenceClient = Pick<Prisma.TransactionClient, '$queryRaw'>;

export function formatPrivateEventFolio(
  folioNumber: number | null | undefined,
) {
  return folioNumber ? `PRV-${String(folioNumber).padStart(4, '0')}` : null;
}

export function formatSpecialEventFolio(folioNumber: number) {
  return `EVT-${String(folioNumber).padStart(4, '0')}`;
}

export function formatSpecialEventTicketPrefix(folioNumber: number) {
  return String(folioNumber).padStart(4, '0');
}

export function parsePublicFolioNumber(value: string, prefix: 'PRV' | 'EVT') {
  const match = value
    .trim()
    .toUpperCase()
    .match(new RegExp(`^${prefix}-(\\d+)$`));
  return match ? Number(match[1]) : null;
}

export async function nextPrivateEventFolioNumber(client: SequenceClient) {
  const [row] = await client.$queryRaw<Array<{ value: bigint }>>`
    SELECT nextval('"Reservation_privateEventFolioNumber_seq"') AS value
  `;
  return Number(row.value);
}
