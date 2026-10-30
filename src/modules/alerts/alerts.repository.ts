import type { Notification, NotificationFilter } from './alerts.types';

export interface AlertsRepository {
  list(filter: NotificationFilter): Promise<Notification[]>;
  findById(id: string): Promise<Notification | undefined>;
  save(notification: Notification): Promise<Notification>;
}

export class InMemoryAlertsRepository implements AlertsRepository {
  private readonly items = new Map<string, Notification>();

  list(filter: NotificationFilter): Promise<Notification[]> {
    const result = [...this.items.values()]
      .filter((n) => !filter.recipientId || n.recipientId === filter.recipientId)
      .filter((n) => !filter.status || n.status === filter.status)
      .filter((n) => !filter.type || n.type === filter.type)
      .map((n) => ({ ...n }));
    return Promise.resolve(result);
  }

  findById(id: string): Promise<Notification | undefined> {
    const notification = this.items.get(id);
    return Promise.resolve(notification ? { ...notification } : undefined);
  }

  save(notification: Notification): Promise<Notification> {
    this.items.set(notification.id, { ...notification });
    return Promise.resolve({ ...notification });
  }
}
