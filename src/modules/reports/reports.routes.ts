import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../shared/http/validate';
import type { ReportsService } from './reports.service';
import { METRIC_SCOPES } from './reports.types';

const metricsParams = z.object({
  scope: z.enum(METRIC_SCOPES),
  id: z.string().min(1),
});

export function createReportsRouter(service: ReportsService): Router {
  const router = Router();

  router.get('/metrics/:scope/:id', async (req, res) => {
    const { scope, id } = parse(metricsParams, req.params);
    res.json(await service.getMetrics(scope, id));
  });

  return router;
}
