import {
  APP_DEEP_LINK_BASE,
  DEBUG_PREFIX,
  EVENT_DEEP_LINK_BASE,
  EVENT_DETAIL_DEEP_LINK_BASE,
  RESERVA_DEEP_LINK_BASE,
} from "../constants/appConfig";
/**
 * Detecta navegadores moviles para intentar abrir la app automaticamente.
 */
export function isMobileBrowser() {
  return /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent);
}

/**
 * Devuelve el esquema deep link correcto por tipo de invitacion.
 */
function getDeepLinkBase(kind) {
  if (kind === "event") return EVENT_DEEP_LINK_BASE;
  if (kind === "eventDetail") return EVENT_DETAIL_DEEP_LINK_BASE;
  return kind === "reserva" ? RESERVA_DEEP_LINK_BASE : APP_DEEP_LINK_BASE;
}

/**
 * Devuelve el segmento configurado en la app nativa para cada pantalla.
 */
function getNativeRouteSegment(kind) {
  if (kind === "event") return "evento";
  if (kind === "eventDetail") return "eventodetalle";
  if (kind === "reserva") return "reserva";
  return "plan";
}

function stripTrailingSlashes(base) {
  let normalizedBase = String(base || "").trim();
  while (normalizedBase.endsWith("/") && !normalizedBase.endsWith("://")) {
    normalizedBase = normalizedBase.slice(0, -1);
  }
  return normalizedBase;
}

function appendPathSegment(base, segment) {
  return base.endsWith("://") ? `${base}${segment}` : `${base}/${segment}`;
}

/**
 * Construye deep links seguros escapando el identificador de ruta.
 */
function buildRouteDeepLink(base, id, kind) {
  const routeSegment = getNativeRouteSegment(kind);
  const normalizedBase = stripTrailingSlashes(base);
  const normalizedBaseLower = normalizedBase.toLowerCase();
  const baseWithRoute =
    normalizedBaseLower.endsWith(`://${routeSegment}`) ||
    normalizedBaseLower.endsWith(`/${routeSegment}`)
      ? normalizedBase
      : appendPathSegment(normalizedBase, routeSegment);

  return appendPathSegment(baseWithRoute, encodeURIComponent(id));
}

/**
 * Genera el deep link final de una invitacion cargada.
 */
export function getInviteDeepLink(invite) {
  if (!invite.id) return;

  return buildRouteDeepLink(getDeepLinkBase(invite.kind), invite.id, invite.kind);
}

/**
 * Intenta abrir Pul con el deep link calculado.
 */
export function attemptOpenApp(invite, source = "auto") {
  const deepLink = getInviteDeepLink(invite);
  if (!deepLink) return;

  console.info(`${DEBUG_PREFIX} Abriendo app con deep link`, {
    kind: invite.kind,
    id: invite.id,
    source,
    deepLink,
  });
  window.location.href = deepLink;
}
