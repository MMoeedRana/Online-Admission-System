'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Pencil, Power, UserPlus, Users, X } from 'lucide-react';
import { useState } from 'react';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Checkbox, Field, Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { toast } from '@/components/ui/toast';
import { Avatar } from '@/components/layout/user-menu';
import { del, errorMessage, fieldErrors, get, patch, post } from '@/lib/api';
import { STAFF_ROLES, type StaffRole } from '@/lib/constants';
import { formatDate } from '@/lib/format';
import type { StaffMember } from '@/lib/types';
import { useInstKey, useStructure } from './hooks';

const ROLE_HELP: Record<StaffRole, string> = {
  INSTITUTION_ADMIN: 'Configures the institution, staff, programs and campaigns; publishes merit lists',
  ADMISSION_OFFICER: 'Reviews applications, documents and marks',
  HOD_OFFICER: 'Like an admission officer, limited to assigned departments',
  FINANCE_OFFICER: 'Verifies fee payments and issues receipts',
  MERIT_COMMITTEE: 'Defines merit formulas, generates and approves merit lists',
};

interface Draft {
  email: string;
  fullName: string;
  designation: string;
  roles: StaffRole[];
  departmentIds: string[];
}

export function StaffPage() {
  const key = useInstKey();
  const qc = useQueryClient();
  const structure = useStructure();
  const q = useQuery({ queryKey: key('staff'), queryFn: () => get<StaffMember[]>('/staff') });
  const [editing, setEditing] = useState<StaffMember | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>({ email: '', fullName: '', designation: '', roles: [], departmentIds: [] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<{ type: 'status' | 'cancel'; member: StaffMember } | null>(null);
  const done = (msg: string) => {
    toast.success(msg);
    qc.invalidateQueries({ queryKey: key() });
  };
  const fail = (err: unknown) => toast.error(errorMessage(err));

  const open = (m: StaffMember | 'new') => {
    setEditing(m);
    setErrors({});
    setDraft(
      m === 'new'
        ? { email: '', fullName: '', designation: '', roles: [], departmentIds: [] }
        : {
            email: m.email,
            fullName: m.fullName,
            designation: m.designation,
            roles: m.roles,
            departmentIds: m.departmentIds.map((d) => d._id),
          },
    );
  };
  const save = useMutation({
    mutationFn: () =>
      editing === 'new'
        ? post('/staff/invite', draft)
        : patch(`/staff/${(editing as StaffMember)._id}`, {
            roles: draft.roles,
            departmentIds: draft.departmentIds,
            designation: draft.designation,
          }),
    onSuccess: () => {
      done(editing === 'new' ? `Invitation sent to ${draft.email}.` : 'Roles updated.');
      setEditing(null);
    },
    onError: (err) => {
      setErrors(fieldErrors(err));
      fail(err);
    },
  });
  const action = useMutation({
    mutationFn: ({ type, member }: { type: 'status' | 'cancel' | 'resend'; member: StaffMember }) =>
      type === 'resend'
        ? post(`/staff/${member._id}/resend-invite`)
        : type === 'cancel'
          ? del(`/staff/${member._id}`)
          : post(`/staff/${member._id}/status`, { status: member.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }),
    onSuccess: (_d, v) => {
      done(
        v.type === 'resend'
          ? 'Invitation sent again.'
          : v.type === 'cancel'
            ? 'Invitation cancelled.'
            : 'Status changed.',
      );
      setConfirm(null);
    },
    onError: (err) => {
      fail(err);
      setConfirm(null);
    },
  });
  const toggleRole = (r: StaffRole) =>
    setDraft((d) => ({ ...d, roles: d.roles.includes(r) ? d.roles.filter((x) => x !== r) : [...d.roles, r] }));
  const toggleDept = (id: string) =>
    setDraft((d) => ({
      ...d,
      departmentIds: d.departmentIds.includes(id) ? d.departmentIds.filter((x) => x !== id) : [...d.departmentIds, id],
    }));

  return (
    <>
      <PageHeader
        title="Staff & roles"
        subtitle="Invite staff by e-mail and give each person the roles they need (AUTH-7)"
        actions={
          <Button icon={<UserPlus className="size-4" />} onClick={() => open('new')}>
            Invite staff
          </Button>
        }
      />
      <Card className="overflow-hidden">
        <DataTable
          loading={q.isPending}
          rows={q.data ?? []}
          rowKey={(m) => m._id}
          empty={<EmptyState icon={Users} title="No staff yet" />}
          columns={[
            {
              key: 'name',
              header: 'Staff member',
              primary: true,
              cell: (m) => (
                <div className="flex items-center gap-3">
                  <Avatar name={m.fullName || m.email} className="size-9 text-[12px]" />
                  <div className="min-w-0">
                    <p className="text-ink truncate font-semibold">{m.fullName || m.email}</p>
                    <p className="text-muted truncate text-[12px]">
                      {m.designation ? `${m.designation} · ` : ''}
                      {m.email}
                    </p>
                  </div>
                </div>
              ),
            },
            {
              key: 'roles',
              header: 'Roles',
              cell: (m) => (
                <div className="flex flex-wrap gap-1.5">
                  {m.roles.map((r) => (
                    <Badge key={r} tone="blue" dot={false}>
                      {STAFF_ROLES[r]}
                    </Badge>
                  ))}
                </div>
              ),
            },
            { key: 'dept', header: 'Departments', cell: (m) => m.departmentIds.map((d) => d.code).join(', ') || '-' },
            { key: 'since', header: 'Added', cell: (m) => formatDate(m.createdAt), hideOnMobile: true },
            { key: 'status', header: 'Status', cell: (m) => <StatusBadge status={m.status} /> },
            {
              key: 'actions',
              header: '',
              className: 'text-right',
              cell: (m) => (
                <div className="flex justify-end gap-1">
                  {m.status === 'INVITED' ? (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Resend invitation"
                        onClick={() => action.mutate({ type: 'resend', member: m })}
                      >
                        <Mail className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Cancel invitation"
                        onClick={() => setConfirm({ type: 'cancel', member: m })}
                      >
                        <X className="size-4 text-red-700 dark:text-red-400" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={m.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                      onClick={() => setConfirm({ type: 'status', member: m })}
                    >
                      <Power
                        className={
                          m.status === 'ACTIVE'
                            ? 'size-4 text-red-700 dark:text-red-400'
                            : 'size-4 text-green-700 dark:text-green-400'
                        }
                      />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" aria-label="Edit roles" onClick={() => open(m)}>
                    <Pencil className="size-4" />
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing === 'new' ? 'Invite staff member' : 'Edit roles'}
        description={editing === 'new' ? 'An invitation link valid for 7 days is sent by e-mail.' : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              {editing === 'new' ? 'Send invitation' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="E-mail" htmlFor="st-email" required error={errors.email}>
            <Input
              placeholder="name@institution.edu.pk"
              id="st-email"
              type="email"
              disabled={editing !== 'new'}
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
          </Field>
          <Field label="Full name" htmlFor="st-name" required error={errors.fullName}>
            <Input
              placeholder="Full name"
              id="st-name"
              disabled={editing !== 'new'}
              value={draft.fullName}
              onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
            />
          </Field>
          <Field label="Designation" htmlFor="st-des" className="sm:col-span-2">
            <Input
              placeholder="e.g. Admission Officer"
              id="st-des"
              value={draft.designation}
              onChange={(e) => setDraft({ ...draft, designation: e.target.value })}
            />
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="text-ink text-[13px] font-semibold">
              Roles <span className="text-red-500">*</span>
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(Object.keys(STAFF_ROLES) as StaffRole[]).map((r) => (
                <Checkbox
                  key={r}
                  label={STAFF_ROLES[r]}
                  description={ROLE_HELP[r]}
                  checked={draft.roles.includes(r)}
                  onChange={() => toggleRole(r)}
                />
              ))}
            </div>
            {errors.roles && (
              <p className="mt-1 text-[12px] font-medium text-red-700 dark:text-red-400">{errors.roles}</p>
            )}
          </fieldset>
          {draft.roles.includes('HOD_OFFICER') && (
            <fieldset className="sm:col-span-2">
              <legend className="text-ink text-[13px] font-semibold">
                Departments of the HOD officer <span className="text-red-500">*</span>
              </legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {structure.data?.departments.map((d) => (
                  <Checkbox
                    key={d._id}
                    label={d.name}
                    checked={draft.departmentIds.includes(d._id)}
                    onChange={() => toggleDept(d._id)}
                  />
                ))}
              </div>
              {errors.departmentIds && (
                <p className="mt-1 text-[12px] font-medium text-red-700 dark:text-red-400">{errors.departmentIds}</p>
              )}
            </fieldset>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={
          confirm?.type === 'cancel'
            ? 'Cancel invitation'
            : confirm?.member.status === 'ACTIVE'
              ? 'Disable staff member'
              : 'Enable staff member'
        }
        message={
          confirm?.type === 'cancel'
            ? `The invitation link sent to ${confirm.member.email} will stop working.`
            : confirm?.member.status === 'ACTIVE'
              ? `${confirm?.member.fullName || confirm?.member.email} will lose access to this institution immediately.`
              : 'The staff member will regain access to this institution.'
        }
        confirmLabel={
          confirm?.type === 'cancel' ? 'Cancel invitation' : confirm?.member.status === 'ACTIVE' ? 'Disable' : 'Enable'
        }
        variant={confirm?.member.status === 'DISABLED' ? 'success' : 'danger'}
        loading={action.isPending}
        onConfirm={() => confirm && action.mutate(confirm)}
      />
    </>
  );
}
