"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function DashboardDialog({
  children,
  titleId,
  onClose,
  wide = false,
  open = true,
  dismissible = true,
}: {
  children: ReactNode;
  titleId: string;
  onClose: () => void;
  wide?: boolean;
  open?: boolean;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open) dialog?.showModal();
    else dialog?.close();
    return () => dialog?.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (dismissible) onClose();
        else event.preventDefault();
      }}
      onClick={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
      className={`dashboard-dialog scrollbar-hide fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2.5rem)] overflow-y-auto rounded-2xl bg-transparent p-0 backdrop:bg-black/80 ${wide ? "max-w-3xl" : "max-w-md"}`}
    >
      {children}
    </dialog>
  );
}
