import { Router } from 'express';
import mongoose from 'mongoose';
import { ok } from './lib/http';
import { authenticate, requireApplicant } from './middleware/auth';
import { resolveTenant } from './middleware/tenant';
import { authRouter } from './modules/auth/auth.routes';
import { campaignRouter } from './modules/campaigns/campaign.routes';
import { institutionRouter } from './modules/institutions/institution.routes';
import { platformRouter } from './modules/platform/platform.routes';
import { programRouter } from './modules/programs/program.routes';
import { publicRouter } from './modules/public/public.routes';
import { staffRouter } from './modules/staff/staff.routes';
import { structureRouter } from './modules/structure/structure.routes';
import { applicantAppRouter, applicantDashboardRouter } from './modules/applications/applicant.routes';
import { staffAppRouter } from './modules/applications/staff.routes';
import { documentTypeRouter } from './modules/documents/document-type.routes';
import { paymentRouter } from './modules/fees/payment.routes';
import { fileRouter } from './modules/files/file.routes';
import { emailTemplateRouter, notificationRouter } from './modules/notifications/notification.routes';
import { profileRouter } from './modules/profile/profile.routes';
import { recordRouter } from './modules/records/record.routes';
import { verificationRouter } from './modules/records/verification.routes';
import { institutionRegistryRouter, platformRegistryRouter } from './modules/registry/registry.routes';
import { formulaRouter } from './modules/merit/formula.routes';
import { meritListRouter } from './modules/merit/merit-list.routes';
import { offerRouter } from './modules/merit/offer.routes';
import { myResultsRouter } from './modules/results/my-results.routes';
import { publicResultsRouter } from './modules/results/public-results.routes';
import { publicDirectoryRouter } from './modules/directory/public-directory.routes';
import {
  institutionDirectoryRouter,
  platformDirectoryRouter,
} from './modules/directory/directory-admin.routes';
import { shortlistRouter } from './modules/directory/shortlist.routes';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  ok(res, {
    status: 'ok',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    time: new Date(),
  });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/public', publicDirectoryRouter, publicResultsRouter);
apiRouter.use('/public', publicRouter);
apiRouter.use('/platform/registry', platformRegistryRouter);
apiRouter.use('/platform/directory', platformDirectoryRouter);
apiRouter.use('/platform', platformRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/files', fileRouter);

// Applicant portal: every route needs an applicant account.
const me = Router();
me.use(authenticate, requireApplicant);
me.use('/profile', profileRouter);
me.use('/records', recordRouter);
me.use('/applications', applicantAppRouter);
me.use('/dashboard', applicantDashboardRouter);
me.use(myResultsRouter);
me.use('/shortlist', shortlistRouter);
apiRouter.use('/me', me);

// Institution workspace: every route is authenticated and scoped to one tenant (SEC-1).
const tenant = Router();
tenant.use(authenticate, resolveTenant);
tenant.use('/institution', institutionRouter);
tenant.use('/staff', staffRouter);
tenant.use('/structure', structureRouter);
tenant.use('/programs', programRouter);
tenant.use('/campaigns', campaignRouter);
tenant.use('/applications', staffAppRouter);
tenant.use('/verifications', verificationRouter);
tenant.use('/payments', paymentRouter);
tenant.use('/document-types', documentTypeRouter);
tenant.use('/email-templates', emailTemplateRouter);
tenant.use('/registry', institutionRegistryRouter);
tenant.use('/merit-formulas', formulaRouter);
tenant.use('/merit-lists', meritListRouter);
tenant.use('/offers', offerRouter);
tenant.use('/directory', institutionDirectoryRouter);
apiRouter.use(tenant);
