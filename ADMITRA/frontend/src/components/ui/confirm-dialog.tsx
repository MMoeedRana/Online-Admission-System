'use client';

import { useState } from 'react';
import { Button, type ButtonVariant } from './button';
import { Field, Textarea } from './input';
import { Modal } from './modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  message: string;
  confirmLabel: string;
  variant?: ButtonVariant;
  loading?: boolean;
  reasonLabel?: string;
}

/** Confirmation before destructive or irreversible actions (SAFE-7). */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  variant = 'danger',
  loading,
  reasonLabel,
}: Props) {
  const [reason, setReason] = useState('');
  const tooShort = Boolean(reasonLabel) && reason.trim().length < 5;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={variant} loading={loading} disabled={tooShort} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[14px] leading-relaxed">{message}</p>
      {reasonLabel && (
        <Field label={reasonLabel} htmlFor="reason" required hint="At least 5 characters." className="mt-4">
          <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      )}
    </Modal>
  );
}
