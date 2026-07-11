import { IsIn, IsOptional } from 'class-validator';

export const NOTIFICATION_GROUPS = [
  'inventory',
  'payments',
  'reservations',
  'system',
] as const;

export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number];

export class ListNotificationsQueryDto {
  @IsOptional()
  @IsIn(['all', 'read', 'unread'])
  status?: 'all' | 'read' | 'unread';

  @IsOptional()
  @IsIn(['all', ...NOTIFICATION_GROUPS])
  group?: 'all' | NotificationGroup;
}
