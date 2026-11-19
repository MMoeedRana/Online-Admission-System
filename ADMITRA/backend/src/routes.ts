import { Router } from 'express';
import mongoose from 'mongoose';
import { ok } from './lib/http';
import { authenticate } from './middleware/auth';
import { resolveTenant } from './middleware/tenant';
import { authRouter } from './modules/auth/auth.routes';
import { campaignRouter } from './modules/campaigns/campaign.routes';
import { institutionRouter } from './modules/institutions/institution.routes';
import { platformRouter } from './modules/platform/platform.routes';
import { programRouter } from './modules/programs/program.routes';
import { publicRouter } from './modules/public/public.routes';
import { staffRouter } from './modules/staff/staff.routes';
import { structureRouter } from './modules/structure/structure.routes';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  ok(res, {
    status: 'ok',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    time: new Date(),
  });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/public', publicRouter);
apiRouter.use('/platform', platformRouter);

// Institution workspace: every route is authenticated and scoped to one tenant (SEC-1).
const tenant = Router();
tenant.use(authenticate, resolveTenant);
tenant.use('/institution', institutionRouter);
tenant.use('/staff', staffRouter);
tenant.use('/structure', structureRouter);
tenant.use('/programs', programRouter);
tenant.use('/campaigns', campaignRouter);
apiRouter.use(tenant);
