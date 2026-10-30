import { join } from 'node:path';
import express, { type Express } from 'express';
import { InMemoryEventBus, type EventBus } from './shared/events/eventBus';
import { errorHandler, notFoundHandler } from './shared/http/errorHandler';
import { createActivitiesModule } from './modules/activities';
import type { Task } from './modules/activities/activities.types';
import { createAlertsModule } from './modules/alerts';
import { createProgrammesModule } from './modules/programmes';
import type { Project } from './modules/programmes/programmes.types';
import { createReportsModule } from './modules/reports';
import { createStaffModule } from './modules/staff';

export interface AppOptions {
  eventBus?: EventBus;
  /** Override the mock data (e.g. [] in tests). */
  activitySeed?: readonly Task[];
  programmeSeed?: readonly Project[];
}

/** Resolves to <repo>/public from both src/ (tsx) and dist/ (compiled). */
const PUBLIC_DIR = join(__dirname, '..', 'public');

/** Composition root: the only place that knows about every module. */
export function createApp(options: AppOptions = {}): Express {
  const eventBus = options.eventBus ?? new InMemoryEventBus();

  const staff = createStaffModule();
  const activities = createActivitiesModule({ eventBus, staff: staff.reader, seed: options.activitySeed });
  const programmes = createProgrammesModule({ eventBus, staff: staff.reader, seed: options.programmeSeed });
  const alerts = createAlertsModule({ eventBus, staff: staff.reader });
  const reports = createReportsModule({ eventBus });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.use('/api/activities', activities.router);
  // Activities are Tasks; /api/tasks is kept as an alias (used by the deployment smoke check).
  app.use('/api/tasks', activities.router);
  app.use('/api/programmes', programmes.router);
  app.use('/api/staff', staff.router);
  app.use('/api/alerts', alerts.router);
  app.use('/api/reports', reports.router);

  // UI pages
  const page = (file: string) => (_req: express.Request, res: express.Response) => res.sendFile(join(PUBLIC_DIR, file));
  app.get('/', (_req, res) => res.redirect('/activities'));
  app.get('/activities', page('activities.html'));
  app.get('/activities/new', page('new-activity.html'));
  app.get('/activities/:id', page('activity.html'));
  app.get('/programmes', page('programmes.html'));
  app.get('/programmes/:id', page('programme.html'));
  app.get('/staff', page('staff.html'));
  app.get(['/staff/new', '/staff/:id/edit'], page('staff-form.html'));
  app.use(express.static(PUBLIC_DIR, { index: false }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
