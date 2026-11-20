"use client";
import { useEffect, useRef } from "react";
/** Keep native form drafts in memory across module navigation; no localStorage of notes. */
export function useStaffDrafts(section: string, target: string) {
  const drafts = useRef(new Map<string, Record<string, string>>());
  useEffect(() => {
    const root = document.querySelector(".staff-workspace");
    if (!root) return;
    const key = (form: HTMLFormElement) =>
      `${section}:${target}:${form.closest("[data-record-id]")?.getAttribute("data-record-id") ?? form.closest("details[id]")?.id ?? form.querySelector("h2,h3")?.textContent ?? form.querySelector("button")?.textContent}`;
    const forms = () =>
      [...root.querySelectorAll("form")].filter(
        (f) => !f.closest("[data-managed-drafts]"),
      );
    for (const form of forms()) {
      const saved = drafts.current.get(key(form));
      if (!saved) continue;
      for (const element of form.elements) {
        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement
        ) {
          if (
            element.name &&
            saved[element.name] !== undefined &&
            element.type !== "hidden"
          )
            element.value = saved[element.name];
        }
      }
    }
    const capture = (event: Event) => {
      const form = (event.target as HTMLElement).closest("form");
      if (!form || form.closest("[data-managed-drafts]")) return;
      const data: Record<string, string> = {};
      for (const [name, value] of new FormData(form)) {
        if (typeof value === "string") data[name] = value;
      }
      if (drafts.current.size > 100)
        drafts.current.delete(drafts.current.keys().next().value!);
      drafts.current.set(key(form), data);
    };
    root.addEventListener("input", capture);
    root.addEventListener("change", capture);
    return () => {
      root.removeEventListener("input", capture);
      root.removeEventListener("change", capture);
    };
  }, [section, target]);
}
