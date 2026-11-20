import type { ReactNode } from "react";

type ButtonProps = {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  asLink?: boolean;
  href?: string;
  type?: "button" | "submit" | "reset";
};

const styles = {
  primary:
    "bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white shadow-[0_0_30px_rgba(168,85,247,0.35)] hover:brightness-110",
  secondary:
    "border border-white/10 bg-white/5 text-white hover:border-violet-400/40 hover:bg-violet-500/10",
  ghost: "text-violet-200 hover:bg-white/5",
};

export function Button({
  children,
  variant = "primary",
  className = "",
  asLink = false,
  href,
  type = "button",
}: ButtonProps) {
  const classes = [
    "inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-violet-400/70",
    styles[variant],
    className,
  ].join(" ");

  if (asLink && href) {
    return (
      <a className={classes} href={href}>
        {children}
      </a>
    );
  }

  return (
    <button type={type} className={classes}>
      {children}
    </button>
  );
}
