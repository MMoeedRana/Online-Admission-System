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
import { analyticsRouter, reportRouter } from './modules/analytics/analytics.routes';
import { institutionSupportRouter, platformSupportRouter } from './modules/support/support.routes';
import { institutionAuditRouter, platformAuditRouter } from './modules/audit/audit.routes';
import { platformAnalyticsRouter } from './modules/analytics/platform-analytics';
import {
  assetRouter,
  avatarRouter,
  institutionBrandingRouter,
  platformBrandingRouter,
  publicBrandingRouter,
} from './modules/branding/branding.routes';
import { institutionAgentRouter, platformAgentRouter } from './modules/agent/agent.routes';
import { shortlistRouter } from './modules/directory/shortlist.routes';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  ok(res, {
    status: 'ok',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    time: new Date(),
  });
});

apiRouter.use('/auth/me/avatar', avatarRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/assets', assetRouter);
apiRouter.use('/public', publicBrandingRouter, publicDirectoryRouter, publicResultsRouter);
apiRouter.use('/public', publicRouter);
apiRouter.use('/platform/registry', platformRegistryRouter);
apiRouter.use('/platform/directory', platformDirectoryRouter);
apiRouter.use('/platform/branding', platformBrandingRouter);
apiRouter.use('/platform/agent', platformAgentRouter);
apiRouter.use('/platform/support', platformSupportRouter);
apiRouter.use('/platform/audit-logs', platformAuditRouter);
apiRouter.use('/platform/analytics', platformAnalyticsRouter);
apiRouter.use('/platform', platformRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/files', fileRouter);

const me = Router();
me.use(authenticate, requireApplicant);
me.use('/profile', profileRouter);
me.use('/records', recordRouter);
me.use('/applications', applicantAppRouter);
me.use('/dashboard', applicantDashboardRouter);
me.use(myResultsRouter);
me.use('/shortlist', shortlistRouter);
apiRouter.use('/me', me);

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
tenant.use('/analytics', analyticsRouter);
tenant.use('/reports', reportRouter);
tenant.use('/support/tickets', institutionSupportRouter);
tenant.use('/audit-logs', institutionAuditRouter);
tenant.use('/institution/branding', institutionBrandingRouter);
tenant.use('/agent', institutionAgentRouter);
apiRouter.use(tenant);
