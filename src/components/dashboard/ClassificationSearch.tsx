"use client";
import { PlayerDisplayName } from "../players/PlayerDisplayName";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import type { buildClassification } from "@/lib/classification-data";
import {
  classificationMatch,
  classificationSearchConfig,
  matchesClassification,
} from "@/lib/classification-search";
import { profileHandle, profileHref } from "@/lib/player-profiles";
import { AvatarImage } from "./AvatarIdentity";
import { CurrentUserBadge } from "./PlayerIdentity";

type RankedPlayer = ReturnType<typeof buildClassification>[number];
export function SearchHighlight({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  const match = classificationMatch(text, query);
  return match ? (
    <>
      {text.slice(0, match.start)}
      <mark className="ranking-search-highlight">
        {text.slice(match.start, match.end)}
      </mark>
      {text.slice(match.end)}
    </>
  ) : (
    <>{text}</>
  );
}

export function ClassificationSearch({
  players,
  currentUserId,
  onQuery,
}: {
  players: RankedPlayer[];
  currentUserId: string;
  onQuery: (query: string) => void;
}) {
  const router = useRouter(),
    id = useId();
  const root = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(""),
    [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const [placement, setPlacement] = useState({ above: false, height: 340 });
  const pending = query !== debounced;
  const results = players.filter((player) =>
    matchesClassification(
      { ...player, username: profileHandle(player) },
      debounced,
    ),
  );
  const suggestions = results.slice(
    0,
    classificationSearchConfig.maxSuggestions,
  );
  const expanded = open && !!query.trim();
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query);
      onQuery(query);
    }, classificationSearchConfig.debounceMs);
    return () => clearTimeout(timer);
  }, [query, onQuery]);
  useEffect(() => {
    if (!expanded) return;
    const update = () => {
      const bounds = input.current?.getBoundingClientRect();
      if (!bounds) return;
      const below = window.innerHeight - bounds.bottom - 16,
        above = bounds.top - 16;
      const flip = below < 180 && above > below;
      setPlacement({
        above: flip,
        height: Math.max(60, Math.min(340, flip ? above : below)),
      });
    };
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [expanded]);
  useEffect(() => {
    if (!expanded || pending) return;
    const option = document.getElementById(`${id}-option-${active}`);
    const popup = option?.closest<HTMLElement>(".ranking-search-popup");
    if (!option || !popup) return;
    const bounds = option.getBoundingClientRect(),
      container = popup.getBoundingClientRect();
    if (bounds.top < container.top)
      popup.scrollTop -= container.top - bounds.top;
    else if (bounds.bottom > container.bottom)
      popup.scrollTop += bounds.bottom - container.bottom;
  }, [active, expanded, pending, id]);
  function clear() {
    setQuery("");
    setDebounced("");
    onQuery("");
    setOpen(false);
    setActive(0);
    input.current?.focus();
  }
  return (
    <div ref={root} className="ranking-search">
      <div className="dashboard-search">
        <Search size={16} aria-hidden="true" />
        <input
          ref={input}
          role="combobox"
          aria-label="Buscar jugador, usuario o país"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={`${id}-results`}
          aria-activedescendant={
            expanded && !pending && suggestions[active]
              ? `${id}-option-${active}`
              : undefined
          }
          autoComplete="off"
          placeholder="Buscar jugador o país…"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" || event.key === "Tab") {
              setOpen(false);
              return;
            }
            if (
              ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) &&
              query.trim()
            ) {
              event.preventDefault();
              setOpen(true);
              setActive((index) =>
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? Math.max(0, suggestions.length - 1)
                    : Math.max(
                        0,
                        Math.min(
                          suggestions.length - 1,
                          index + (event.key === "ArrowDown" ? 1 : -1),
                        ),
                      ),
              );
            } else if (
              event.key === "Enter" &&
              expanded &&
              !pending &&
              suggestions[active]
            ) {
              event.preventDefault();
              setOpen(false);
              router.push(profileHref(suggestions[active]));
            }
          }}
        />
        {query && (
          <button type="button" onClick={clear} aria-label="Limpiar búsqueda">
            <X size={14} />
          </button>
        )}
      </div>
      {expanded && (
        <div
          className={`ranking-search-popup ${placement.above ? "ranking-search-popup-above" : ""}`}
          style={{ maxHeight: placement.height }}
        >
          <p className="dashboard-label ranking-search-heading">
            Resultados{!pending && <span>{results.length}</span>}
          </p>
          <div
            id={`${id}-results`}
            role="listbox"
            aria-label="Jugadores encontrados"
            aria-busy={pending}
          >
            {pending ? (
              <p className="ranking-search-empty" role="status">
                Buscando…
              </p>
            ) : suggestions.length ? (
              suggestions.map((player, index) => (
                <Link
                  id={`${id}-option-${index}`}
                  key={player.id}
                  href={profileHref(player)}
                  prefetch={false}
                  role="option"
                  aria-selected={active === index}
                  tabIndex={-1}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => setOpen(false)}
                  className="ranking-search-result"
                >
                  <AvatarImage
                    id={player.id}
                    src={player.avatar}
                    size={34}
                    alt=""
                    className="ranking-avatar"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="player-name-row">
                      <strong>
                        <PlayerDisplayName id={player.id} name={player.name}>
                          <SearchHighlight
                            text={player.name}
                            query={debounced}
                          />
                        </PlayerDisplayName>
                      </strong>
                      {player.id === currentUserId && <CurrentUserBadge />}
                    </div>
                    <p className="ranking-search-meta">
                      @
                      <SearchHighlight
                        text={profileHandle(player)}
                        query={debounced}
                      />
                    </p>
                    <p className="ranking-search-meta">
                      <SearchHighlight
                        text={player.country}
                        query={debounced}
                      />{" "}
                      · #{player.position}
                    </p>
                  </div>
                  <span className="ranking-search-elo">
                    {player.elo.toLocaleString("en-US")}
                    <small>ELO</small>
                  </span>
                </Link>
              ))
            ) : (
              <p className="ranking-search-empty" role="status">
                No encontramos jugadores para esta búsqueda.
              </p>
            )}
          </div>
          {!pending && results.length > suggestions.length && (
            <p className="ranking-search-empty">
              Todos los resultados aparecen en la clasificación.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
