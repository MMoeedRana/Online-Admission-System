'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Maximize2, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBrand } from '@/features/branding/brand-context';
import { ChatPanel } from './chat';
import { pageBase, type Scope } from './types';

export function MitraLauncher({ scope }: { scope: Scope }) {
  const brand = useBrand();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  if (pathname.startsWith(pageBase(scope))) return null;
  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ y: -2 }}
        className="bg-primary fixed right-5 bottom-5 z-40 flex h-12 items-center gap-2 rounded-full px-5 text-[14px] font-semibold text-white shadow-[0_10px_30px_var(--ring)] sm:right-8 sm:bottom-8"
        aria-label={`Ask ${brand.agentName}`}
      >
        <Sparkles className="size-5" aria-hidden />
        <span className="hidden sm:inline">Ask {brand.agentName}</span>
      </motion.button>
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && (
              <div className="fixed inset-0 z-[60]">
                <motion.div
                  className="absolute inset-0 bg-slate-950/40"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setOpen(false)}
                />
                <motion.aside
                  role="dialog"
                  aria-modal="true"
                  aria-label={brand.agentName}
                  className="bg-card absolute inset-y-0 right-0 flex w-full flex-col shadow-2xl sm:w-[460px]"
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'spring', stiffness: 320, damping: 34 }}
                >
                  <div className="border-line flex items-center justify-end gap-1 border-b px-2 py-1.5">
                    <Link
                      href={pageBase(scope)}
                      onClick={() => setOpen(false)}
                      className="text-muted hover:text-ink rounded-lg p-2"
                      aria-label={`Open ${brand.agentName} page`}
                    >
                      <Maximize2 className="size-4" />
                    </Link>
                    <button
                      onClick={() => setOpen(false)}
                      className="text-muted hover:text-ink rounded-lg p-2"
                      aria-label="Close"
                    >
                      <X className="size-5" />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1">
                    <ChatPanel scope={scope} compact />
                  </div>
                </motion.aside>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
