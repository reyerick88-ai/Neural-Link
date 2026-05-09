import type { Bot } from "grammy";
import { spawn } from "node:child_process";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import { withTelegramApiErrorLogging } from "./api-logging.js";

const DIADOC_LOGIN_URL = "https://agentdiadoc.com/login";
const WHATSAPP_WEB_URL = "https://web.whatsapp.com";

const CREDENTIAL_FIELD_MAX_LEN = 200;

const MSG_DIADOC_SIMPLE = "DIADOC abierto.";
const MSG_DIADOC_LOGIN =
  'DIADOC abierto. Si tus datos ya están guardados en Chrome, presiona "Iniciar Sesión". En la siguiente fase podré hacerlo automáticamente.';
const MSG_DIADOC_INLINE_CREDS =
  "DIADOC abierto. Detecté credenciales para esta sesión, pero por seguridad todavía no las guardo ni hago login automático. ¿Quieres que después configuremos inicio de sesión seguro en esta computadora?";
const MSG_DIADOC_SAVE_NO_STORE =
  "Para guardar credenciales de DIADOC necesito configurar un almacén seguro local. Todavía no está activado.";
const MSG_DIADOC_SAVE_WITH_CREDS =
  "Detecté credenciales de DIADOC, pero todavía no está activado el guardado seguro. No las guardaré en texto plano.";
const MSG_DIADOC_DELETE_NO_STORE =
  "Aún no hay almacén seguro de credenciales configurado para DIADOC.";

/** Ping NL: only exact phrases, short — avoids intercepting real chats */
const PING_MAX_CHARS = 48;
const PING_PHRASES = new Set([
  "hola",
  "hey",
  "prueba",
  "funciona",
  "test",
  "estas ahi",
  "estas funcionando",
]);

export type TelegramQuickActionParams = {
  bot: Bot;
  chatId: number;
  messageId: number;
  text: string;
  runtime: RuntimeEnv;
};

export type InlineCredentialExtract = {
  detected: boolean;
};

/** lowercase, trim, strip accents, collapse spaces */
export function normalizeText(text: string): string {
  const trimmed = text.trim();
  const noMarks = trimmed
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  return noMarks.replace(/\s+/g, " ").trim();
}

/** Login intent for DIADOC flows (normalized text, no accents). Exported for tests. */
export function isDiadocLoginIntent(normalizedText: string): boolean {
  const n = normalizedText;
  return (
    n.includes("iniciar sesion") ||
    n.includes("inicia sesion") ||
    n.includes("entrar con mi cuenta") ||
    n.includes("acceder con mi cuenta") ||
    n.includes("logueate") ||
    n.includes("loguearme") ||
    /\bcon mi cuenta\b/u.test(n) ||
    n.includes("entrar a mi cuenta") ||
    n.includes("dale iniciar sesion") ||
    n.includes("presiona iniciar sesion")
  );
}

/**
 * Conservative credential detection on raw message text (never logs values).
 * Returns only flags; captured values are discarded immediately.
 */
export function extractInlineCredentials(rawText: string): InlineCredentialExtract {
  const t = rawText.trim();
  if (!t) {
    return { detected: false };
  }

  const patterns: RegExp[] = [
    /mi\s+cuenta\s+es\s+(\S+)\s+y\s+mi\s+contrase(?:ñ|n)a\s+es\s+(\S+)/iu,
    /mi\s+cuenta\s+es\s+(\S+)\s+y\s+mi\s+clave\s+es\s+(\S+)/iu,
    /usuario\s+(\S+)\s+contrase(?:ñ|n)a\s+(\S+)/iu,
    /usuario\s*:\s*(\S+)\s+contrase(?:ñ|n)a\s*:\s*(\S+)/iu,
    /cuenta\s*:\s*(\S+)\s+clave\s*:\s*(\S+)/iu,
    /email\s*:\s*(\S+)\s+password\s*:\s*(\S+)/iu,
  ];

  for (const re of patterns) {
    const m = re.exec(t);
    if (!m?.[1] || !m[2]) {
      continue;
    }
    const user = m[1];
    const password = m[2];
    if (
      user.length > 0 &&
      user.length <= CREDENTIAL_FIELD_MAX_LEN &&
      password.length > 0 &&
      password.length <= CREDENTIAL_FIELD_MAX_LEN
    ) {
      return { detected: true };
    }
  }

  return { detected: false };
}

function splitTelegramSlashCommand(text: string): { cmd: string; rest: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  const spaceIdx = trimmed.search(/\s/u);
  const head = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const rest = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();
  const atIdx = head.indexOf("@");
  const cmd = (atIdx === -1 ? head : head.slice(0, atIdx)).toLowerCase();
  return { cmd, rest };
}

function openHttpsUrlOnWindows(url: string): void {
  if (process.platform !== "win32") {
    return;
  }
  const child = spawn("cmd.exe", ["/c", "start", "", url], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

async function replyQuick(params: TelegramQuickActionParams, body: string): Promise<void> {
  await withTelegramApiErrorLogging({
    operation: "sendMessage",
    runtime: params.runtime,
    fn: () =>
      params.bot.api.sendMessage(params.chatId, body, {
        reply_parameters: {
          message_id: params.messageId,
          allow_sending_without_reply: true,
        },
      }),
  }).catch(() => {});
}

function hasOpenVerb(n: string): boolean {
  return /\b(abre|abrir|entra|entrar|busca|buscar|ve|ir|carga|cargar|accede|acceder|inicia|iniciar)\b/u.test(
    n,
  );
}

function hasIrAVerb(n: string): boolean {
  return /\b(ir|ve)\s+a\b/u.test(n);
}

function hasQuieroEntrar(n: string): boolean {
  return n.includes("quiero entrar");
}

function hasOpeningIntent(n: string): boolean {
  return hasOpenVerb(n) || hasIrAVerb(n) || hasQuieroEntrar(n);
}

/** Broad DIADOC / dental context for NL routing. */
export function isDiadocRelated(normalizedText: string): boolean {
  const n = normalizedText;
  return (
    n.includes("diadoc") ||
    n.includes("agentdiadoc") ||
    /\bagent\s+diadoc\b/u.test(n) ||
    n.includes("software dental") ||
    n.includes("sistema dental") ||
    n.includes("plataforma diadoc")
  );
}

/** Prioridad 2: borrar credenciales DIADOC */
export function isDiadocDeleteCredentialIntent(normalizedText: string): boolean {
  const n = normalizedText;
  return (
    n.includes("borra mi cuenta de diadoc") ||
    n.includes("elimina credenciales de diadoc") ||
    n.includes("olvida mi contraseña de diadoc") ||
    n.includes("olvida mi contrasena de diadoc")
  );
}

/** Prioridad 3: guardar / configurar cuenta DIADOC */
export function isDiadocSaveCredentialIntent(normalizedText: string): boolean {
  const n = normalizedText;
  return (
    n.includes("guarda mi cuenta de diadoc") ||
    n.includes("configura mi cuenta de diadoc") ||
    n.includes("guarda estas credenciales de diadoc")
  );
}

/** DIADOC / sistema dental — abrir contexto (prioridad baja vs login/subtarea). Exported for tests. */
export function isDiadocIntent(normalizedText: string): boolean {
  const n = normalizedText;
  if (
    n.includes("diadoc") ||
    n.includes("agentdiadoc") ||
    /\bagent\s+diadoc\b/u.test(n)
  ) {
    return true;
  }
  const dentalApp =
    n.includes("software dental") ||
    n.includes("sistema dental") ||
    n.includes("plataforma diadoc");
  return dentalApp && hasOpeningIntent(n);
}

/** Label corto para mensaje compuesto; null si no hay subtarea. */
export function detectDiadocSubtask(normalizedText: string): string | null {
  const n = normalizedText;
  if (/\b(busca(r)?(\s+al)?\s+paciente|busca\s+paciente)\b/u.test(n)) {
    return "buscar paciente";
  }
  if (/\b(abre|abrir)\s+agenda\b/u.test(n)) {
    return "abrir agenda";
  }
  if (/\brevisa\s+citas\b/u.test(n) || /\bver\s+citas\b/u.test(n) || /\bcitas\s+de\s+hoy\b/u.test(n)) {
    return "revisar citas";
  }
  return null;
}

/** WhatsApp Web (prioridad sobre búsqueda genérica). Exported for tests. */
export function isWhatsappIntent(normalizedText: string): boolean {
  const n = normalizedText;
  if (/\bwhatsapp\b/u.test(n)) {
    return true;
  }
  if (n.includes("quiero ver los mensajes")) {
    return true;
  }
  if (hasOpeningIntent(n) && /\bmensajes\b/u.test(n)) {
    return true;
  }
  return false;
}

/** Query para Google; null si no aplica. Exported for tests. */
export function getGoogleSearchQuery(normalizedText: string): string | null {
  const n = normalizedText.trim();
  if (!n) {
    return null;
  }

  let m = n.match(/^busca\s+en\s+google\s+(.+)$/u);
  if (m?.[1]?.trim()) {
    return m[1].trim();
  }
  m = n.match(/^buscar\s+en\s+google\s+(.+)$/u);
  if (m?.[1]?.trim()) {
    return m[1].trim();
  }

  m = n.match(/^(.+)\s+en\s+google$/u);
  if (m?.[1]?.trim()) {
    return m[1].trim();
  }

  m = n.match(/^google\s+(.+)$/u);
  if (m?.[1]?.trim()) {
    return m[1].trim();
  }

  return null;
}

/** Ping natural: solo frases cortas exactas. Exported for tests. */
export function isPingIntent(normalizedText: string): boolean {
  const n = normalizedText.trim();
  if (!n || n.length > PING_MAX_CHARS) {
    return false;
  }
  return PING_PHRASES.has(n);
}

async function handleSlashQuickActions(
  params: TelegramQuickActionParams,
  parsed: { cmd: string; rest: string },
): Promise<boolean> {
  const { cmd, rest } = parsed;

  switch (cmd) {
    case "/ping": {
      await replyQuick(params, "funcionando");
      return true;
    }
    case "/diadoc": {
      if (rest.length > 0) {
        return false;
      }
      openHttpsUrlOnWindows(DIADOC_LOGIN_URL);
      await replyQuick(params, MSG_DIADOC_SIMPLE);
      return true;
    }
    case "/whatsapp": {
      if (rest.length > 0) {
        return false;
      }
      openHttpsUrlOnWindows(WHATSAPP_WEB_URL);
      await replyQuick(params, "WhatsApp Web abierto.");
      return true;
    }
    case "/google": {
      if (!rest.trim()) {
        await replyQuick(params, "Uso: /google texto de búsqueda");
        return true;
      }
      const q = encodeURIComponent(rest);
      const url = `https://www.google.com/search?q=${q}`;
      openHttpsUrlOnWindows(url);
      await replyQuick(params, "Búsqueda abierta.");
      return true;
    }
    case "/captura": {
      if (rest.length > 0) {
        return false;
      }
      await replyQuick(params, "Captura aún no implementada.");
      return true;
    }
    default:
      return false;
  }
}

async function handleNaturalQuickActions(
  params: TelegramQuickActionParams,
  normalized: string,
): Promise<boolean> {
  const rawTrim = params.text.trim();
  const inlineCred = extractInlineCredentials(rawTrim);

  if (isDiadocRelated(normalized)) {
    if (isDiadocDeleteCredentialIntent(normalized)) {
      await replyQuick(params, MSG_DIADOC_DELETE_NO_STORE);
      return true;
    }

    if (isDiadocSaveCredentialIntent(normalized)) {
      await replyQuick(
        params,
        inlineCred.detected ? MSG_DIADOC_SAVE_WITH_CREDS : MSG_DIADOC_SAVE_NO_STORE,
      );
      return true;
    }

    if (inlineCred.detected) {
      openHttpsUrlOnWindows(DIADOC_LOGIN_URL);
      await replyQuick(params, MSG_DIADOC_INLINE_CREDS);
      return true;
    }

    const subtask = detectDiadocSubtask(normalized);
    const login = isDiadocLoginIntent(normalized);
    const simpleOpen = isDiadocIntent(normalized);

    if (login || subtask !== null || simpleOpen) {
      openHttpsUrlOnWindows(DIADOC_LOGIN_URL);

      if (login && subtask !== null) {
        await replyQuick(
          params,
          `${MSG_DIADOC_LOGIN} La acción adicional "${subtask}" aún no está implementada.`,
        );
        return true;
      }
      if (login) {
        await replyQuick(params, MSG_DIADOC_LOGIN);
        return true;
      }
      if (subtask !== null) {
        await replyQuick(
          params,
          `DIADOC abierto. La acción adicional "${subtask}" aún no está implementada.`,
        );
        return true;
      }
      await replyQuick(params, MSG_DIADOC_SIMPLE);
      return true;
    }
  }

  if (isWhatsappIntent(normalized)) {
    openHttpsUrlOnWindows(WHATSAPP_WEB_URL);
    await replyQuick(params, "WhatsApp Web abierto.");
    return true;
  }
  const googleQuery = getGoogleSearchQuery(normalized);
  if (googleQuery) {
    const url = `https://www.google.com/search?q=${encodeURIComponent(googleQuery)}`;
    openHttpsUrlOnWindows(url);
    await replyQuick(params, "Búsqueda abierta.");
    return true;
  }
  if (isPingIntent(normalized)) {
    await replyQuick(params, "funcionando");
    return true;
  }
  return false;
}

/**
 * Handles local Quick Actions for Telegram (no agent / no LLM).
 * Priority: slash → DIADOC delete → DIADOC save → DIADOC inline → DIADOC login/subtask/simple → WhatsApp → Google → ping.
 * @returns true if the message was consumed.
 */
export async function maybeHandleTelegramQuickAction(params: TelegramQuickActionParams): Promise<boolean> {
  const trimmed = params.text.trim();

  const slash = splitTelegramSlashCommand(trimmed);
  if (slash) {
    const slashHandled = await handleSlashQuickActions(params, slash);
    if (slashHandled) {
      return true;
    }
    return false;
  }

  const normalized = normalizeText(trimmed);
  return handleNaturalQuickActions(params, normalized);
}
