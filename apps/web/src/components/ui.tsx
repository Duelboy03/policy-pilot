import clsx from 'clsx'
import { X } from 'lucide-react'
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export const cn = clsx

export function Button({ variant = 'secondary', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' }) {
  const v = {
    primary: 'bg-accent text-accent-ink hover:brightness-110',
    secondary: 'border border-line bg-surface text-ink hover:bg-surface-2',
    ghost: 'text-sub hover:bg-surface-2 hover:text-ink',
    danger: 'bg-bad text-white hover:brightness-110',
  }[variant]
  return <button {...p} className={cn('inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50', size === 'sm' ? 'px-2.5 py-1.5 text-[13px]' : 'px-3.5 py-2 text-sm', v, className)} />
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'good' | 'bad' | 'info'; className?: string }) {
  const t = { neutral: 'bg-surface-2 text-sub', accent: 'bg-accent-soft text-accent', good: 'bg-good/15 text-good', bad: 'bg-bad/15 text-bad', info: 'bg-info/15 text-info' }[tone]
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', t, className)}>{children}</span>
}

export function Segmented<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; hint?: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {items.map((i) => (
        <button key={i.id} role="radio" aria-checked={value === i.id} title={i.hint} onClick={() => onChange(i.id)} className={cn('rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors', value === i.id ? 'bg-accent-soft text-accent' : 'text-sub hover:text-ink')}>
          {i.label}
        </button>
      ))}
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer, width = 'max-w-lg' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('keydown', key)
      prev?.focus()
    }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={cn('enter relative max-h-[90vh] w-full overflow-auto rounded-2xl border border-line bg-surface shadow-2xl outline-none', width)}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-sub hover:bg-surface-2"><X size={18} /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-sub">{hint}</span>}
    </label>
  )
}

export const inputCls = 'w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25'
