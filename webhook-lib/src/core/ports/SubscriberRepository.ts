import type { Subscriber } from '../entities/Subscriber.js';

export interface SubscriberRepository {
  add(event: string, url: string): Promise<Subscriber>;
  listByEvent(event: string): Promise<Subscriber[]>;
}
