"use client";
import { Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
export function RoomPublicIdentity({ publicId }: { publicId?: string | null }) {
  const [copied, setCopied] = useState(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );
  if (!publicId) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
      <span>ID de sala</span>
      <code className="text-zinc-300">{publicId}</code>
      <button
        type="button"
        title="Copiar ID de sala"
        aria-label="Copiar ID de sala"
        className="rounded p-2 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-violet-300"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(publicId);
            setCopied(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
      >
        <Copy size={13} />
      </button>
      {copied && <span role="status">ID de sala copiado</span>}
    </div>
  );
}
