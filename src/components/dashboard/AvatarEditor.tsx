"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { avatarConfig, avatarCrop } from "@/lib/avatar";
import { DashboardDialog } from "./DashboardDialog";
import { DashboardButton } from "./DashboardUi";

// Crop UI is independent of storage: the injected repository persists the result.
export function AvatarEditor({
  onSave,
  onClose,
}: {
  onSave: (avatar: string) => Promise<void>;
  onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    preview = useRef<HTMLCanvasElement>(null),
    image = useRef<HTMLImageElement | null>(null);
  const [version, setVersion] = useState(0),
    [zoom, setZoom] = useState(1),
    [position, setPosition] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const selection = useRef(0),
    active = useRef(true),
    submitting = useRef(false);
  const drag = useRef<{
    x: number;
    y: number;
    position: { x: number; y: number };
  } | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    const img = image.current;
    if (!img) return;
    const crop = avatarCrop(
      img.naturalWidth,
      img.naturalHeight,
      zoom,
      position.x,
      position.y,
    );
    for (const target of [canvas.current, preview.current]) {
      const ctx = target?.getContext("2d");
      if (target && ctx) {
        ctx.clearRect(0, 0, target.width, target.height);
        ctx.drawImage(
          img,
          crop.x,
          crop.y,
          crop.size,
          crop.size,
          0,
          0,
          target.width,
          target.height,
        );
      }
    }
  }, [version, zoom, position]);
  async function select(file?: File) {
    if (!file) return;
    const request = ++selection.current;
    setError("");
    if (
      !avatarConfig.allowedTypes.includes(file.type) ||
      file.size > avatarConfig.maxFileBytes
    ) {
      setError("Selecciona PNG, JPG o WEBP de hasta 5 MB.");
      return;
    }
    setLoading(true);
    const url = URL.createObjectURL(file),
      img = new window.Image();
    try {
      img.src = url;
      await img.decode();
      if (!active.current || request !== selection.current) return;
      if (
        !img.naturalWidth ||
        !img.naturalHeight ||
        img.naturalWidth * img.naturalHeight > 40_000_000
      )
        throw new Error("La imagen es demasiado grande o no es válida.");
      image.current = img;
      setPosition({ x: 0, y: 0 });
      setZoom(1);
      setVersion((value) => value + 1);
    } catch (failure) {
      if (active.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "No se pudo leer la imagen.",
        );
    } finally {
      URL.revokeObjectURL(url);
      if (active.current && request === selection.current) setLoading(false);
    }
  }
  async function save() {
    if (!canvas.current || !image.current || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await onSave(canvas.current.toDataURL("image/webp", 0.88));
      onClose();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "No se pudo guardar la foto.",
      );
    } finally {
      submitting.current = false;
      if (active.current) setBusy(false);
    }
  }
  function moveBy(dx: number, dy: number) {
    const img = image.current;
    if (!img) return;
    const crop = avatarCrop(
      img.naturalWidth,
      img.naturalHeight,
      zoom,
      position.x + dx,
      position.y + dy,
    );
    setPosition({
      x: crop.x - (img.naturalWidth - crop.size) / 2,
      y: crop.y - (img.naturalHeight - crop.size) / 2,
    });
  }
  function changeZoom(value: number) {
    const img = image.current;
    if (!img) return;
    const crop = avatarCrop(
      img.naturalWidth,
      img.naturalHeight,
      value,
      position.x,
      position.y,
    );
    setZoom(value);
    setPosition({
      x: crop.x - (img.naturalWidth - crop.size) / 2,
      y: crop.y - (img.naturalHeight - crop.size) / 2,
    });
  }
  return (
    <DashboardDialog
      titleId="avatar-title"
      dismissible={!busy}
      onClose={onClose}
    >
      <div className="dashboard-panel p-5">
        <header className="flex justify-between items-center">
          <h2 id="avatar-title" className="dashboard-section-title">
            Cambiar foto de perfil
          </h2>
          <DashboardButton
            size="icon"
            variant="ghost"
            disabled={busy}
            aria-label="Cerrar editor"
            onClick={onClose}
          >
            <X size={15} />
          </DashboardButton>
        </header>
        <label className="avatar-upload mt-5">
          <Camera size={16} />
          <span>Seleccionar imagen</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy || loading}
            onChange={(event) => {
              void select(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
        <p className="mt-2 text-xs text-zinc-500">
          PNG, JPG o WEBP · máximo 5 MB
        </p>
        {loading && (
          <p role="status" className="mt-4 text-xs text-zinc-400">
            Cargando imagen…
          </p>
        )}
        {version > 0 && (
          <>
            <div
              className="avatar-crop"
              tabIndex={0}
              role="group"
              aria-label="Recorte de avatar. Arrastra o usa las flechas para mover la imagen"
              onKeyDown={(event) => {
                if (busy) return;
                const step =
                  Math.min(
                    image.current!.naturalWidth,
                    image.current!.naturalHeight,
                  ) /
                  zoom /
                  30;
                if (
                  ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                    event.key,
                  )
                ) {
                  event.preventDefault();
                  moveBy(
                    event.key === "ArrowLeft"
                      ? -step
                      : event.key === "ArrowRight"
                        ? step
                        : 0,
                    event.key === "ArrowUp"
                      ? -step
                      : event.key === "ArrowDown"
                        ? step
                        : 0,
                  );
                }
              }}
              onPointerDown={(event) => {
                if (busy) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = { x: event.clientX, y: event.clientY, position };
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              onPointerMove={(event) => {
                const start = drag.current,
                  img = image.current;
                if (!start || !img) return;
                const scale =
                  Math.min(img.naturalWidth, img.naturalHeight) /
                  zoom /
                  event.currentTarget.clientWidth;
                const crop = avatarCrop(
                  img.naturalWidth,
                  img.naturalHeight,
                  zoom,
                  start.position.x - (event.clientX - start.x) * scale,
                  start.position.y - (event.clientY - start.y) * scale,
                );
                setPosition({
                  x: crop.x - (img.naturalWidth - crop.size) / 2,
                  y: crop.y - (img.naturalHeight - crop.size) / 2,
                });
              }}
            >
              <canvas
                ref={canvas}
                width={avatarConfig.outputSize}
                height={avatarConfig.outputSize}
              />
              <span aria-hidden="true" className="avatar-circle-overlay" />
            </div>
            <label className="avatar-zoom">
              Zoom
              <input
                type="range"
                min={1}
                max={avatarConfig.maxZoom}
                step={0.01}
                value={zoom}
                disabled={busy}
                onChange={(event) => changeZoom(Number(event.target.value))}
              />
            </label>
            <div className="avatar-preview">
              <canvas ref={preview} width={64} height={64} />
              <p>
                Vista previa
                <br />
                <span>Recorte cuadrado 1:1</span>
              </p>
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="mt-4 text-xs text-rose-200">
            {error}
          </p>
        )}
        <footer className="mt-5 flex justify-end gap-2">
          <DashboardButton variant="ghost" disabled={busy} onClick={onClose}>
            Cancelar
          </DashboardButton>
          <DashboardButton
            variant="primary"
            busy={busy}
            disabled={!version || loading}
            onClick={() => void save()}
          >
            {busy ? "Guardando…" : "Guardar foto"}
          </DashboardButton>
        </footer>
      </div>
    </DashboardDialog>
  );
}
