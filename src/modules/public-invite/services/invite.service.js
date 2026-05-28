import {
  DEBUG_PREFIX,
  PUBLIC_INVITE_ENDPOINT,
} from "../../../shared/constants/appConfig";
import { getUniqueIds, normalizeUserSummary } from "../../../shared/utils/users";
/**
 * Detecta si el enlace publico corresponde a plan, reserva, evento o detalle.
 */
export function getInviteContext() {
  const url = new URL(window.location.href);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const findRouteIndex = (...routes) =>
    pathParts.findIndex((part) => routes.includes(part));
  const explicitPlanId =
    url.searchParams.get("planId") ||
    url.searchParams.get("idPlan") ||
    (pathParts.includes("plan")
      ? pathParts[pathParts.indexOf("plan") + 1]
      : "");
  const explicitReservaId =
    url.searchParams.get("reservaId") ||
    url.searchParams.get("divisionId") ||
    url.searchParams.get("inviteId");
  const explicitEventDetailId =
    url.searchParams.get("eventDetailId") ||
    url.searchParams.get("detalleEventoId") ||
    url.searchParams.get("eventoUserId");
  const explicitEventId =
    url.searchParams.get("eventId") ||
    url.searchParams.get("eventoId") ||
    url.searchParams.get("idEvento");
  const planIndex = findRouteIndex("plan", "planes", "registro");
  const reservaIndex = findRouteIndex(
    "detalle-reserva",
    "detalle_reserva",
    "reserva",
    "cuenta",
    "split",
    "reservacion",
  );
  const eventDetailIndex = findRouteIndex(
    "detalle-evento",
    "detalle_evento",
    "eventodetalle",
  );
  const eventIndex = findRouteIndex("evento", "eventos", "event", "events");

  console.info(`${DEBUG_PREFIX} URL recibida`, {
    href: url.href,
    pathname: url.pathname,
    search: url.search,
    pathParts,
    query: Object.fromEntries(url.searchParams.entries()),
    explicitPlanId,
    explicitReservaId,
    explicitEventDetailId,
    explicitEventId,
    planIndex,
    reservaIndex,
    eventDetailIndex,
    eventIndex,
  });

  if (explicitReservaId || reservaIndex >= 0) {
    const context = {
      kind: "reserva",
      id:
        explicitReservaId || pathParts[reservaIndex + 1] || pathParts[0] || "",
    };
    console.info(`${DEBUG_PREFIX} Contexto detectado`, context);
    return context;
  }

  if (explicitEventDetailId || eventDetailIndex >= 0) {
    const context = {
      kind: "eventDetail",
      id:
        explicitEventDetailId ||
        pathParts[eventDetailIndex + 1] ||
        pathParts[0] ||
        "",
    };
    console.info(`${DEBUG_PREFIX} Contexto detectado`, context);
    return context;
  }

  if (explicitEventId || eventIndex >= 0) {
    const context = {
      kind: "event",
      id: explicitEventId || pathParts[eventIndex + 1] || pathParts[0] || "",
    };
    console.info(`${DEBUG_PREFIX} Contexto detectado`, context);
    return context;
  }

  const context = {
    kind: "plan",
    id: explicitPlanId || pathParts[planIndex + 1] || pathParts[0] || "",
  };
  console.info(`${DEBUG_PREFIX} Contexto detectado`, context);
  return context;
}

/**
 * Convierte valores de la API REST de Firestore a JavaScript normal.
 */
function firestoreValueToJs(value) {
  if (!value || typeof value !== "object") return value;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(firestoreValueToJs);
  }
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields || {}).map(([key, item]) => [
        key,
        firestoreValueToJs(item),
      ]),
    );
  }
  if ("geoPointValue" in value) return value.geoPointValue;
  return value;
}

/**
 * Normaliza documentos recibidos desde backend o Firestore REST.
 */
function normalizeFirestoreDocument(document) {
  if (!document?.fields) return document || {};

  const fields = document?.fields || {};
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      firestoreValueToJs(value),
    ]),
  );
}

/**
 * Clasifica el origen visual del plan sin alterar su comportamiento.
 */
function getPlanVariant(data) {
  const source = [
    data.linkedEntity,
    data.linkedEntity?.type,
    data.linkedEntity?.kind,
    data.linkedEntity?.collection,
    data.linkedEntity?.module,
    data.tipo,
    data.origen,
    data.resourceType,
  ]
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (source.includes("evento") || source.includes("event")) return "event";
  if (
    source.includes("negocio") ||
    source.includes("business") ||
    source.includes("venue") ||
    source.includes("restaurante")
  ) {
    return "business";
  }
  return "normal";
}

/**
 * Adapta un documento de plan al contrato comun que consume la pantalla publica.
 */
export function normalizePlan(document, id) {
  const data = normalizeFirestoreDocument(document);
  const integrantes = Array.isArray(data.integrantes) ? data.integrantes : [];
  const solicitudes = Array.isArray(data.solicitudes) ? data.solicitudes : [];
  const host = normalizeUserSummary(data.anfitrion, data.anfitrion?.id || "");
  const integrantesIds = getUniqueIds(integrantes);
  const solicitudesIds = getUniqueIds(solicitudes);
  const integrantesUsers = integrantes
    .filter((item) => item && typeof item === "object")
    .map((item) => normalizeUserSummary(item));
  const miembros = Number(data.integrantesCount ?? integrantes.length ?? 0);
  const planVariant = getPlanVariant(data);
  const attendees = integrantesUsers.length
    ? integrantesUsers
    : integrantesIds.map((memberId) =>
        memberId === host.id ? host : normalizeUserSummary(memberId),
      );

  return {
    id: data.id || id,
    kind: "plan",
    planVariant,
    title: data.concepto || data.linkedEntity?.title || "Plan en Pul",
    description:
      data.descripcion ||
      data.indicacines ||
      "Un plan compartido contigo para que te unas de forma rápida.",
    date: data.fecha || "",
    time: data.hora || "",
    endDate: data.fechaFin || "",
    endTime: data.horaFin || "",
    address: data.direccion || data.linkedEntity?.address || "",
    host: host.nombre || "Anfitrión Pul",
    hostId: host.id || "",
    hostImage: host.imagen || "",
    hostUser: host,
    capacity: Number(data.personas || 0),
    members: miembros,
    requests: Number(data.solicitudesCount ?? solicitudes.length ?? 0),
    visibility: data.visibilidad || "amigos",
    status: data.estatus || "",
    emoji: planVariant === 'normal' ? (data.emoji || "" ) : '',
    tags: data.hashtags || data.tags.map((tag) => `#${tag}`).join(" ") || data.tendencias?.tags || [],
    image: data.linkedEntity?.image || "",
    integrantesIds,
    solicitudesIds,
    attendees,
    coordinates: data.coordenadas || data.coordinates || null,
    amount: null,
    total: null,
    subtotal: null,
    fee: null,
    participants: null,
    resourceType: "plan",
    live: data.live
  };
}

/**
 * Adapta una reserva o division de cuenta al contrato comun de invitacion.
 */
function normalizeReserva(document, id, resourceType = "reservacion") {
  const data = normalizeFirestoreDocument(document);
  const isEvent = resourceType === "evento";
  const event = data.evento || {};
  const venue = data.negocio || {};
  const account = data.cuentaCurso || data.cuenta || {};
  const dividers = Array.isArray(data.dividers) ? data.dividers : [];
  const payers = Array.isArray(data.payers) ? data.payers : [];
  const refused = Array.isArray(data.refused) ? data.refused : [];
  const title = isEvent
    ? event.nombre || "División de evento"
    : venue.nombre
      ? `Cuenta en ${venue.nombre}`
      : "División de reservación";
  const itemLabel = isEvent
    ? data.mesa?.tipoMesa
      ? `${data.mesa.zona || "Zona"} · Mesa ${data.mesa.noMesa || ""}`.trim()
      : data.boleto?.nombre || "Boleto de evento"
    : data.mesa?.nombre || data.mesa?.zona || "Reservación";

  return {
    id: data.id || id,
    kind: "reserva",
    title,
    description:
      data.peticion ||
      `Te invitaron a dividir una cuenta de ${isEvent ? "evento" : "reservación"} en Pul.`,
    date: isEvent ? event.fechaString || "" : data.fecha || "",
    time: isEvent ? event.horaInicio || "" : data.hora || "",
    endDate: isEvent ? event.fechaStringFin || "" : "",
    endTime: isEvent ? event.horaFin || "" : "",
    address: isEvent ? event.ubicacion || "" : venue.direccion || "",
    host: data.anfitrion?.nombre || "Anfitrión Pul",
    hostImage: data.anfitrion?.imagen || "",
    capacity: data.personas || data.noPersonas || 0,
    members: dividers.length + 1,
    tags: [
      "Detalle de reserva",
      isEvent ? "Evento" : "Reservación",
      account.pagado ? "Pagado" : "Pago pendiente",
    ],
    image: isEvent
      ? event.fotoHome || event.fotos?.[0] || ""
      : venue.imagen || "",
    amount: Number(account.cu || 0),
    total: Number(account.total || 0),
    subtotal: Number(account.subtotal || 0),
    fee: Number(account.comisionStripe || 0),
    tip: Number(account.propina || 0),
    participants: dividers.length + 1,
    payers: payers.length,
    refused: refused.length,
    resourceType,
    itemLabel,
  };
}

/**
 * Adapta eventos y detalles de evento al contrato comun de invitacion.
 */
function normalizeEvent(document, id, kind = "event") {
  const data = normalizeFirestoreDocument(document);
  const tickets = Array.isArray(data.boletosTipo)
    ? data.boletosTipo.map((ticket) => ({
        id: ticket.id || ticket.nombre,
        type: "ticket",
        name: ticket.nombre || "Boleto",
        description: ticket.descripcion || "",
        price: Number(ticket.precio || 0),
        available: Number(ticket.disponibles ?? ticket.cantidad ?? 0),
      }))
    : [];
  const tables = Array.isArray(data.mesas)
    ? data.mesas.map((table) => ({
        id: table.id || `${table.zona}-${table.noMesa}`,
        type: "table",
        name: table.tipoMesa
          ? `${table.tipoMesa} ${table.noMesa ? `Mesa ${table.noMesa}` : ""}`.trim()
          : table.zona || "Mesa",
        description: table.especificaciones || table.zona || "",
        price: Number(table.costoMesa || table.ticketMesa || 0),
        available: table.disponible === false ? 0 : 1,
      }))
    : [];

  return {
    id: data.id || id,
    kind,
    title: data.nombre || "Evento Pul",
    description:
      data.descripcion ||
      data.especificaciones ||
      "Evento compartido contigo en Pul.",
    date: data.fechaString || "",
    time: data.horaInicio || "",
    endDate: data.fechaStringFin || "",
    endTime: data.horaFin || "",
    address: data.ubicacion || "",
    host: data.nombreNegocio || "Pul",
    hostImage: "",
    capacity: Number(data.cupo || 0),
    members: Array.isArray(data.integrantesIds)
      ? data.integrantesIds.length
      : 0,
    tags: [
      "Evento",
      tickets.length ? "Boletos" : "",
      tables.length ? "Mesas" : "",
    ].filter(Boolean),
    image: data.fotoHome || data.fotos?.[0] || "",
    images: data.fotos || [],
    amount: null,
    total: null,
    subtotal: null,
    fee: null,
    participants: null,
    resourceType: "evento",
    tickets,
    tables,
    schedule: data.cronograma || "",
    rules: data.reglas || "",
    details: data.especificaciones || "",
    periodicity: Array.isArray(data.periodicidad) ? data.periodicidad : [],
  };
}

/**
 * Crea datos seguros para renderizar cuando el backend no responde o falta detalle.
 */
export function fallbackInvite(context) {
  if (context.kind === "event") {
    return {
      id: context.id,
      kind: "event",
      title: "Evento Pul",
      description:
        "Abre Pul o compra como invitado desde esta página para recibir tu confirmación por correo.",
      date: "",
      time: "",
      endDate: "",
      endTime: "",
      address: "Información disponible dentro de Pul",
      host: "Pul",
      hostImage: "",
      capacity: 0,
      members: 0,
      tags: ["Evento", "Compra invitado"],
      image: "",
      images: [],
      amount: null,
      total: null,
      subtotal: null,
      fee: null,
      participants: null,
      resourceType: "evento",
      tickets: [],
      tables: [],
      schedule: "",
      rules: "",
      details: "",
      periodicity: [],
    };
  }

  if (context.kind === "eventDetail") {
    return {
      id: context.id,
      kind: "eventDetail",
      title: "Detalle de evento",
      description:
        "Abre Pul para ver todos los detalles de este evento compartido.",
      date: "",
      time: "",
      endDate: "",
      endTime: "",
      address: "Información disponible dentro de Pul",
      host: "Pul",
      hostImage: "",
      capacity: 0,
      members: 0,
      tags: ["Detalle de evento"],
      image: "",
      images: [],
      amount: null,
      total: null,
      subtotal: null,
      fee: null,
      participants: null,
      resourceType: "evento",
      tickets: [],
      tables: [],
      schedule: "",
      rules: "",
      details: "",
      periodicity: [],
    };
  }

  if (context.kind === "reserva") {
    return {
      id: context.id,
      kind: "reserva",
      title: "Detalle de reserva",
      description:
        "Abre Pul o continúa en web para aceptar la invitación, pagar tu parte o rechazarla.",
      date: "",
      time: "",
      endDate: "",
      endTime: "",
      address: "Información disponible dentro de Pul",
      host: "Pul",
      hostImage: "",
      capacity: 0,
      members: 0,
      tags: ["Detalle de reserva", "Pago con Stripe"],
      image: "",
      amount: 0,
      total: 0,
      subtotal: 0,
      fee: 0,
      tip: 0,
      participants: null,
      payers: 0,
      refused: 0,
      resourceType: "reservacion",
      itemLabel: "Invitación compartida",
    };
  }

  return {
    id: context.id,
    kind: "plan",
    title: "Únete a este plan",
    description:
      "Abre Pul para ver todos los detalles o regístrate en segundos para continuar.",
    date: "",
    time: "",
    endDate: "",
    endTime: "",
    address: "Información disponible dentro de Pul",
    host: "Pul",
    hostId: "",
    hostImage: "",
    capacity: 0,
    members: 0,
    requests: 0,
    visibility: "",
    status: "",
    emoji: "?",
    tags: ["Registro express", "Plan compartido"],
    image: "",
    amount: null,
    total: null,
    subtotal: null,
    fee: null,
    participants: null,
    resourceType: "plan",
  };
}

/**
 * Consulta el backend publico y registra trazas utiles para depurar enlaces.
 */
async function fetchPublicInviteDocument(path, id, queryParams = {}) {
  const encodedId = encodeURIComponent(id);
  const endpoint = new URL(`${PUBLIC_INVITE_ENDPOINT}/${path}/${encodedId}`);
  Object.entries(queryParams).forEach(([key, value]) => {
    if (
      value !== undefined &&
      value !== null &&
      value !== "" &&
      value !== "auto"
    ) {
      endpoint.searchParams.set(key, value);
    }
  });

  console.info(`${DEBUG_PREFIX} Consultando backend`, {
    path,
    id,
    endpoint: endpoint.toString(),
  });

  const response = await fetch(endpoint);
  console.info(`${DEBUG_PREFIX} Respuesta backend`, {
    path,
    id,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`${DEBUG_PREFIX} Error backend`, {
      path,
      id,
      status: response.status,
      body: errorBody,
    });
    throw new Error(`${path} request failed with ${response.status}`);
  }

  const payload = await response.json();
  console.info(`${DEBUG_PREFIX} Documento recibido desde backend`, {
    path,
    id,
    kind: payload.kind,
    resourceType: payload.resourceType,
    fieldKeys: Object.keys(payload.data || {}),
  });

  return payload;
}

/**
 * Orquesta la carga y normalizacion de la invitacion segun el dominio detectado.
 */
export async function fetchInvite(context) {
  console.info(`${DEBUG_PREFIX} Cargando invitacion`, context);

  if (context.kind === "event") {
    const event = normalizeEvent(
      (await fetchPublicInviteDocument("eventos", context.id)).data,
      context.id,
    );
    console.info(`${DEBUG_PREFIX} Evento normalizado`, event);
    return event;
  }

  if (context.kind === "eventDetail") {
    const eventDetail = normalizeEvent(
      (await fetchPublicInviteDocument("eventosUsers", context.id)).data,
      context.id,
      "eventDetail",
    );
    console.info(`${DEBUG_PREFIX} Detalle de evento normalizado`, eventDetail);
    return eventDetail;
  }

  if (context.kind === "plan") {
    const plan = normalizePlan(
      (await fetchPublicInviteDocument("planes", context.id)).data,
      context.id,
    );
    console.info(`${DEBUG_PREFIX} Plan normalizado`, plan);
    return plan;
  }

  const payload = await fetchPublicInviteDocument("reserva", context.id);
  const reserva = normalizeReserva(
    payload.data,
    context.id,
    payload.resourceType || "reservacion",
  );
  console.info(`${DEBUG_PREFIX} Reserva normalizada`, reserva);
  return reserva;
}
