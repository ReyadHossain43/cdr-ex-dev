import type { Subscriber } from '../../../core/entities/Subscriber.js';
import type { SubscriberRepository } from '../../../core/ports/SubscriberRepository.js';

export class PgSubscriberRepository implements SubscriberRepository {
  async add(_event: string, _url: string): Promise<Subscriber> {
    throw new Error('PgSubscriberRepository is not implemented yet.');
  }

  async listByEvent(_event: string): Promise<Subscriber[]> {
    throw new Error('PgSubscriberRepository is not implemented yet.');
  }
}
