"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
export function PublicIdentity({ publicId }: { publicId?: string | null }) {
  const [copied, setCopied] = useState(false),
    [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  if (!publicId) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
      <span>ID Draftory</span>
      <span className="font-mono text-zinc-400">{publicId}</span>
      <button
        type="button"
        title={copied ? "ID copiado" : "Copiar identificador de Draftory"}
        aria-label={copied ? "ID copiado" : "Copiar identificador de Draftory"}
        className="rounded p-1 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-violet-300"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(publicId);
            setCopied(true);
            setFailed(false);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 2000);
          } catch {
            setFailed(true);
          }
        }}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
      <span role="status">
        {failed
          ? "Selecciona el identificador para copiarlo."
          : copied
            ? "ID copiado"
            : ""}
      </span>
    </div>
  );
}
