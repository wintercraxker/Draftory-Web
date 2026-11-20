"use client";
import { PlayerDisplayName } from "../players/PlayerDisplayName";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { StudioPlayer } from "@/lib/match-studio/model";
import {
  skillLabel,
  talentRows,
  verifiedTalent,
} from "@/lib/match-studio/presentation";
import s from "./MatchStudio.module.css";

const clock = (v: number) =>
  `${v < 0 ? "−" : ""}${Math.floor(Math.abs(v) / 60)}:${String(Math.floor(Math.abs(v) % 60)).padStart(2, "0")}`;
export function SkillPopover({
  player: p,
  event: e,
  hero,
}: {
  player: StudioPlayer;
  event: StudioPlayer["learning"][number];
  hero: string;
}) {
  const [open, setOpen] = useState(false),
    id = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    popup = useRef<HTMLDivElement>(null);
  const pinned = useRef(false),
    closing = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const label = skillLabel(p, e.abilityId, e.talent),
    a = p.abilityMeta.find((a) => a.id === e.abilityId),
    talent = verifiedTalent(p, e.abilityId);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  const close = () => {
    clear();
    pinned.current = false;
    setOpen(false);
  };
  const delay = () => {
    clear();
    if (!pinned.current) timer.current = setTimeout(() => setOpen(false), 140);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (!open) return;
    const position = () => {
      const button = trigger.current,
        box = popup.current;
      if (!button || !box) return;
      const r = button.getBoundingClientRect(),
        b = box.getBoundingClientRect(),
        gap = 10;
      const clip = button
        .closest("table")
        ?.parentElement?.getBoundingClientRect();
      if (
        r.bottom < 88 ||
        r.top > innerHeight ||
        r.right < 0 ||
        r.left > innerWidth ||
        (clip && (r.right < clip.left || r.left > clip.right))
      ) {
        box.style.visibility = "hidden";
        return;
      }
      const left = Math.max(
        gap,
        Math.min(
          innerWidth - b.width - gap,
          r.left + r.width / 2 - b.width / 2,
        ),
      );
      const above = r.top - b.height - gap,
        top =
          above >= 88
            ? above
            : Math.max(
                gap,
                Math.min(innerHeight - b.height - gap, r.bottom + gap),
              );
      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.visibility = "visible";
    };
    position();
    const outside = (ev: PointerEvent) => {
      if (
        !popup.current?.contains(ev.target as Node) &&
        !trigger.current?.contains(ev.target as Node)
      ) {
        pinned.current = false;
        setOpen(false);
      }
    };
    const escape = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        pinned.current = false;
        setOpen(false);
        if (popup.current?.contains(document.activeElement)) {
          closing.current = true;
          trigger.current?.focus();
        }
      }
    };
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <>
      <button
        ref={trigger}
        className={e.talent ? s.tableTalent : s.tableSkill}
        aria-label={`${label}, ${hero}, ${p.name ?? "Jugador"}, nivel ${e.level}, ${clock(e.time)}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onMouseEnter={() => {
          clear();
          setOpen(true);
        }}
        onMouseLeave={delay}
        onFocus={(ev) => {
          if (closing.current) {
            closing.current = false;
            return;
          }
          if (ev.currentTarget.matches(":focus-visible")) {
            clear();
            setOpen(true);
          }
        }}
        onBlur={(ev) => {
          if (!popup.current?.contains(ev.relatedTarget as Node)) {
            pinned.current = false;
            setOpen(false);
          }
        }}
        onClick={() => {
          clear();
          if (pinned.current) close();
          else {
            pinned.current = true;
            setOpen(true);
          }
        }}
      >
        {/* Valve artwork reused by OpenDota; no generic branching icon. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {label === "Bonificación de atributos" ? (
          <span aria-hidden="true">+</span>
        ) : e.talent ? (
          <img src="/match-studio/talent-tree.svg" alt="Árbol de talentos" />
        ) : a?.image ? (
          <img
            src={a.image}
            alt={label}
            onError={(ev) => {
              ev.currentTarget.style.visibility = "hidden";
            }}
          />
        ) : (
          <span aria-hidden="true">?</span>
        )}
      </button>
      {open &&
        createPortal(
          <div
            ref={popup}
            id={id}
            role="dialog"
            aria-label={talent ? "Árbol de talentos" : label}
            className={`${s.skillPopover} ${talent ? s.talentPopover : ""}`}
            onMouseEnter={clear}
            onMouseLeave={delay}
            onBlur={(ev) => {
              if (
                !ev.currentTarget.contains(ev.relatedTarget as Node) &&
                ev.relatedTarget !== trigger.current
              )
                close();
            }}
          >
            <button
              className={s.popoverClose}
              aria-label="Cerrar información de habilidad"
              onClick={() => {
                close();
                closing.current = true;
                trigger.current?.focus();
              }}
            >
              ×
            </button>
            <strong>{label}</strong>
            <p>
              {hero} ·{" "}
              <PlayerDisplayName
                id={p.userId ?? undefined}
                name={p.name ?? "Jugador anónimo"}
              />
            </p>
            <div className={s.learningMeta}>
              <span>Nivel {e.level ?? "no publicado"}</span>
              <span>Aprendida: {clock(e.time)}</span>
            </div>
            {talent && (
              <>
                <div className={s.talentTree}>
                  {talentRows(p).map((row) => (
                    <div key={row.level} className={s.talentRow}>
                      {row.options.map((option, i) => (
                        <div key={i}>
                          {i === 1 && <b>{row.level}</b>}
                          <span
                            className={
                              option.chosen ? s.chosenTalent : s.unknownTalent
                            }
                          >
                            {option.talent?.name &&
                            !option.talent.name.startsWith("special_bonus")
                              ? option.talent.name
                              : "Descripción no publicada"}
                            <small>
                              {option.chosen
                                ? "✓ Aprendido"
                                : option.talent
                                  ? "Sin aprendizaje registrado"
                                  : "Elección desconocida"}
                            </small>
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <small className={s.talentNote}>
                  Catálogo de la versión de esta partida. Solo se destacan IDs
                  con aprendizaje registrado.
                </small>
              </>
            )}
            {e.talent && !talent && (
              <small className={s.talentNote}>
                Evento de talento o atributo sin correspondencia verificable en
                el árbol. No permite identificar una elección.
              </small>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
