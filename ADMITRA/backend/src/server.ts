import { assertProductionSafety, env } from './config/env';
import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './lib/db';
import { logger } from './lib/logger';
import { initSocket } from './lib/socket';
import { startOfferExpiryJob } from './modules/merit/offer.service';
import { closeExpiredCampaigns, startCampaignJobs } from './jobs/campaigns.job';

async function main() {
  assertProductionSafety();
  await connectDatabase(env.MONGODB_URI);
  await closeExpiredCampaigns();
  startCampaignJobs();

  const server = createApp().listen(env.PORT, () => {
    logger.info(`ADMITRA API listening on http://localhost:${env.PORT}/api/v1`);
  });
  initSocket(server);
  startOfferExpiryJob();

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start the server');
  process.exit(1);
});
