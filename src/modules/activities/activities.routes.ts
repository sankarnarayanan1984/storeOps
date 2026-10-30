import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth, type Authenticate } from '../../shared/http/auth';
import { parse } from '../../shared/http/validate';
import type { ActivitiesService } from './activities.service';
import { TASK_CATEGORIES, TASK_PRIORITIES, TASK_STATUSES } from './activities.types';

const listQuery = z.object({
  programmeId: z.string().min(1).optional(),
  storeId: z.string().min(1).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  category: z.enum(TASK_CATEGORIES).optional(),
  assigneeId: z.string().min(1).optional(),
});

const createBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  storeId: z.string().trim().min(1).optional(),
  regionId: z.string().trim().min(1).optional(),
  programmeId: z.string().trim().min(1).optional(),
  assigneeId: z.string().trim().min(1).optional(),
  priority: z.enum(TASK_PRIORITIES).default('MEDIUM'),
  category: z.enum(TASK_CATEGORIES),
  dueAt: z.string().datetime(),
});

const updateBody = z
  .object({
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    category: z.enum(TASK_CATEGORIES).optional(),
    assigneeId: z.string().trim().min(1).nullable().optional(),
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    message: 'Provide at least one of status, priority, category or assigneeId',
  });

export function createActivitiesRouter(service: ActivitiesService, authenticate: Authenticate): Router {
  const router = Router();
  const auth = requireAuth(authenticate);

  router.get('/', async (req, res) => {
    res.json({ data: await service.list(parse(listQuery, req.query)) });
  });

  router.get('/:id', async (req, res) => {
    res.json(await service.getById(req.params.id));
  });

  router.post('/', auth, async (req, res) => {
    res.status(201).json(await service.create(parse(createBody, req.body), currentUser(res)));
  });

  router.patch<{ id: string }>('/:id', auth, async (req, res) => {
    res.json(await service.update(req.params.id, parse(updateBody, req.body), currentUser(res)));
  });

  router.delete<{ id: string }>('/:id', auth, async (req, res) => {
    await service.delete(req.params.id, currentUser(res));
    res.status(204).end();
  });

  return router;
}
