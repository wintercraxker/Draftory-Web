"use client";
import { useSearchParams } from "next/navigation";
import { useAuth } from "./AuthProvider";

const messages: Record<string, string> = {
  trial_not_authorized:
    "Esta cuenta no está autorizada para el ensayo privado de Steam.",
  cancelled:
    "Cancelaste el acceso con Steam. Puedes volver a intentarlo cuando quieras.",
  invalid_response:
    "Steam no pudo confirmar el acceso. Inténtalo de nuevo desde Iniciar sesión.",
  expired: "El intento de acceso caducó. Vuelve a iniciar sesión con Steam.",
  service_unavailable:
    "El acceso con Steam no está disponible. Comprueba la conexión y las migraciones de la base de datos.",
  session_required: "Inicia sesión con Steam para entrar a Draftory.",
  signed_out: "Has cerrado sesión.",
  invalid_origin:
    "El dominio de acceso no coincide con APP_URL. Abre Draftory en el dominio configurado.",
};
export function AuthNotice() {
  const { missingConfiguration } = useAuth();
  const params = useSearchParams();
  const status = params.get("auth") ?? "";
  const message =
    status === "not_configured"
      ? `El acceso con Steam necesita configuración: ${missingConfiguration.join(", ") || "revisa APP_URL, DATABASE_URL y las migraciones"}.`
      : params.get("account") === "deleted"
        ? "Tu cuenta se eliminó. El acceso y los datos personales del perfil se retiraron; el historial compartido necesario se conserva desvinculado."
        : messages[status];
  if (!message) return null;
  return (
    <div role="status" className="mx-auto max-w-5xl px-5 pt-5">
      <div className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
        {message}
      </div>
    </div>
  );
}
