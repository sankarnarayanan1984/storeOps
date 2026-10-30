import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth, type Authenticate } from '../../shared/http/auth';
import { parse } from '../../shared/http/validate';
import type { AlertsService } from './alerts.service';
import { ALERT_TYPES, NOTIFICATION_STATUSES } from './alerts.types';

const listQuery = z.object({
  status: z.enum(NOTIFICATION_STATUSES).optional(),
  type: z.enum(ALERT_TYPES).optional(),
});

export function createAlertsRouter(service: AlertsService, authenticate: Authenticate): Router {
  const router = Router();
  router.use(requireAuth(authenticate));

  router.get('/', async (req, res) => {
    res.json({ data: await service.listForUser(currentUser(res), parse(listQuery, req.query)) });
  });

  router.post('/:id/read', async (req, res) => {
    res.json(await service.markRead(req.params.id, currentUser(res)));
  });

  return router;
}
