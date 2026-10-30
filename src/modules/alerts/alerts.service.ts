import { NotFoundError } from '../../shared/errors';
import type { AuthUser } from '../../shared/http/auth';
import { newId, nowIso } from '../../shared/id';
import type { StaffReader } from '../staff/staff.reader';
import type { AlertsRepository } from './alerts.repository';
import type { CreateNotificationInput, Notification, NotificationFilter } from './alerts.types';

export interface StoreAlert extends Omit<CreateNotificationInput, 'recipientId' | 'channel'> {
  /** Staff roles in the store that should receive this alert. */
  recipientRoles: readonly string[];
}

export class AlertsService {
  constructor(
    private readonly repository: AlertsRepository,
    private readonly staff: StaffReader,
  ) {}

  /** The caller's own notifications. */
  listForUser(caller: AuthUser, filter: Omit<NotificationFilter, 'recipientId'>): Promise<Notification[]> {
    return this.repository.list({ ...filter, recipientId: caller.id });
  }

  notify(input: CreateNotificationInput): Promise<Notification> {
    return this.repository.save({ id: newId('ntf'), ...input, status: 'UNREAD', createdAt: nowIso() });
  }

  /** Fans an alert out to every active staff member of the store holding one of the given roles. */
  async notifyStore({ recipientRoles, ...alert }: StoreAlert): Promise<Notification[]> {
    const staff = await this.staff.list({ storeId: alert.storeId, active: true });
    const recipients = staff.filter((s) => recipientRoles.includes(s.role));
    return Promise.all(recipients.map((s) => this.notify({ ...alert, recipientId: s.id, channel: 'IN_APP' })));
  }

  /** Marks one of the caller's notifications as read. Other people's notifications look like they don't exist. */
  async markRead(id: string, caller: AuthUser): Promise<Notification> {
    const notification = await this.repository.findById(id);
    if (!notification || notification.recipientId !== caller.id) throw new NotFoundError('Notification', id);
    if (notification.status === 'READ') return notification;
    return this.repository.save({ ...notification, status: 'READ', readAt: nowIso() });
  }
}
