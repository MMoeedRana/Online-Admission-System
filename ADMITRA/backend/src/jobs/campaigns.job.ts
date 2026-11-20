import { CampaignModel } from '../modules/campaigns/campaign.model';
import { logger } from '../lib/logger';

export async function closeExpiredCampaigns(now = new Date()): Promise<number> {
  const due = await CampaignModel.find({ status: 'OPEN', closesAt: { $lte: now } });
  for (const c of due) {
    c.history.push({ from: 'OPEN', to: 'CLOSED', at: now, auto: true });
    c.status = 'CLOSED';
    await c.save();
  }
  if (due.length) logger.info({ count: due.length }, 'Campaigns closed automatically');
  return due.length;
}

export function startCampaignJobs(): NodeJS.Timeout {
  const timer = setInterval(
    () => void closeExpiredCampaigns().catch((err) => logger.error({ err }, 'Campaign job failed')),
    60_000,
  );
  timer.unref();
  return timer;
}
