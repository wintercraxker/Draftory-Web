import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-[#1b1125]/80 shadow-[0_20px_60px_rgba(15,10,20,0.45)] ${className}`}
    >
      {children}
    </div>
  );
}
