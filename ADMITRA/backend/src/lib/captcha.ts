import crypto from 'node:crypto';
import { Schema, model } from 'mongoose';

/** FIND-7: a short arithmetic CAPTCHA rendered as a distorted SVG image. */
const captchaSchema = new Schema({
  answerHash: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});
const CaptchaModel = model('Captcha', captchaSchema);

const hash = (s: string) => crypto.createHash('sha256').update(s.trim()).digest('hex');

function svgFor(text: string) {
  const r = (n: number) => crypto.randomInt(n);
  const chars = [...text]
    .map((c, i) => {
      const x = 18 + i * 22;
      const y = 34 + r(8) - 4;
      const rot = r(30) - 15;
      return `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" font-family="Verdana" font-size="${22 + r(6)}" font-weight="700" fill="#0B1B3A">${c === '+' ? '&#43;' : c}</text>`;
    })
    .join('');
  const lines = Array.from(
    { length: 5 },
    () =>
      `<path d="M${r(40)} ${r(50)} Q ${60 + r(60)} ${r(50)} ${150 + r(60)} ${r(50)}" stroke="#1F6FEB" stroke-opacity="0.45" stroke-width="${1 + r(2)}" fill="none"/>`,
  ).join('');
  const dots = Array.from(
    { length: 30 },
    () => `<circle cx="${r(200)}" cy="${r(50)}" r="1.2" fill="#64748B" fill-opacity="0.5"/>`,
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50" viewBox="0 0 200 50"><rect width="200" height="50" rx="8" fill="#EEF3FB"/>${dots}${chars}${lines}</svg>`;
}

export async function createCaptcha() {
  const a = crypto.randomInt(2, 10);
  const b = crypto.randomInt(2, 10);
  const doc = await CaptchaModel.create({
    answerHash: hash(String(a + b)),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });
  return { captchaId: String(doc._id), svg: svgFor(`${a}+${b}=?`) };
}

/** A CAPTCHA can be answered once; it is deleted whatever the answer. */
export async function checkCaptcha(id: string, answer: string) {
  if (!/^[a-f0-9]{24}$/.test(id)) return false;
  const doc = await CaptchaModel.findByIdAndDelete(id).lean();
  return Boolean(doc && doc.expiresAt > new Date() && doc.answerHash === hash(answer));
}
