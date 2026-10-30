import type { EventName } from '../../shared/events/domainEvents';

export const ALERT_TYPES = ['INVENTORY', 'SLA_BREACH', 'SHIFT_HANDOVER', 'ESCALATION'] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_STATUSES = ['UNREAD', 'READ'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/** An alert delivered to one staff member, raised in reaction to a domain event. */
export interface Notification {
  id: string;
  type: AlertType;
  channel: NotificationChannel;
  status: NotificationStatus;
  /** Staff id of the person this notification is for. */
  recipientId: string;
  storeId: string;
  title: string;
  message: string;
  /** The domain event that triggered this notification. */
  sourceEvent: EventName;
  /** Id of the entity the event was about (e.g. an activity id). */
  entityId: string;
  createdAt: string;
  readAt?: string;
}

export type CreateNotificationInput = Omit<Notification, 'id' | 'status' | 'createdAt' | 'readAt'>;

export interface NotificationFilter {
  recipientId?: string;
  status?: NotificationStatus;
  type?: AlertType;
}
