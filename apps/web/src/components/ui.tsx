import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from "react";

/** Small owned UI primitives — accessible defaults, consistent styling. */

export function Button({
  variant = "primary",
  busy = false,
  children,
  className = "",
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost"; busy?: boolean }) {
  const styles = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300",
    secondary: "border border-ink-200 bg-white text-ink-900 hover:border-ink-300 disabled:text-ink-400",
    ghost: "text-brand-700 hover:text-brand-800 disabled:text-ink-400",
  }[variant];
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  );
}

export function TextField({
  label,
  hint,
  error,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string | null }) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-900">
        {label}
      </label>
      <input
        id={id}
        {...rest}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`mt-1.5 block w-full rounded-lg border bg-white px-3 py-2.5 text-base text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 ${
          error ? "border-danger focus:ring-danger/30" : "border-ink-200 focus:border-brand-500 focus:ring-brand-500/20"
        }`}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-ink-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-md px-4 py-12 sm:py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
      {subtitle && <p className="mt-2 text-ink-600">{subtitle}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}

const fieldClass = (error?: string | null) =>
  `mt-1.5 block w-full rounded-lg border bg-white px-3 py-2.5 text-base text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 ${
    error ? "border-danger focus:ring-danger/30" : "border-ink-200 focus:border-brand-500 focus:ring-brand-500/20"
  }`;

function FieldMessages({ id, hint, error }: { id: string; hint?: ReactNode; error?: string | null }) {
  return (
    <>
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-ink-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: ReactNode; error?: string | null }) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-900">
        {label}
      </label>
      <textarea id={id} rows={3} {...rest} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={fieldClass(error)} />
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}

export function SelectField({
  label,
  hint,
  error,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: ReactNode; error?: string | null }) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-900">
        {label}
      </label>
      <select id={id} {...rest} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={fieldClass(error)}>
        {children}
      </select>
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}

export function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-ink-100 bg-white p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
