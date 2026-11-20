"use client";
import { LoaderCircle, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
export function StaffButton({
  variant = "secondary",
  loading = false,
  children,
  className = "",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`staff-button staff-button--${variant} ${className}`}
    >
      {loading && <LoaderCircle size={15} className="animate-spin" />}
      {children}
    </button>
  );
}
export function StaffPager({
  page,
  pages,
  total,
  onPage,
  label = "registros",
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
  label?: string;
}) {
  if (total === 0) return null;
  const singular: Record<string, string> = {
    registros: "registro",
    "cuentas encontradas": "cuenta encontrada",
    "usuarios encontrados": "usuario encontrado",
    "registros recientes": "registro reciente",
  };
  return (
    <div className="staff-pagination">
      <span>
        {total} {total === 1 ? (singular[label] ?? label) : label} · Página{" "}
        {page} de {pages}
      </span>
      <div>
        <StaffButton
          type="button"
          variant="quiet"
          aria-label="Página anterior"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft size={16} />
        </StaffButton>
        <StaffButton
          type="button"
          variant="quiet"
          aria-label="Página siguiente"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight size={16} />
        </StaffButton>
      </div>
    </div>
  );
}
export function StaffEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="staff-empty">
      <Inbox size={25} />
      <p>{children}</p>
    </div>
  );
}
