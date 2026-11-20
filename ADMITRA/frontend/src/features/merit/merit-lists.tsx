'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ListOrdered, Play, Sigma, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input } from '@/components/ui/input';
import { KpiCard, KpiGrid } from '@/components/ui/kpi-card';
import { Modal } from '@/components/ui/modal';
import { Stagger, StaggerItem } from '@/components/ui/motion';
import { PageHeader } from '@/components/ui/page-header';
import { FullPageLoader } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { useInstKey } from '@/features/institution/hooks';
import { api, errorMessage, fieldErrors, post } from '@/lib/api';
import { formatDateTime, toLocalInput } from '@/lib/format';
import { CampaignPicker, useCampaign } from './campaign-picker';

export interface MeritList {
  _id: string;
  listNumber: number;
  revision: number;
  status: 'DRAFT' | 'APPROVED' | 'PUBLISHED' | 'SUPERSEDED' | 'DISCARDED';
  offerDeadline: string;
  counts: { candidates: number; selected: number; waitlisted: number; notSelected: number; excluded: number };
  generatedBy: string;
  generatedByName: string;
  approvedByName?: string;
  approvedAt?: string;
  publishedByName?: string;
  publishedAt?: string;
  createdAt: string;
  discardReason?: string;
  supersedesId?: string | null;
}
interface Meta {
  campaign: { _id: string; title: string; status: string; minTrustLevel: number };
  programsWithoutFormula: number;
  statusCounts: Record<string, number>;
}

/** Merit committee workspace (Section 3.12 and 3.13). */
export function MeritListsPage() {
  const { campaigns, id, select, loading } = useCampaign();
  const key = useInstKey();
  const qc = useQueryClient();
  const router = useRouter();
  const { can } = useAuth();
  const [generate, setGenerate] = useState(false);
  const [deadline, setDeadline] = useState(() => toLocalInput(new Date(Date.now() + 7 * 864e5)));
  const [err, setErr] = useState('');
  const q = useQuery({
    queryKey: key('merit-lists', id),
    queryFn: async () =>
      (await api.get<{ data: MeritList[]; meta: Meta }>('/merit-lists', { params: { campaignId: id } })).data,
    enabled: Boolean(id),
  });
  const gen = useMutation({
    mutationFn: () =>
      post<MeritList>('/merit-lists', { campaignId: id, offerDeadline: new Date(deadline).toISOString() }),
    onSuccess: async (l) => {
      toast.success(`Merit list ${l.listNumber} generated. Another committee member must approve it.`);
      await qc.invalidateQueries({ queryKey: key('merit-lists') });
      router.push(`/institution/merit-lists/${l._id}`);
    },
    onError: (e) => {
      setErr(fieldErrors(e).offerDeadline ?? '');
      toast.error(errorMessage(e));
    },
  });
  if (loading) return <FullPageLoader />;
  const m = q.data?.meta;
  const sc = m?.statusCounts ?? {};
  const ready = (sc.VERIFIED ?? 0) + (sc.WAITLISTED ?? 0) + (sc.NOT_SELECTED ?? 0);
  const inReview = [
    'SUBMITTED',
    'PAYMENT_PENDING',
    'UNDER_REVIEW',
    'DOCUMENT_VERIFICATION',
    'DEFICIENT',
    'ELIGIBILITY_CHECK',
  ].reduce((s, k) => s + (sc[k] ?? 0), 0);
  const open = q.data?.data.find((l) => l.status === 'DRAFT' || l.status === 'APPROVED');
  return (
    <>
      <PageHeader
        title="Merit Lists"
        subtitle="Generate, approve (by a second member) and publish merit lists"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {campaigns.length > 0 && <CampaignPicker value={id} campaigns={campaigns} onChange={select} />}
            {can('merit.manage') && (
              <Button
                icon={<Play className="size-4" />}
                disabled={!id || Boolean(open)}
                onClick={() => setGenerate(true)}
              >
                Generate list
              </Button>
            )}
          </div>
        }
      />
      {!id ? (
        <Card>
          <EmptyState
            icon={ListOrdered}
            title="No admission campaign yet"
            text="Merit lists are generated for a campaign."
          />
        </Card>
      ) : !q.data ? (
        <FullPageLoader />
      ) : (
        <>
          <KpiGrid className="mb-6">
            <KpiCard label="Ready to rank" value={ready} sub="Verified, waiting or not yet selected" icon={Users} />
            <KpiCard
              label="Still in review"
              value={inReview}
              sub="Listed as excluded with the reason"
              icon={AlertTriangle}
              tint="amber"
            />
            <KpiCard
              label="Enrolled"
              value={sc.ENROLLED ?? 0}
              sub={`${sc.OFFER_ISSUED ?? 0} offers open`}
              icon={CheckCircle2}
              tint="green"
            />
            <KpiCard
              label="Programs without formula"
              value={m!.programsWithoutFormula}
              sub={`Minimum trust level ${m!.campaign.minTrustLevel}`}
              icon={Sigma}
              tint="purple"
            />
          </KpiGrid>
          {m!.programsWithoutFormula > 0 && (
            <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              Some programs have no active formula; their applicants cannot be ranked.{' '}
              <Link href={`/institution/merit-formulas?campaign=${id}`} className="font-semibold underline">
                Open Merit Formulas
              </Link>
            </p>
          )}
          {open && (
            <p className="mb-4 rounded-xl bg-blue-50 px-4 py-3 text-[13px] text-blue-900 dark:bg-blue-500/10 dark:text-blue-200">
              Merit list {open.listNumber} is{' '}
              {open.status === 'DRAFT' ? 'waiting for approval' : 'approved and waiting for publication'}. A new list
              can be generated after it is published or discarded.
            </p>
          )}
          {q.data.data.length === 0 ? (
            <Card>
              <EmptyState
                icon={ListOrdered}
                title="No merit lists yet"
                text="Generate the first list when the applications are verified."
              />
            </Card>
          ) : (
            <Stagger className="space-y-3" gap={0.05}>
              {q.data.data.map((l) => (
                <StaggerItem key={l._id}>
                  <Link href={`/institution/merit-lists/${l._id}`} className="group block">
                    <Card className="flex flex-col gap-4 p-5 transition-shadow group-hover:shadow-lg sm:flex-row sm:items-center">
                      <span className="bg-primary-soft text-primary flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl leading-none">
                        <span className="text-[10px] font-semibold uppercase">List</span>
                        <span className="text-[22px] font-extrabold">{l.listNumber}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={l.status} />
                          {l.revision > 1 && (
                            <span className="text-muted text-[12.5px] font-semibold">Revision {l.revision}</span>
                          )}
                        </div>
                        <p className="text-muted mt-1.5 text-[12.5px]">
                          Generated by {l.generatedByName} {formatDateTime(l.createdAt)}
                          {l.approvedByName && ` · approved by ${l.approvedByName}`}
                          {l.publishedAt && ` · published ${formatDateTime(l.publishedAt)}`}
                        </p>
                      </div>
                      <div className="grid grid-cols-4 gap-4 text-center text-[12px]">
                        {[
                          ['Selected', l.counts.selected, 'text-green-700 dark:text-green-400'],
                          ['Waiting', l.counts.waitlisted, 'text-amber-700 dark:text-amber-400'],
                          ['Not sel.', l.counts.notSelected, 'text-muted'],
                          ['Excluded', l.counts.excluded, 'text-red-700 dark:text-red-400'],
                        ].map(([k, v, c]) => (
                          <div key={String(k)}>
                            <p className={`text-[18px] font-extrabold tabular-nums ${c}`}>{v}</p>
                            <p className="text-muted">{k}</p>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </Link>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </>
      )}
      <Modal
        open={generate}
        onClose={() => setGenerate(false)}
        title="Generate merit list"
        description="Applications with verified marks are ranked with the active formulas and seats are allocated across preferences (stable matching)."
        footer={
          <>
            <Button variant="secondary" onClick={() => setGenerate(false)}>
              Cancel
            </Button>
            <Button loading={gen.isPending} onClick={() => gen.mutate()}>
              Generate
            </Button>
          </>
        }
      >
        <Field
          label="Offer deadline"
          htmlFor="deadline"
          required
          error={err}
          hint="Selected applicants must accept and pay the admission fee by this time."
        >
          <Input
            placeholder="Acceptance deadline"
            id="deadline"
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </Field>
      </Modal>
    </>
  );
}
