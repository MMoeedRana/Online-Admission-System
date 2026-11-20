'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ExternalLink, Flag, Pencil, Plus, Save } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { FullPageLoader } from '@/components/ui/spinner';
import { Tabs } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import type { DirInstitution, DirProgram, HistoryRow } from '@/features/advisor/types';
import { useInstKey } from '@/features/institution/hooks';
import { errorMessage, fieldErrors, get, patch, post } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { HistoryForm } from './history-form';
import { HistoryImport } from './history-import';

type Program = DirProgram & {
  history: (HistoryRow & { _id: string; status: 'DRAFT' | 'VERIFIED' | 'REJECTED'; rejectReason?: string })[];
};
interface Data {
  institution: DirInstitution & { _id: string };
  programs: Program[];
  pendingClaim: { name: string } | null;
}

const ORIGIN: Record<string, string> = { ADMITRA: 'Official (ADMITRA)', IMPORT: 'Import', MANUAL: 'Form' };

/** DIR-5, DIR-7: the institution's own directory profile and merit history. */
export function InstitutionDirectory() {
  const key = useInstKey();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'programs' | 'profile' | 'import' | 'claim'>('programs');
  const [open, setOpen] = useState<string | null>(null);
  const [add, setAdd] = useState<string | null>(null);
  const [edit, setEdit] = useState<Program | null>(null);
  const q = useQuery({ queryKey: key('directory'), queryFn: () => get<Data>('/directory') });
  const refresh = () => qc.invalidateQueries({ queryKey: key('directory') });
  if (!q.data) return <FullPageLoader />;
  const { institution: i, programs } = q.data;
  return (
    <>
      <PageHeader
        title="Directory Data"
        subtitle="How your institution appears in the public directory and the Admission Advisor"
        actions={
          <ButtonLink
            href={`/directory/institutions/${i.slug}`}
            variant="secondary"
            target="_blank"
            icon={<ExternalLink className="size-4" />}
          >
            Public page
          </ButtonLink>
        }
      />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'programs', label: 'Programs and merit history', count: programs.length },
          { value: 'profile', label: 'Profile' },
          { value: 'import', label: 'Import past lists' },
          { value: 'claim', label: 'Claim an old listing' },
        ]}
      />
      {tab === 'programs' && (
        <Card className="overflow-hidden">
          <CardBody className="text-muted pt-5 text-[13px]">
            Closing merit is added automatically when you publish a merit list (marked “Official (ADMITRA)”). Earlier
            years can be entered below; they are used after the super admin verifies the source.
          </CardBody>
          <div className="mt-2 overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable table">
            <table className="w-full min-w-[780px] text-left text-[13.5px]">
              <thead>
                <tr className="border-line bg-card-soft text-muted border-y text-[11.5px] tracking-wider uppercase">
                  <th className="px-5 py-3 font-semibold">Program</th>
                  <th className="px-3 py-3 font-semibold">Fee / semester</th>
                  <th className="px-3 py-3 font-semibold">Formula</th>
                  <th className="px-3 py-3 font-semibold">History</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {programs.map((p) => {
                  const verified = p.history.filter((h) => h.status === 'VERIFIED').length;
                  const draft = p.history.filter((h) => h.status === 'DRAFT').length;
                  return (
                    <Fragment key={p._id}>
                      <tr className="border-line border-b">
                        <td className="text-ink px-5 py-3 font-semibold">{p.title}</td>
                        <td className="px-3 py-3">{formatMoney(p.feePerSemester)}</td>
                        <td className="px-3 py-3 text-[12.5px]">
                          {p.formula.length ? (
                            p.formula
                              .map((f) => `${f.component.replace('_', ' ').toLowerCase()} ${f.weight}%`)
                              .join(', ')
                          ) : (
                            <span className="text-muted">not published</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-1.5">
                            <Badge tone="green">{verified} verified</Badge>
                            {draft > 0 && <Badge tone="amber">{draft} draft</Badge>}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Pencil className="size-4" />}
                              onClick={() => setEdit(p)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Plus className="size-4" />}
                              onClick={() => setAdd(p._id)}
                            >
                              Add year
                            </Button>
                            <button
                              onClick={() => setOpen(open === p._id ? null : p._id)}
                              className="text-primary inline-flex items-center gap-1 px-2 text-[12.5px] font-semibold"
                            >
                              History{' '}
                              <ChevronDown className={cn('size-4 transition', open === p._id && 'rotate-180')} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {open === p._id && (
                        <tr className="border-line bg-card-soft/50 border-b">
                          <td colSpan={5} className="px-5 py-3">
                            {p.history.length === 0 ? (
                              <p className="text-muted text-[13px]">No history yet.</p>
                            ) : (
                              <table className="w-full text-[12.5px]">
                                <tbody>
                                  {p.history.map((h) => (
                                    <tr key={h._id} className="border-line border-t">
                                      <td className="py-2 font-semibold">{h.year}</td>
                                      <td className="py-2">list {h.round}</td>
                                      <td className="py-2">{h.shift.toLowerCase()}</td>
                                      <td className="py-2 tabular-nums">closing {h.closingMerit.toFixed(2)}</td>
                                      <td className="text-muted max-w-xs truncate py-2">{h.source}</td>
                                      <td className="py-2">{ORIGIN[h.origin]}</td>
                                      <td className="py-2 text-right">
                                        <Badge
                                          tone={
                                            h.status === 'VERIFIED' ? 'green' : h.status === 'DRAFT' ? 'amber' : 'red'
                                          }
                                        >
                                          {h.status.toLowerCase()}
                                        </Badge>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {tab === 'profile' && <ProfileForm institution={i} onSaved={refresh} />}
      {tab === 'import' && <HistoryImport base="/directory" onDone={refresh} />}
      {tab === 'claim' && <ClaimPanel pending={q.data.pendingClaim} onDone={refresh} />}
      {add && (
        <HistoryForm
          url="/directory/history"
          programs={programs}
          programId={add}
          onClose={() => setAdd(null)}
          onSaved={refresh}
        />
      )}
      {edit && <ProgramEdit program={edit} onClose={() => setEdit(null)} onSaved={refresh} />}
    </>
  );
}

function ProfileForm({ institution, onSaved }: { institution: DirInstitution; onSaved: () => void }) {
  const [v, setV] = useState({ website: institution.website ?? '', about: institution.about ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => patch('/directory/profile', v),
    onSuccess: () => (toast.success('Profile updated.'), onSaved()),
    onError: (e) => (setErrors(fieldErrors(e)), toast.error(errorMessage(e))),
  });
  return (
    <Card>
      <CardHeader title={institution.name} subtitle={`${institution.city}, ${institution.province}`} />
      <CardBody className="space-y-4">
        <Field label="Website" htmlFor="d-web" error={errors.website}>
          <Input
            id="d-web"
            placeholder="https://"
            value={v.website}
            onChange={(e) => setV({ ...v, website: e.target.value })}
          />
        </Field>
        <Field label="About" htmlFor="d-about" error={errors.about}>
          <Textarea
            placeholder="A short introduction to your institution"
            id="d-about"
            rows={4}
            value={v.about}
            onChange={(e) => setV({ ...v, about: e.target.value })}
          />
        </Field>
        <Button icon={<Save className="size-4" />} loading={save.isPending} onClick={() => save.mutate()}>
          Save profile
        </Button>
      </CardBody>
    </Card>
  );
}

function ProgramEdit({ program, onClose, onSaved }: { program: Program; onClose: () => void; onSaved: () => void }) {
  const [fee, setFee] = useState(String(program.feePerSemester ?? ''));
  const [seats, setSeats] = useState(String(program.seats ?? ''));
  const [months, setMonths] = useState(program.admissionMonths.join(', '));
  const [applyUrl, setApplyUrl] = useState(program.applyUrl ?? '');
  const save = useMutation({
    mutationFn: () =>
      patch(`/directory/programs/${program._id}`, {
        feePerSemester: Number(fee),
        seats: Number(seats),
        admissionMonths: months
          .split(',')
          .map((m) => Number(m.trim()))
          .filter((m) => m >= 1 && m <= 12),
        applyUrl,
      }),
    onSuccess: () => (toast.success('Program updated.'), onSaved(), onClose()),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${program.title}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fee per semester (Rs.)" htmlFor="p-fee">
          <Input
            placeholder="e.g. 65000"
            id="p-fee"
            inputMode="numeric"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />
        </Field>
        <Field label="Seats" htmlFor="p-seats">
          <Input
            placeholder="e.g. 60"
            id="p-seats"
            inputMode="numeric"
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
          />
        </Field>
        <Field
          label="Usual admission months"
          htmlFor="p-months"
          hint="Numbers 1-12 separated by commas, e.g. 7, 8, 9"
          className="sm:col-span-2"
        >
          <Input placeholder="e.g. 7, 8, 9" id="p-months" value={months} onChange={(e) => setMonths(e.target.value)} />
        </Field>
        <Field label="Admission page link" htmlFor="p-url" className="sm:col-span-2">
          <Input id="p-url" placeholder="https://" value={applyUrl} onChange={(e) => setApplyUrl(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function ClaimPanel({ pending, onDone }: { pending: { name: string } | null; onDone: () => void }) {
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<{ _id: string; name: string } | null>(null);
  const [note, setNote] = useState('');
  const found = useQuery({
    queryKey: ['directory', 'claimable', q],
    queryFn: () => get<{ _id: string; name: string; city: string }[]>('/directory/claimable', { q }),
    enabled: q.length >= 2,
  });
  const claim = useMutation({
    mutationFn: () => post('/directory/claim', { directoryInstitutionId: pick!._id, note }),
    onSuccess: () => {
      toast.success('Claim sent. The super admin will review it.');
      setPick(null);
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card>
      <CardHeader
        title="Claim and correct an older listing"
        subtitle="If the directory lists your institution under another name, claim it so that its history joins your profile (DIR-7)."
      />
      <CardBody className="space-y-4">
        {pending && <Badge tone="amber">Claim pending for “{pending.name}”</Badge>}
        <Input
          placeholder="Search the directory by name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search the directory"
        />
        <ul className="space-y-2">
          {found.data?.map((d) => (
            <li key={d._id}>
              <button
                onClick={() => setPick(d)}
                className={cn(
                  'border-line flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-[13.5px]',
                  pick?._id === d._id && 'border-primary bg-primary-soft',
                )}
              >
                <span>
                  <b className="text-ink">{d.name}</b> <span className="text-muted">· {d.city}</span>
                </span>
                <Flag className="text-muted size-4" />
              </button>
            </li>
          ))}
        </ul>
        {pick && (
          <>
            <Field label="Why is this listing yours?" htmlFor="claim-note" required>
              <Textarea
                placeholder="Your role and how we can verify it"
                id="claim-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <Button disabled={note.trim().length < 10} loading={claim.isPending} onClick={() => claim.mutate()}>
              Send claim
            </Button>
          </>
        )}
      </CardBody>
    </Card>
  );
}
