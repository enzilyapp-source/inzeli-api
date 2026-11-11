import type { INestApplication } from '@nestjs/common';
import { json } from 'express';

/** Nest detects jsonParser by name, even when mounted on one path. Register the
 * ordinary parser explicitly too, otherwise a scoped parser disables JSON on login. */
export function configureBodyParsing(app: INestApplication) {
  app.use('/api/rooms/:code/score-sheet', json({ limit: '300kb' }));
  app.use(json({ limit: '100kb' }));
}
