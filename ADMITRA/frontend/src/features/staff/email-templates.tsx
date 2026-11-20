'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Mail, RotateCcw, Save } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { FullPageLoader } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { useInstKey } from '@/features/institution/hooks';
import { api, del, errorMessage, post, put } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Template {
  key: string;
  name: string;
  subject: string;
  body: string;
  customized: boolean;
}

/** NOTIF-3: e-mail templates with {{variables}}, preview and reset to default. */
export function EmailTemplates() {
  const key = useInstKey();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: key('email-templates'),
    queryFn: async () => (await api.get<{ data: Template[]; meta: { variables: string[] } }>('/email-templates')).data,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  const current = list.data?.data.find((t) => t.key === (selected ?? list.data?.data[0]?.key));
  const value = draft ?? (current ? { subject: current.subject, body: current.body } : null);

  const refresh = () => qc.invalidateQueries({ queryKey: key('email-templates') });
  const save = useMutation({
    mutationFn: () => put(`/email-templates/${current!.key}`, value!),
    onSuccess: async () => {
      toast.success('Template saved.');
      setDraft(null);
      await refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reset = useMutation({
    mutationFn: () => del(`/email-templates/${current!.key}`),
    onSuccess: async () => {
      toast.success('Template reset to the default text.');
      setDraft(null);
      setPreview(null);
      await refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const show = useMutation({
    mutationFn: () => post<{ subject: string; body: string }>('/email-templates/preview', value!),
    onSuccess: setPreview,
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!list.data) return <FullPageLoader />;
  const select = (k: string) => {
    setSelected(k);
    setDraft(null);
    setPreview(null);
  };

  return (
    <>
      <PageHeader title="E-mail Templates" subtitle="Messages sent to applicants at each step of the admission" />
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit p-2">
          <ul>
            {list.data.data.map((t) => (
              <li key={t.key}>
                <button
                  onClick={() => select(t.key)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-[13.5px]',
                    current?.key === t.key
                      ? 'bg-primary-soft text-primary font-semibold'
                      : 'text-body hover:bg-card-soft',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Mail className="size-4 shrink-0" /> {t.name}
                  </span>
                  {t.customized && <Badge tone="blue">Edited</Badge>}
                </button>
              </li>
            ))}
          </ul>
        </Card>
        {current && value && (
          <div className="min-w-0 space-y-6">
            <Card>
              <CardHeader
                title={current.name}
                subtitle={current.customized ? 'Customised for your institution' : 'Default text'}
              />
              <CardBody className="space-y-4">
                <Field label="Subject" htmlFor="t-subject" required>
                  <Input
                    placeholder="E-mail subject"
                    id="t-subject"
                    value={value.subject}
                    onChange={(e) => setDraft({ ...value, subject: e.target.value })}
                  />
                </Field>
                <Field label="Message" htmlFor="t-body" required>
                  <Textarea
                    placeholder={'Write the message. Use {{variables}} where needed.'}
                    id="t-body"
                    rows={10}
                    className="font-mono text-[13px]"
                    value={value.body}
                    onChange={(e) => setDraft({ ...value, body: e.target.value })}
                  />
                </Field>
                <div>
                  <p className="text-muted mb-1.5 text-[12.5px] font-semibold">Variables (click to insert)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {list.data.meta.variables.map((v) => (
                      <button
                        key={v}
                        type="button"
                        className="bg-card-soft text-body hover:bg-primary-soft hover:text-primary rounded-lg px-2 py-1 font-mono text-[12px]"
                        onClick={() => setDraft({ ...value, body: `${value.body}{{${v}}}` })}
                      >
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    icon={<Save className="size-4" />}
                    disabled={!draft}
                    loading={save.isPending}
                    onClick={() => save.mutate()}
                  >
                    Save
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<Eye className="size-4" />}
                    loading={show.isPending}
                    onClick={() => show.mutate()}
                  >
                    Preview
                  </Button>
                  {current.customized && (
                    <Button
                      variant="ghost"
                      icon={<RotateCcw className="size-4" />}
                      loading={reset.isPending}
                      onClick={() => reset.mutate()}
                    >
                      Reset to default
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
            {preview && (
              <Card>
                <CardHeader title="Preview" subtitle="With sample values" />
                <CardBody>
                  <div className="border-line rounded-xl border">
                    <p className="border-line border-b px-4 py-3 text-[13.5px]">
                      <span className="text-muted">Subject: </span>
                      <b className="text-ink">{preview.subject}</b>
                    </p>
                    <p className="text-body px-4 py-4 text-[13.5px] whitespace-pre-line">{preview.body}</p>
                  </div>
                </CardBody>
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  );
}
