"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { DashboardDialog } from "./DashboardDialog";
import { DashboardDropdown, DropdownField } from "./Dropdown";
import {
  roomModes,
  roomServers,
  roomFormat,
} from "@/lib/rooms/lobby-options.mjs";
import { firstPickMethods } from "@/lib/rooms/config";
export function CreateRoomDialog({
  hostName,
  busy,
  notice,
  storageNote,
  onClose,
  onSubmit,
}: {
  hostName: string;
  busy: boolean;
  notice: string;
  storageNote: string;
  onClose: () => void;
  onSubmit: (values: FormData, privateRoom: boolean) => Promise<void>;
}) {
  const [creationPrivate, setCreationPrivate] = useState(false);
  const [mode, setMode] = useState("ALL_PICK");
  const solo = !roomFormat(mode).playerDraft;
  return (
    <DashboardDialog titleId="create-title" onClose={onClose}>
      <form
        className="dashboard-panel dashboard-form w-full max-w-md p-6 text-zinc-100"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy)
            void onSubmit(new FormData(event.currentTarget), creationPrivate);
        }}
      >
        <div className="flex items-center justify-between">
          <h2 id="create-title" className="dashboard-section-title">
            Crear sala
          </h2>
          <button type="button" aria-label="Cerrar" onClick={() => onClose()}>
            <X size={20} />
          </button>
        </div>
        <p className="mt-2 text-sm text-zinc-500">
          {solo
            ? "1vs1 Central: un jugador por equipo, Ready 2/2 y asignacion directa."
            : "Equipos 5v5 y banco abierto."}
        </p>
        <label className="mt-6 block text-sm">
          Nombre
          <input
            autoFocus
            name="title"
            required
            maxLength={60}
            placeholder={"El stack de " + hostName}
            className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3"
          />
        </label>
        <label className="mt-4 block text-sm">
          Modo
          <DashboardDropdown
            value={mode}
            onChange={setMode}
            label={"Modo"}
            options={roomModes.map(({ value, label }) => ({ value, label }))}
            className="dashboard-dropdown-field mt-2 w-full"
            name={"mode"}
          />
        </label>
        <label className="mt-4 block text-sm">
          Servidor
          <DropdownField
            label="Servidor"
            defaultValue="PERU"
            options={roomServers.map(({ value, label }) => ({ value, label }))}
            className="dashboard-dropdown-field mt-2 w-full"
            name={"region"}
          />
        </label>
        <label className="mt-4 block text-sm">
          Formación de equipos
          <DropdownField
            label={"Formación de equipos"}
            key={solo ? "duel" : "teams"}
            options={
              solo
                ? [{ value: "automatic", label: "Asignacion directa" }]
                : [
                    { value: "captains", label: "Capitanes / Draft manual" },
                    { value: "automatic", label: "Asignación directa" },
                  ]
            }
            className="dashboard-dropdown-field mt-2 w-full"
            name={"formation"}
          />
        </label>
        {!solo && (
          <label className="mt-4 block text-sm">
            Primer pick (modo capitanes)
            <DropdownField
              label={"Primer pick (modo capitanes)"}
              options={[
                ...firstPickMethods.map((method) => ({
                  value: method.id,
                  label: method.label,
                })),
              ]}
              className="dashboard-dropdown-field mt-2 w-full"
              name={"firstPickGame"}
            />
          </label>
        )}
        <input
          type="hidden"
          name={solo ? "firstPickGame" : undefined}
          value="roll"
          disabled={!solo}
        />
        <label className="mt-4 block text-sm">
          Privacidad
          <DashboardDropdown
            label={"Privacidad"}
            options={[
              { value: "public", label: "Pública" },
              { value: "private", label: "Con contraseña" },
            ]}
            className="dashboard-dropdown-field mt-2 w-full"
            value={creationPrivate ? "private" : "public"}
            onChange={(value) => setCreationPrivate(value === "private")}
          />
        </label>
        {creationPrivate && (
          <label className="mt-4 block text-sm">
            Contraseña de sala
            <input
              type="password"
              name="roomPassword"
              autoComplete="new-password"
              required
              minLength={4}
              maxLength={64}
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3"
            />
          </label>
        )}
        <p className="my-5 text-xs text-zinc-500">{storageNote}</p>
        {notice && (
          <p role="status" className="my-3 text-xs text-zinc-400">
            {notice}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="dashboard-primary-button w-full"
        >
          {busy ? "Creando…" : "Crear sala"}
        </button>
      </form>
    </DashboardDialog>
  );
}
