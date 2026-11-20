"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "./AuthProvider";
import { RoleFormField } from "@/components/dashboard/DotaRoles";
import { DropdownField } from "@/components/dashboard/Dropdown";
import { validateDisplayName } from "@/lib/profile-validation";
import { accountCountries, accountRegions } from "@/lib/auth/onboarding";
import { validateMmr } from "@/lib/mmr-policy";

type OnboardingStep = 0 | 1 | 2 | 3;

const stepInfo = [
  {
    eyebrow: "BIENVENIDO A DRAFTORY",
    title: "Tu aventura empieza aquí.",
  },
  { eyebrow: "TU IDENTIDAD", title: "¿Cómo quieres que te llamemos?" },
  {
    eyebrow: "CONFIGURA TU REGIÓN",
    title: "¿Desde dónde juegas?",
  },
  {
    eyebrow: "TU ESTILO DE JUEGO",
    title: "¿Cómo prefieres jugar?",
  },
] as const;

export function SteamOnboarding({
  name,
  mmrEnabled = false,
  mmrMax = 20000,
}: {
  name: string;
  mmrEnabled?: boolean;
  mmrMax?: number;
}) {
  const router = useRouter();
  const { refresh } = useAuth();

  const [step, setStep] = useState<OnboardingStep>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mmrValue, setMmrValue] = useState("");
  const [mmrTouched, setMmrTouched] = useState(false);
  const [primaryChosen, setPrimaryChosen] = useState(false);
  let mmrError = "";
  if (mmrEnabled)
    try {
      validateMmr(mmrValue, mmrMax);
    } catch (problem) {
      mmrError = (problem as Error).message;
    }

  function goBack() {
    setError("");

    setStep((current) => Math.max(0, current - 1) as OnboardingStep);
  }

  function validateCurrentStep(form: HTMLFormElement) {
    const data = new FormData(form);

    if (step === 1) {
      try {
        validateDisplayName(data.get("displayName"));
      } catch (problem) {
        setError(
          problem instanceof Error ? problem.message : "Escribe tu nombre.",
        );
        return false;
      }
    }
    if (step === 2) {
      const country = String(data.get("country") ?? "");
      const region = String(data.get("region") ?? "");

      if (!country || !region) {
        setError("Elige tu país y tu región para continuar.");
        return false;
      }
    }

    if (step === 3) {
      if (mmrEnabled)
        try {
          validateMmr(data.get("mmr"), mmrMax);
        } catch (e) {
          setError((e as Error).message);
          return false;
        }
      const primary = String(data.get("preferredRolePrimary") ?? "");

      if (!primary) {
        setError("Elige tu rol principal para entrar a Draftory.");
        return false;
      }
    }

    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) return;

    setError("");

    if (!validateCurrentStep(event.currentTarget)) {
      return;
    }

    if (step < 3) {
      setStep((current) => Math.min(3, current + 1) as OnboardingStep);

      return;
    }

    setBusy(true);

    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(Object.fromEntries(form)),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "No se pudo guardar tu perfil.");
      }

      await refresh();

      router.replace("/dashboard");
      router.refresh();
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "No se pudo guardar tu perfil.",
      );

      setBusy(false);
    }
  }

  const marciMessage =
    step === 0 ? (
      <>
        ¡Hola
        {name && name !== "Jugador de Steam" ? (
          <>
            , <strong>{name}</strong>
          </>
        ) : null}
        ! Bienvenido a Draftory. Antes de empezar, voy a ayudarte a preparar tu
        perfil.
      </>
    ) : step === 1 ? (
      <>
        Este será tu nombre dentro de Draftory. Lo verán otros jugadores en tus
        salas, partidas y perfil.
      </>
    ) : step === 2 ? (
      <>
        Primero dime desde dónde juegas. Tu país y región nos ayudarán a
        preparar mejor tu experiencia en Draftory.
      </>
    ) : (
      <>
        Elige tu rol preferido y completa tu información competitiva para
        preparar equipos equilibrados.
      </>
    );

  return (
    <div
      data-onboarding-step={step + 1}
      className="steam-onboarding relative min-h-screen overflow-x-clip bg-[#09090b] text-zinc-100"
    >
      <header className="relative z-30 mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          aria-label="Draftory"
          className="flex items-center gap-2 text-lg font-semibold"
        >
          <Image src="/favicon.ico" width={32} height={32} alt="" />
          draftory<span className="text-zinc-500">.lol</span>
        </Link>
        <form action="/api/auth/logout" method="post">
          <button className="dashboard-link-button text-xs">
            Cerrar sesión
          </button>
        </form>
      </header>
      {/* Luz ambiental */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 76% 48%, rgba(139,92,246,.10), transparent 30%)",
        }}
      />

      <section className="relative mx-auto grid min-h-[calc(100svh-64px)] max-w-6xl grid-cols-1 items-center gap-5 px-6 py-6 lg:grid-cols-[minmax(0,620px)_minmax(280px,1fr)]">
        {/* CONTENIDO */}
        <div className="relative z-20">
          {/* Progreso */}
          <div className="mb-6 flex items-center gap-2">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className={[
                  "h-1 rounded-full transition-all duration-300",
                  item <= step ? "w-11 bg-violet-400" : "w-7 bg-white/10",
                ].join(" ")}
              />
            ))}

            <span className="ml-2 text-[11px] font-medium text-zinc-500">
              {step + 1} / 4
            </span>
          </div>

          <p className="dashboard-eyebrow">{stepInfo[step].eyebrow}</p>

          <h1 className="mt-3 max-w-xl text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
            {stepInfo[step].title}
          </h1>

          {/* Diálogo de Marci */}
          <div className="onboarding-bubble relative mt-5 rounded-2xl border border-white/[0.10] bg-[#111116]/95 px-5 py-4 shadow-[0_20px_60px_rgba(0,0,0,.25)]">
            {/* Pico del globo hacia Marci */}
            <span
              aria-hidden="true"
              className="absolute -right-[13px] top-8 hidden size-[26px] rotate-45 border-r border-t border-white/[0.10] bg-[#111116] lg:block"
            />

            <div className="mb-2 flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300">
                Marci
              </span>

              <span className="h-1 w-1 rounded-full bg-violet-400" />

              <span className="text-[11px] text-zinc-500">
                Guía de Draftory
              </span>
            </div>

            <div
              key={step}
              className="onboarding-step text-sm leading-6 text-zinc-300"
            >
              {marciMessage}
            </div>
          </div>

          <form
            className="dashboard-panel dashboard-form mt-5"
            onSubmit={handleSubmit}
            onClickCapture={(event) => {
              const form = event.currentTarget;
              requestAnimationFrame(() =>
                setPrimaryChosen(
                  !!new FormData(form).get("preferredRolePrimary"),
                ),
              );
            }}
          >
            <div className="min-h-[190px] p-5 sm:p-6">
              {/* PASO 1 */}
              <div className={step === 0 ? "block" : "hidden"}>
                <p className="max-w-lg text-sm leading-6 text-zinc-400">
                  Aquí encontrarás salas competitivas, tu clasificación,
                  estadísticas, logros y todo tu progreso dentro de la
                  comunidad.
                </p>

                <div className="mt-6 grid grid-cols-3 gap-3">
                  <Feature number="01" text="Juega" />
                  <Feature number="02" text="Compite" />
                  <Feature number="03" text="Progresa" />
                </div>
              </div>

              {/* PASO 2 */}
              <div hidden={step !== 1} className="onboarding-step">
                <label
                  className="dashboard-label block"
                  htmlFor="onboarding-name"
                >
                  Nombre visible
                </label>
                <input
                  id="onboarding-name"
                  name="displayName"
                  autoComplete="nickname"
                  maxLength={64}
                  disabled={busy}
                  defaultValue={name !== "Jugador de Steam" ? name : ""}
                  placeholder="Tu nombre en Draftory"
                  className="mt-3 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-400/15"
                />
                <p className="mt-3 text-xs text-zinc-500">
                  Podrás cambiarlo más adelante desde Configuración.
                </p>
              </div>
              <div className={step === 2 ? "block" : "hidden"}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-2 block text-zinc-300">País</span>

                    <DropdownField
                      label="País"
                      name="country"
                      fullWidth
                      className="onboarding-dropdown"
                      disabled={busy}
                      options={[
                        {
                          value: "",
                          label: "Elige tu país",
                        },
                        ...accountCountries.map((value) => ({
                          value,
                          label: value,
                        })),
                      ]}
                    />
                  </label>

                  <label className="block text-sm">
                    <span className="mb-2 block text-zinc-300">Región</span>

                    <DropdownField
                      label="Región"
                      name="region"
                      fullWidth
                      className="onboarding-dropdown"
                      disabled={busy}
                      options={[
                        {
                          value: "",
                          label: "Elige tu región",
                        },
                        ...accountRegions.map((value) => ({
                          value,
                          label: value,
                        })),
                      ]}
                    />
                  </label>
                </div>

                <div className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                  <p className="text-xs leading-5 text-zinc-500">
                    Tu región se utilizará para adaptar las salas y preferencias
                    competitivas de Draftory.
                  </p>
                </div>
              </div>

              {/*
                PASO 3

                IMPORTANTE:
                permanece montado durante todo el onboarding para
                conservar su estado interno.
              */}
              <div className={step === 3 ? "block" : "hidden"}>
                <RoleFormField
                  player={{
                    preferredRolePrimary: null,
                    preferredRoleSecondary: null,
                  }}
                />
                {mmrEnabled && (
                  <div className="onboarding-mmr" data-tour="competitive-mmr">
                    <label htmlFor="onboarding-mmr">MMR actual de Dota 2</label>
                    <div className="mmr-input-wrap">
                      <input
                        id="onboarding-mmr"
                        name="mmr"
                        value={mmrValue}
                        onChange={(event) => {
                          setMmrValue(event.target.value);
                          setMmrTouched(true);
                        }}
                        onBlur={() => setMmrTouched(true)}
                        inputMode="numeric"
                        pattern="[1-9][0-9]*"
                        maxLength={5}
                        placeholder="Ej. 4500"
                        disabled={step !== 3}
                        required={step === 3}
                        aria-invalid={mmrTouched && !!mmrError}
                        aria-describedby={
                          "onboarding-mmr-help" +
                          (mmrTouched && mmrError
                            ? " onboarding-mmr-error"
                            : "")
                        }
                      />
                      <span aria-hidden="true">MMR</span>
                    </div>
                    <p id="onboarding-mmr-help">
                      Introduce tu MMR actual de Dota 2. Lo utilizaremos para
                      equilibrar las salas mientras se verifica tu nivel.
                    </p>
                    {mmrTouched && mmrError && (
                      <p id="onboarding-mmr-error" role="alert">
                        {mmrError}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {error && (
                <div
                  role="alert"
                  className="mt-5 rounded-xl border border-rose-400/15 bg-rose-400/[0.05] px-4 py-3 text-sm text-rose-200"
                >
                  {error}
                </div>
              )}
            </div>

            {/* Navegación */}
            <div className="flex items-center justify-between border-t border-white/[0.06] px-6 py-4">
              <div>
                {step > 0 && (
                  <button
                    type="button"
                    onClick={goBack}
                    disabled={busy}
                    className="px-2 py-2 text-sm text-zinc-500 transition-colors hover:text-zinc-200 disabled:opacity-50"
                  >
                    ← Atrás
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={
                  busy ||
                  (step === 3 && (!primaryChosen || (mmrEnabled && !!mmrError)))
                }
                className="dashboard-primary-button"
              >
                {busy
                  ? "Preparando Draftory…"
                  : step === 0
                    ? "Comenzar"
                    : step < 3
                      ? "Continuar"
                      : "Crear mi perfil"}
              </button>
            </div>
          </form>
        </div>

        {/* MARCI */}
        <div className="pointer-events-none relative h-36 overflow-hidden lg:h-[min(580px,calc(100svh-100px))]">
          {/* Glow */}
          <div
            aria-hidden="true"
            className="absolute bottom-20 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-violet-500/[0.08] blur-[110px]"
          />

          <Image
            key={step}
            src={
              [
                "/marci_welcome.png",
                "/marci_nombre.png",
                "/marci_paisyregion.png",
                "/marci_roles.png",
              ][step]
            }
            alt=""
            width={1000}
            height={1600}
            priority
            className="onboarding-marci onboarding-pose absolute inset-0 h-full w-full object-contain object-bottom drop-shadow-[0_25px_35px_rgba(0,0,0,.5)]"
          />
        </div>
      </section>
    </div>
  );
}

function Feature({ number, text }: { number: string; text: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3">
      <span className="text-[10px] font-semibold tracking-[0.15em] text-violet-300">
        {number}
      </span>

      <p className="mt-1 text-sm font-medium text-zinc-300">{text}</p>
    </div>
  );
}
