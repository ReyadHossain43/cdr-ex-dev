import type { Subscriber } from '../entities/Subscriber.js';

export interface SubscriberRepository {
  add(event: string, url: string): Promise<Subscriber>;
  streamByEvent(event: string): AsyncIterable<Subscriber>;
}
