import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { sendMail } from '../../lib/mailer';
import { emitToUser } from '../../lib/socket';
import type { Id } from '../../lib/types';
import { EmailTemplateModel, NotificationModel } from './notification.models';
import { DEFAULT_TEMPLATES, renderTemplate, type TemplateKey } from './templates';
import { brand } from '../../lib/brand';

const escape = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export async function templateFor(institutionId: Id | null | undefined, key: TemplateKey) {
  const custom = institutionId ? await EmailTemplateModel.findOne({ institutionId, key }).lean() : null;
  return custom ?? DEFAULT_TEMPLATES[key]!;
}

export async function notify(
  userId: Id,
  n: { type: string; title: string; body: string; link?: string },
  mail?: {
    to: string;
    key: TemplateKey;
    institutionId?: Id | null;
    vars: Record<string, string | number | undefined>;
  },
) {
  try {
    const doc = await NotificationModel.create({ userId, ...n, link: n.link ?? '' });
    emitToUser(String(userId), 'notification', doc.toObject());
    if (mail) {
      const t = await templateFor(mail.institutionId, mail.key);
      await sendMail({
        to: mail.to,
        subject: renderTemplate(t.subject, mail.vars),
        heading: n.title,
        paragraphs: renderTemplate(t.body, mail.vars)
          .split(/\n{2,}/)
          .map((p) => escape(p).replace(/\n/g, '<br>')),
        action: n.link
          ? { label: `Open ${brand().platformName}`, url: `${env.WEB_URL}${n.link}` }
          : undefined,
      });
    }
  } catch (err) {
    logger.error({ err }, 'Notification failed');
  }
}
