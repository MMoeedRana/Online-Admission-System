import { describe, expect, it } from 'vitest';
import { amountInWords } from '../src/lib/words';
import { createInstitution } from './helpers';

describe('E-mail templates (NOTIF-3) and amount in words (FEE-2)', () => {
  it('institutions can customise, preview and reset e-mail wording; unknown variables are refused', async () => {
    const a = await createInstitution('tpl');
    const list = await a.as.get('/email-templates');
    expect(list.body.data.find((t: { key: string }) => t.key === 'DEFICIENCY_NOTICE').customized).toBe(false);
    expect(
      (
        await a.as
          .put('/email-templates/DEFICIENCY_NOTICE')
          .send({ subject: 'Fix {{applicationNumber}}', body: 'Dear {{unknownVar}}, please fix.' })
      ).status,
    ).toBe(422);
    expect(
      (
        await a.as.put('/email-templates/DEFICIENCY_NOTICE').send({
          subject: 'Fix {{applicationNumber}}',
          body: 'Dear {{applicantName}}, please fix: {{note}}',
        })
      ).status,
    ).toBe(200);
    const prev = await a.as
      .post('/email-templates/preview')
      .send({ subject: 'Fix {{applicationNumber}}', body: 'Dear {{applicantName}}' });
    expect(prev.body.data).toEqual({ subject: 'Fix CVU-F26-MAIN-00001', body: 'Dear Ayesha Noor' });
    expect((await a.as.delete('/email-templates/DEFICIENCY_NOTICE')).status).toBe(200);
  });

  it('writes amounts in words with thousand, lakh and crore', () => {
    expect(amountInWords(2500)).toBe('Two Thousand Five Hundred Rupees Only');
    expect(amountInWords(165000)).toBe('One Lakh Sixty Five Thousand Rupees Only');
    expect(amountInWords(12000000)).toBe('One Crore Twenty Lakh Rupees Only');
  });
});
