import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { NotificationItem } from './notification.types';

// In-memory fan-out. Correct for a single API instance only.
@Injectable()
export class NotificationsStream {
  private readonly subjects = new Map<string, Subject<NotificationItem>>();

  publish(userId: string, item: NotificationItem): void {
    this.subjects.get(userId)?.next(item);
  }

  subscribe(userId: string): Observable<NotificationItem> {
    return new Observable<NotificationItem>((subscriber) => {
      let subject = this.subjects.get(userId);
      if (!subject) {
        subject = new Subject<NotificationItem>();
        this.subjects.set(userId, subject);
      }
      const owned = subject;
      const subscription = owned.subscribe(subscriber);

      return () => {
        subscription.unsubscribe();
        if (!owned.observed) {
          this.subjects.delete(userId);
        }
      };
    });
  }
}
