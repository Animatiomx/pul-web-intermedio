import { eventRoutes } from "./events/events.routes";
import { planRoutes } from "./plans/plans.routes";
import { reservationRoutes } from "./reservations/reservations.routes";

const routes = [...reservationRoutes, ...eventRoutes, ...planRoutes];

/**
 * Traduce la URL publica actual a un dominio interno sin acoplar App a pantallas.
 */
function getRouteContext() {
  const url = new URL(window.location.href);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const findRouteIndex = (...names) =>
    pathParts.findIndex((part) => names.includes(part));

  const queryKind =
    (url.searchParams.get("reservaId") ||
      url.searchParams.get("divisionId") ||
      url.searchParams.get("inviteId")) &&
    "reserva";

  if (queryKind) return queryKind;
  if (
    url.searchParams.get("eventDetailId") ||
    url.searchParams.get("detalleEventoId") ||
    url.searchParams.get("eventoUserId")
  ) {
    return "eventDetail";
  }
  if (
    url.searchParams.get("eventId") ||
    url.searchParams.get("eventoId") ||
    url.searchParams.get("idEvento")
  ) {
    return "event";
  }

  if (
    findRouteIndex(
      "detalle-reserva",
      "detalle_reserva",
      "reserva",
      "cuenta",
      "split",
      "reservacion",
    ) >= 0
  ) {
    return "reserva";
  }
  if (findRouteIndex("detalle-evento", "detalle_evento", "eventodetalle") >= 0) {
    return "eventDetail";
  }
  if (findRouteIndex("evento", "eventos", "event", "events") >= 0) {
    return "event";
  }

  return "plan";
}

/**
 * Router raiz liviano: selecciona el modulo por dominio y delega el render.
 */
export function AppRouter() {
  const routeKind = getRouteContext();
  const route =
    routes.find((candidate) => candidate.kind === routeKind) ||
    planRoutes[0];
  const Screen = route.component;

  return <Screen />;
}
