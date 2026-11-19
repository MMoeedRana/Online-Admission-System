'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { RefreshCw, SearchCheck, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { errorMessage, fieldErrors, get, post } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

/** FIND-7: status by application number, last four CNIC digits and a CAPTCHA. */
export function StatusLookup() {
  const [v, setV] = useState({ applicationNumber: '', cnicLast4: '', captchaAnswer: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const captcha = useQuery({
    queryKey: ['captcha'],
    queryFn: () => get<{ captchaId: string; svg: string }>('/public/status/captcha'),
    staleTime: 0,
    gcTime: 0,
  });
  const lookup = useMutation({
    mutationFn: () =>
      post<{ status: string; label: string; updatedAt: string }>('/public/status', {
        ...v,
        captchaId: captcha.data?.captchaId,
      }),
    onSuccess: () => setErrors({}),
    onError: (e) => setErrors(fieldErrors(e)),
    onSettled: () => {
      setV((x) => ({ ...x, captchaAnswer: '' }));
      void captcha.refetch();
    },
  });
  return (
    <div className="mx-auto grid max-w-5xl gap-6 py-4 lg:grid-cols-[1fr_1.1fr]">
      <div className="pt-2">
        <span className="bg-primary-soft text-primary flex size-14 items-center justify-center rounded-2xl">
          <SearchCheck className="size-7" />
        </span>
        <h1 className="mt-5 text-[28px] font-extrabold tracking-tight">Check your application status</h1>
        <p className="text-muted mt-3 text-[15px] leading-relaxed">
          Enter your application number and the last four digits of your CNIC or B-Form. Only the status is shown: no
          name, marks or other details.
        </p>
        <ul className="text-body mt-5 space-y-2 text-[13.5px]">
          <li className="flex gap-2">
            <ShieldCheck className="size-4 shrink-0 text-green-600" /> Protected by a security question and a request
            limit.
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="size-4 shrink-0 text-green-600" /> Sign in to see your merit position, aggregate and
            offer.
          </li>
        </ul>
      </div>
      <Card className="p-6 sm:p-7">
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            lookup.mutate();
          }}
        >
          <Field label="Application number" htmlFor="app" required error={errors.applicationNumber}>
            <Input
              id="app"
              placeholder="e.g. RIT-F26-MAIN-00012"
              value={v.applicationNumber}
              onChange={(e) => setV({ ...v, applicationNumber: e.target.value })}
            />
          </Field>
          <Field label="Last four digits of CNIC / B-Form" htmlFor="cnic" required error={errors.cnicLast4}>
            <Input
              id="cnic"
              inputMode="numeric"
              maxLength={4}
              placeholder="1234"
              value={v.cnicLast4}
              onChange={(e) => setV({ ...v, cnicLast4: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
          <Field
            label="Security question"
            htmlFor="captcha"
            required
            error={errors.captchaAnswer}
            hint="Write the answer of the sum in the picture."
          >
            <div className="flex items-center gap-3">
              <div
                className="border-line h-[50px] w-[200px] overflow-hidden rounded-xl border bg-white"
                dangerouslySetInnerHTML={{ __html: captcha.data?.svg ?? '' }}
              />
              <button
                type="button"
                onClick={() => void captcha.refetch()}
                aria-label="New security question"
                className="text-muted hover:text-primary rounded-lg p-2"
              >
                <RefreshCw className="size-4" />
              </button>
              <Input
                id="captcha"
                inputMode="numeric"
                className="w-24"
                value={v.captchaAnswer}
                onChange={(e) => setV({ ...v, captchaAnswer: e.target.value })}
              />
            </div>
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={lookup.isPending}>
            Check status
          </Button>
        </form>
        {lookup.data && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-5 dark:border-green-500/25 dark:bg-green-500/10"
          >
            <p className="text-[12.5px] font-semibold text-green-800 dark:text-green-200">Status</p>
            <p className="mt-1 text-[20px] font-extrabold text-green-900 dark:text-green-100">{lookup.data.label}</p>
            <p className="mt-1 text-[12.5px] text-green-800/80 dark:text-green-200/80">
              Last updated {formatDateTime(lookup.data.updatedAt)}
            </p>
          </motion.div>
        )}
        {lookup.error && !Object.keys(errors).length && (
          <Alert tone="error" className="mt-5">
            {errorMessage(lookup.error)}
          </Alert>
        )}
      </Card>
    </div>
  );
}
