'use client';

import { useState } from 'react';
import { Button, type ButtonVariant } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';

export function NoteDialog({
  open,
  onClose,
  onSubmit,
  title,
  message,
  confirmLabel,
  noteLabel = 'Note',
  required,
  variant = 'primary',
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (note: string) => void;
  title: string;
  message?: string;
  confirmLabel: string;
  noteLabel?: string;
  required?: boolean;
  variant?: ButtonVariant;
  loading?: boolean;
}) {
  const [note, setNote] = useState('');
  const short = required && note.trim().length < 5;
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
          <Button
            variant={variant}
            loading={loading}
            disabled={short}
            onClick={() => {
              onSubmit(note.trim());
              setNote('');
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message && <p className="mb-4 text-[14px] leading-relaxed">{message}</p>}
      <Field
        label={noteLabel}
        htmlFor="note"
        required={required}
        hint={required ? 'At least 5 characters. The applicant can see it.' : 'Optional.'}
      >
        <Textarea
          placeholder="Write a note for the team…"
          id="note"
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
    </Modal>
  );
}
