import type { ReactNode, ButtonHTMLAttributes, HTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
export function DashboardBadge({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?:
    "neutral" | "captain" | "live" | "mvp" | "staff" | "you" | "win" | "loss";
  className?: string;
  children: ReactNode;
}) {
  return (
    <span data-tone={tone} className={`dashboard-badge ${className}`}>
      {children}
    </span>
  );
}
export function DashboardCard({
  variant = "default",
  className = "",
  ...props
}: HTMLAttributes<HTMLElement> & {
  variant?:
    "default" | "interactive" | "selected" | "live" | "success" | "danger";
}) {
  return (
    <article
      {...props}
      data-variant={variant}
      className={`dashboard-panel ${className}`}
    />
  );
}

export function DashboardButton({
  variant = "secondary",
  size = "sm",
  busy = false,
  className = "",
  children,
  disabled,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "icon";
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`hub-button hub-button-${variant} hub-button-${size} ${className}`}
    >
      {children}
    </button>
  );
}
export function DashboardSkeleton({
  variant = "matches",
}: {
  variant?:
    | "matches"
    | "predictions"
    | "profile"
    | "classification"
    | "history"
    | "room";
}) {
  return (
    <div
      role="status"
      aria-label="Cargando contenido"
      className={`dashboard-skeleton skeleton-${variant}`}
    >
      <span className="sr-only">Cargando…</span>
      {Array.from({ length: variant === "history" ? 3 : 2 }, (_, index) => (
        <div key={index}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
export function LoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="dashboard-load-error">
      <p>{message}</p>
      {onRetry && (
        <DashboardButton variant="secondary" onClick={onRetry}>
          Reintentar
        </DashboardButton>
      )}
    </div>
  );
}
export function DashboardToast({
  text,
  tone = "success",
}: {
  text: string;
  tone?: "success" | "info" | "warning" | "error";
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`dashboard-toast dashboard-toast-${tone}`}
    >
      {text}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="dashboard-page-header">
      <div className="min-w-0">
        <p className="dashboard-eyebrow">{eyebrow}</p>
        <h1 className="dashboard-page-title">{title}</h1>
        <p className="dashboard-description">{description}</p>
      </div>
      {action && <div className="dashboard-page-action">{action}</div>}
    </header>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  id,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="dashboard-section-header">
      <div className="min-w-0">
        {eyebrow && <p className="dashboard-eyebrow">{eyebrow}</p>}
        <h2 id={id} className="dashboard-section-title">
          {title}
        </h2>
        {description && (
          <p className="dashboard-section-description">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  index = 0,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  detail: string;
  icon: LucideIcon;
  index?: number;
  tone?: "neutral" | "positive" | "negative";
}) {
  return (
    <article
      className="dashboard-panel dashboard-stat-card dashboard-enter"
      style={{ animationDelay: `${index * 35}ms` }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="dashboard-label">{label}</p>
        <span className="dashboard-stat-icon">
          <Icon size={18} strokeWidth={1.8} />
        </span>
      </div>
      <p className={`dashboard-stat-value dashboard-stat-${tone}`}>
        {typeof value === "number" ? value.toLocaleString("en-US") : value}
      </p>
      <p className="dashboard-section-description">{detail}</p>
    </article>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  compact = false,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`dashboard-empty-state ${compact ? "dashboard-empty-compact" : ""}`}
    >
      <span className="dashboard-empty-icon">
        <Icon size={20} strokeWidth={1.8} />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-zinc-200">{title}</h3>
      <p className="mt-2 max-w-sm text-xs leading-5 text-zinc-500">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
