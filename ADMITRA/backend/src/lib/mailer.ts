import nodemailer from 'nodemailer';
import { env, isTest } from '../config/env';
import { logger } from './logger';
import { brand } from './brand';

const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : nodemailer.createTransport({ jsonTransport: true });

export interface MailMessage {
  to: string;
  subject: string;
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string };
}

export const sentMails: (MailMessage & { html: string })[] = [];

function render(m: MailMessage): string {
  const body = m.paragraphs
    .map((p) => `<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.6">${p}</p>`)
    .join('');
  const button = m.action
    ? `<p style="margin:24px 0"><a href="${m.action.url}" style="background:#1F6FEB;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block">${m.action.label}</a></p>
       <p style="color:#64748B;font-size:12px">If the button does not work, copy this link: ${m.action.url}</p>`
    : '';
  return `<div style="background:#F5F7FB;padding:32px;font-family:Inter,Segoe UI,Arial,sans-serif">
  <div style="max-width:560px;margin:auto;background:#fff;border:1px solid #E6EAF2;border-radius:16px;overflow:hidden">
    <div style="background:#0B1B3A;color:#fff;padding:18px 24px;font-weight:700;font-size:18px">${brand().platformName.replace(/[<>&"]/g, '')}</div>
    <div style="padding:24px"><h2 style="margin:0 0 16px;color:#0F172A;font-size:20px">${m.heading}</h2>${body}${button}</div>
  </div></div>`;
}

export async function sendMail(m: MailMessage): Promise<void> {
  const html = render(m);
  if (isTest) {
    sentMails.push({ ...m, html });
    return;
  }
  try {
    await transport.sendMail({ from: env.MAIL_FROM, to: m.to, subject: m.subject, html });
    if (!env.SMTP_HOST)
      logger.info({ to: m.to, subject: m.subject, link: m.action?.url }, 'E-mail (development, not sent)');
  } catch (err) {
    logger.error({ err, to: m.to }, 'Failed to send e-mail');
  }
}
