'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Mail, PauseCircle, PlayCircle, RefreshCw, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { FullPageLoader } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { errorMessage, get } from '@/lib/api';
import { INSTITUTION_TYPES, SECTORS, STAFF_ROLES } from '@/lib/constants';
import { formatDate, formatMoney } from '@/lib/format';
import type { Institution, Plan } from '@/lib/types';
import { useInstitutionAction, usePlans } from './institutions';

type Detail = Institution & {
  planId: Plan | null;
  members: { _id: string; email: string; fullName: string; roles: (keyof typeof STAFF_ROLES)[]; status: string }[];
  usage: { programs: number; campuses: number; campaigns: number; staff: number };
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-line flex justify-between gap-4 border-b py-2.5 text-[13.5px] last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink text-right font-medium">{value || '-'}</dd>
    </div>
  );
}

export function InstitutionDetail({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ['platform', 'institution', id],
    queryFn: () => get<Detail>(`/platform/institutions/${id}`),
  });
  const plans = usePlans();
  const action = useInstitutionAction(id);
  const [dialog, setDialog] = useState<'approve' | 'reject' | 'suspend' | 'reactivate' | 'renew' | null>(null);
  const [planId, setPlanId] = useState('');
  const [days, setDays] = useState(30);
  const [months, setMonths] = useState(12);

  if (!q.data) return <FullPageLoader />;
  const i = q.data;
  const run = (name: string, body?: object, ok?: string) =>
    action.mutate(
      { action: name, body },
      {
        onSuccess: () => {
          toast.success(ok ?? 'Saved.');
          setDialog(null);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  const activePlans = plans.data?.filter((p) => p.status === 'ACTIVE') ?? [];

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Institutions', href: '/platform/institutions' }, { label: i.shortName }]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {i.name} <StatusBadge status={i.status} />
          </span>
        }
        subtitle={`${INSTITUTION_TYPES[i.type]} · ${SECTORS[i.sector]} · ${i.city}, ${i.province}`}
        actions={
          <>
            {i.status === 'PENDING' && (
              <>
                <Button
                  variant="success"
                  icon={<CheckCircle2 className="size-4" />}
                  onClick={() => setDialog('approve')}
                >
                  Approve
                </Button>
                <Button variant="secondary" icon={<XCircle className="size-4" />} onClick={() => setDialog('reject')}>
                  Reject
                </Button>
              </>
            )}
            {i.status === 'ACTIVE' && (
              <Button
                variant="secondary"
                icon={<PauseCircle className="size-4" />}
                onClick={() => setDialog('suspend')}
              >
                Suspend
              </Button>
            )}
            {i.status === 'SUSPENDED' && (
              <Button
                variant="success"
                icon={<PlayCircle className="size-4" />}
                onClick={() => setDialog('reactivate')}
              >
                Re-activate
              </Button>
            )}
            {(i.status === 'ACTIVE' || i.status === 'SUSPENDED') && (
              <Button icon={<RefreshCw className="size-4" />} onClick={() => setDialog('renew')}>
                Renew subscription
              </Button>
            )}
          </>
        }
      />
      {i.statusReason && (
        <p className="border-line bg-card mb-6 rounded-xl border p-4 text-[13.5px]">
          <b className="text-ink">Reason:</b> {i.statusReason}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Institution details" />
          <CardBody>
            <dl>
              <Row label="Short name" value={i.shortName} />
              <Row label="Website" value={i.website} />
              <Row label="Requested on" value={formatDate(i.createdAt)} />
              <Row
                label="Contact person"
                value={`${i.contact.name}${i.contact.designation ? `, ${i.contact.designation}` : ''}`}
              />
              <Row label="Contact e-mail" value={i.contact.email} />
              <Row label="Contact phone" value={i.contact.phone} />
            </dl>
            {i.about && <p className="bg-card-soft mt-4 rounded-xl p-3.5 text-[13px]">{i.about}</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Subscription" />
          <CardBody>
            <dl>
              <Row
                label="Plan"
                value={i.planId ? `${i.planId.name} (${formatMoney(i.planId.priceMonthly)}/month)` : 'No plan'}
              />
              <Row label="Started" value={formatDate(i.subscription?.startsAt)} />
              <Row label="Ends" value={formatDate(i.subscription?.endsAt)} />
              <Row label="Type" value={i.subscription?.isTrial ? 'Trial' : i.planId ? 'Paid' : '-'} />
              <Row label="State" value={<StatusBadge status={i.subscriptionState ?? 'NONE'} />} />
            </dl>
            {i.planId && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Campuses', i.usage.campuses, i.planId.features.multipleCampuses ? i.planId.limits.campuses : 1],
                  ['Programs', i.usage.programs, i.planId.limits.programs],
                  ['Staff', i.usage.staff, i.planId.limits.staff],
                  ['Campaigns', i.usage.campaigns, null],
                ].map(([l, u, lim]) => (
                  <div key={String(l)} className="bg-card-soft rounded-xl p-3">
                    <p className="text-muted text-[11.5px] font-semibold uppercase">{l}</p>
                    <p className="text-ink mt-1 text-[16px] font-bold">
                      {u}
                      {lim !== null && <span className="text-muted text-[12px] font-medium"> / {lim}</span>}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader
          title="Staff members"
          action={
            i.members.some((m) => m.status === 'INVITED' && m.roles.includes('INSTITUTION_ADMIN')) ? (
              <Button
                size="sm"
                variant="secondary"
                icon={<Mail className="size-4" />}
                loading={action.isPending}
                onClick={() => run('resend-admin-invite', undefined, 'Invitation sent again.')}
              >
                Resend admin invitation
              </Button>
            ) : undefined
          }
        />
        <ul className="divide-line mt-3 divide-y">
          {i.members.length === 0 && (
            <li className="text-muted px-6 py-6 text-[13px]">
              No staff yet. The admin invitation is sent when the request is approved.
            </li>
          )}
          {i.members.map((m) => (
            <li
              key={m._id}
              className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6"
            >
              <div>
                <p className="text-ink font-semibold">{m.fullName || m.email}</p>
                <p className="text-muted text-[12.5px]">{m.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {m.roles.map((r) => (
                  <Badge key={r} tone="blue" dot={false}>
                    {STAFF_ROLES[r]}
                  </Badge>
                ))}
                <StatusBadge status={m.status} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Modal
        open={dialog === 'approve'}
        onClose={() => setDialog(null)}
        title="Approve institution"
        description="The workspace is activated with a trial and the contact person is invited as Institution Admin."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="success"
              disabled={!planId}
              loading={action.isPending}
              onClick={() => run('approve', { planId, trialDays: days }, 'Institution approved and invitation sent.')}
            >
              Approve
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Plan" htmlFor="ap-plan" required>
            <Select id="ap-plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Select a plan</option>
              {activePlans.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} ({formatMoney(p.priceMonthly)}/month)
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Trial days" htmlFor="ap-days">
            <Input
              placeholder="e.g. 30"
              id="ap-days"
              type="number"
              min={0}
              max={365}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={dialog === 'renew'}
        onClose={() => setDialog(null)}
        title="Renew subscription"
        description="The new period starts from the current end date (or today if it has already ended)."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              loading={action.isPending}
              onClick={() => run('renew', { months, ...(planId ? { planId } : {}) }, 'Subscription renewed.')}
            >
              Renew
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Months" htmlFor="rn-months">
            <Select id="rn-months" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {[1, 3, 6, 12, 24].map((m) => (
                <option key={m} value={m}>
                  {m} month{m > 1 ? 's' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Change plan (optional)" htmlFor="rn-plan">
            <Select id="rn-plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Keep current plan</option>
              {activePlans.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={dialog === 'reject'}
        onClose={() => setDialog(null)}
        title="Reject request"
        message={`The request of ${i.name} will be rejected and the contact person will be informed by e-mail.`}
        confirmLabel="Reject request"
        reasonLabel="Reason"
        loading={action.isPending}
        onConfirm={(reason) => run('reject', { reason }, 'Request rejected.')}
      />
      <ConfirmDialog
        open={dialog === 'suspend'}
        onClose={() => setDialog(null)}
        title="Suspend institution"
        message="Staff lose access immediately and the institution disappears from public pages. No data is deleted."
        confirmLabel="Suspend"
        reasonLabel="Reason"
        loading={action.isPending}
        onConfirm={(reason) => run('suspend', { reason }, 'Institution suspended.')}
      />
      <ConfirmDialog
        open={dialog === 'reactivate'}
        onClose={() => setDialog(null)}
        title="Re-activate institution"
        message="Staff regain access and the institution appears on public pages again."
        confirmLabel="Re-activate"
        variant="success"
        loading={action.isPending}
        onConfirm={() => run('reactivate', undefined, 'Institution re-activated.')}
      />
    </>
  );
}
