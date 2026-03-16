import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';

export interface SseEvent {
  userId: string;
  type: string;
  data: any;
}

@Injectable()
export class NotificationSseService {
  private events$ = new Subject<SseEvent>();

  /** Push a real-time event to a specific user */
  push(event: SseEvent) {
    this.events$.next(event);
  }

  /** Return an observable stream filtered for a specific user */
  streamForUser(userId: string): Observable<MessageEvent> {
    return this.events$.pipe(
      filter((e) => e.userId === userId),
      map((e) => ({
        data: JSON.stringify({ type: e.type, ...e.data }),
      } as MessageEvent)),
    );
  }
}
