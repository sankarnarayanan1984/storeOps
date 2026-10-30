import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth, type Authenticate } from '../../shared/http/auth';
import { parse } from '../../shared/http/validate';
import type { ProgrammesService } from './programmes.service';
import { PROJECT_ROLES, PROJECT_STATUSES, PROJECT_TYPES } from './programmes.types';

const listQuery = z.object({
  type: z.enum(PROJECT_TYPES).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  staffId: z.string().min(1).optional(),
});

const createBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(''),
  type: z.enum(PROJECT_TYPES),
  startsOn: z.string().date(),
  endsOn: z.string().date(),
});

const addMemberBody = z.object({
  staffId: z.string().trim().min(1),
  role: z.enum(PROJECT_ROLES).optional(),
});

const membersQuery = z.object({ role: z.enum(PROJECT_ROLES).optional() });
const changeRoleBody = z.object({ role: z.enum(PROJECT_ROLES) });
const enrolBody = z.object({ storeId: z.string().min(1) });

export function createProgrammesRouter(service: ProgrammesService, authenticate: Authenticate): Router {
  const router = Router();
  const auth = requireAuth(authenticate);

  // Signed-in endpoints: scoped to the caller's store.
  router.get('/', auth, async (req, res) => {
    res.json({ data: await service.listForStore(currentUser(res), parse(listQuery, req.query)) });
  });

  router.post('/', auth, async (req, res) => {
    res.status(201).json(await service.create(parse(createBody, req.body), currentUser(res)));
  });

  router.post<{ id: string }>('/:id/members', auth, async (req, res) => {
    const { staffId, role } = parse(addMemberBody, req.body);
    res.status(201).json(await service.addMember(req.params.id, staffId, role, currentUser(res)));
  });

  // Open endpoints.
  router.get('/:id', async (req, res) => {
    res.json(await service.getById(req.params.id));
  });

  router.get('/:id/members', async (req, res) => {
    res.json({ data: await service.listMembers(req.params.id, parse(membersQuery, req.query).role) });
  });

  router.patch('/:id/members/:staffId', async (req, res) => {
    const { role } = parse(changeRoleBody, req.body);
    res.json(await service.changeMemberRole(req.params.id, req.params.staffId, role));
  });

  router.delete('/:id/members/:staffId', async (req, res) => {
    await service.removeMember(req.params.id, req.params.staffId);
    res.status(204).end();
  });

  router.post('/:id/enrolments', async (req, res) => {
    const { storeId } = parse(enrolBody, req.body);
    res.status(201).json(await service.enrolStore(req.params.id, storeId));
  });

  return router;
}
