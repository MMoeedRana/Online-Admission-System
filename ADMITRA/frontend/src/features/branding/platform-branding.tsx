'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Palette, RotateCcw, Save } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { Reveal } from '@/components/ui/motion';
import { PageHeader } from '@/components/ui/page-header';
import { FullPageLoader } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { errorMessage, fieldErrors, get, patch, post } from '@/lib/api';
import { isHex, type Brand } from '@/lib/brand';
import { brandKey } from './brand-context';
import { BrandPreview, ColorField, ImageField } from './brand-fields';

type Form = Pick<Brand, 'platformName' | 'tagline' | 'agentName' | 'primaryColor' | 'sidebarColor' | 'avatarColor'>;

export function PlatformBranding() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['platform', 'branding'], queryFn: () => get<Brand>('/platform/branding') });
  const [draft, setDraft] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const refresh = async (b?: Brand) => {
    if (b) {
      qc.setQueryData(brandKey, b);
      qc.setQueryData(['platform', 'branding'], b);
    }
    await qc.invalidateQueries({ queryKey: brandKey });
  };
  const save = useMutation({
    mutationFn: (v: Form) => patch<Brand>('/platform/branding', v),
    onSuccess: async (b) => {
      toast.success('Branding saved. Every page now uses it.');
      setDraft(null);
      setErrors({});
      await refresh(b);
    },
    onError: (e) => {
      setErrors(fieldErrors(e));
      toast.error(errorMessage(e));
    },
  });
  const reset = useMutation({
    mutationFn: () => post<Brand>('/platform/branding/reset-colors'),
    onSuccess: async (b) => {
      toast.success('Colours restored to the defaults.');
      setDraft(null);
      await refresh(b);
    },
  });
  if (!q.data) return <FullPageLoader />;
  const b = q.data;
  const v: Form = draft ?? {
    platformName: b.platformName,
    tagline: b.tagline,
    agentName: b.agentName,
    primaryColor: b.primaryColor,
    sidebarColor: b.sidebarColor,
    avatarColor: b.avatarColor,
  };
  const set = (k: keyof Form, val: string) => setDraft({ ...v, [k]: val });
  const valid = isHex(v.primaryColor) && isHex(v.sidebarColor) && (!v.avatarColor || isHex(v.avatarColor));

  return (
    <>
      <PageHeader
        title="Branding"
        subtitle="Name, logo, favicon and colours of the whole platform. Institutions with custom branding can use their own."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<RotateCcw className="size-4" />}
              loading={reset.isPending}
              onClick={() => reset.mutate()}
            >
              Default colours
            </Button>
            <Button
              icon={<Save className="size-4" />}
              loading={save.isPending}
              disabled={!draft || !valid}
              onClick={() => save.mutate(v)}
            >
              Save branding
            </Button>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
        <div className="min-w-0 space-y-6">
          <Reveal>
            <Card>
              <CardHeader title="Names" subtitle="Used in the header, page titles, e-mails and PDF documents." />
              <CardBody className="grid gap-4 sm:grid-cols-2">
                <Field label="Platform name" htmlFor="b-name" required error={errors.platformName}>
                  <Input
                    id="b-name"
                    value={v.platformName}
                    maxLength={40}
                    placeholder="e.g. ADMITRA"
                    onChange={(e) => set('platformName', e.target.value)}
                  />
                </Field>
                <Field
                  label="AI assistant name"
                  htmlFor="b-agent"
                  required
                  error={errors.agentName}
                  hint="The name of the admission copilot."
                >
                  <Input
                    id="b-agent"
                    value={v.agentName}
                    maxLength={24}
                    placeholder="e.g. Mitra"
                    onChange={(e) => set('agentName', e.target.value)}
                  />
                </Field>
                <Field label="Tagline" htmlFor="b-tag" error={errors.tagline} className="sm:col-span-2">
                  <Input
                    id="b-tag"
                    value={v.tagline}
                    maxLength={120}
                    placeholder="One profile. Every college and university."
                    onChange={(e) => set('tagline', e.target.value)}
                  />
                </Field>
              </CardBody>
            </Card>
          </Reveal>
          <Reveal delay={0.05}>
            <Card>
              <CardHeader
                title="Logo and favicon"
                subtitle="PNG, JPG or WebP for the logo (up to 2 MB); PNG or ICO for the favicon (up to 500 KB)."
              />
              <CardBody className="grid gap-6 sm:grid-cols-2">
                <ImageField
                  label="Logo"
                  hint="Square images look best (at least 128 × 128 px)."
                  url={b.logoUrl}
                  uploadUrl="/platform/branding/logo"
                  onDone={(d) => void refresh(d as Brand)}
                />
                <ImageField
                  label="Favicon"
                  hint="The small icon of the browser tab (32 × 32 or 64 × 64 px)."
                  url={b.faviconUrl}
                  uploadUrl="/platform/branding/favicon"
                  accept="image/png,image/x-icon,.ico"
                  rounded="rounded-xl"
                  onDone={(d) => void refresh(d as Brand)}
                />
              </CardBody>
            </Card>
          </Reveal>
          <Reveal delay={0.1}>
            <Card>
              <CardHeader
                title="Colours"
                subtitle="Any colour can be chosen; it is adjusted only as much as needed to keep text readable."
              />
              <CardBody className="grid gap-6 md:grid-cols-2">
                <ColorField
                  id="b-primary"
                  label="Primary colour (buttons, links, highlights)"
                  value={v.primaryColor}
                  onChange={(c) => set('primaryColor', c)}
                />
                <ColorField
                  id="b-sidebar"
                  label="Sidebar colour"
                  kind="sidebar"
                  value={v.sidebarColor}
                  onChange={(c) => set('sidebarColor', c)}
                />
                <ColorField
                  id="b-avatar"
                  label="Initials colour (people without a picture)"
                  kind="avatar"
                  allowEmpty
                  emptyLabel="One colour per name"
                  value={v.avatarColor}
                  onChange={(c) => set('avatarColor', c)}
                />
              </CardBody>
            </Card>
          </Reveal>
        </div>
        <div className="min-w-0">
          <div className="xl:sticky xl:top-24">
            <Reveal delay={0.08}>
              <Card>
                <CardHeader
                  title="Preview"
                  subtitle={draft ? 'Unsaved changes' : 'As saved'}
                  action={<Palette className="text-muted size-5" aria-hidden />}
                />
                <CardBody>
                  <BrandPreview
                    primaryColor={isHex(v.primaryColor) ? v.primaryColor : b.primaryColor}
                    sidebarColor={isHex(v.sidebarColor) ? v.sidebarColor : b.sidebarColor}
                    avatarColor={v.avatarColor}
                    name={v.platformName || b.platformName}
                    logoUrl={b.logoUrl}
                  />
                  <p className="text-muted mt-4 text-[12.5px]">
                    The assistant appears as <b className="text-ink">{v.agentName || b.agentName}</b>. Changes reach
                    every page within 30 seconds.
                  </p>
                </CardBody>
              </Card>
            </Reveal>
          </div>
        </div>
      </div>
    </>
  );
}
