'use client';

import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type HTMLMotionProps,
} from 'framer-motion';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';

const EASE = [0.22, 1, 0.36, 1] as const;

/** Fades and lifts its content into view once (respects "reduce motion"). */
export function Reveal({
  children,
  delay = 0,
  y = 14,
  className,
  ...rest
}: HTMLMotionProps<'div'> & { delay?: number; y?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -40px 0px' }}
      transition={{ duration: 0.5, ease: EASE, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** A container whose StaggerItem children appear one after another. */
export function Stagger({ children, className, gap = 0.06, ...rest }: HTMLMotionProps<'div'> & { gap?: number }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      // Animates on mount (not on scroll), so cards loaded later can never stay hidden.
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export const itemVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: EASE } },
};

/**
 * Child of Stagger; lifts slightly on hover when `hover` is set. A hover card that holds a link
 * opens it when any empty part of the card is clicked, so the whole card is clickable.
 */
export function StaggerItem({
  children,
  className,
  hover,
  onClick,
  ...rest
}: HTMLMotionProps<'div'> & { hover?: boolean }) {
  return (
    <motion.div
      className={className}
      variants={itemVariants}
      data-card-link={hover ? '' : undefined}
      whileHover={hover ? { y: -4, transition: { duration: 0.2 } } : undefined}
      onClick={(e) => {
        onClick?.(e);
        if (!hover || e.defaultPrevented) return;
        const target = e.target as HTMLElement;
        if (target.closest('a,button,input,select,textarea,label,[role=button]')) return;
        if (window.getSelection()?.toString()) return;
        e.currentTarget.querySelector<HTMLAnchorElement>('a[href]')?.click();
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Counts up to a number the first time it is visible. Non-numeric values are shown as they are. */
export function CountUp({
  value,
  format = (n) => Math.round(n).toLocaleString('en-PK'),
}: {
  value: number;
  format?: (n: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      mv.set(value);
      return;
    }
    const c = animate(mv, value, { duration: 1.1, ease: EASE });
    return () => c.stop();
  }, [inView, value, reduce, mv]);
  return <motion.span ref={ref}>{text}</motion.span>;
}

/** Soft entrance for every page of a shell (keyed by the path so it runs on each navigation). */
export function PageFade({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <motion.div
      key={path}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
