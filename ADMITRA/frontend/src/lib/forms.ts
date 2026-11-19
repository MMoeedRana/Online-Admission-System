import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { errorMessage, fieldErrors } from './api';
import { toast } from '@/components/ui/toast';

/** Shows server-side field errors under the matching inputs and a toast for the rest. */
export function handleFormError<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>) {
  const fields = fieldErrors(err);
  const keys = Object.keys(fields).filter((k) => fields[k]);
  for (const k of keys) setError(k as Path<T>, { message: fields[k] });
  toast.error(errorMessage(err));
}
