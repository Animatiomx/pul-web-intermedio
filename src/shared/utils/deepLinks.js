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
 * Construye deep links seguros escapando el identificador de ruta.
 */
function buildRouteDeepLink(base, id) {
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return `${normalizedBase}${encodeURIComponent(id)}`;
}

/**
 * Genera el deep link final de una invitacion cargada.
 */
export function getInviteDeepLink(invite) {
  if (!invite.id) return;

  return buildRouteDeepLink(getDeepLinkBase(invite.kind), invite.id);
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
