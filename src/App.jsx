import { useEffect, useState } from "react";
import logo from "./assets/logo.png";
import "./App.css";

const APP_DEEP_LINK_BASE =
  import.meta.env.VITE_APP_DEEP_LINK_BASE || "pul://plan";
const RESERVA_DEEP_LINK_BASE =
  import.meta.env.VITE_RESERVA_DEEP_LINK_BASE ||
  import.meta.env.VITE_Reserva_DEEP_LINK_BASE ||
  "pul://reserva";
const EVENT_DETAIL_DEEP_LINK_BASE =
  import.meta.env.VITE_EVENT_DETAIL_DEEP_LINK_BASE || "pul://eventodetalle";
const EVENT_DEEP_LINK_BASE =
  import.meta.env.VITE_EVENT_DEEP_LINK_BASE || "pul://evento";
const FIREBASE_API_KEY =
  import.meta.env.VITE_FIREBASE_API_KEY ||
  "REDACTED_CREDENTIAL_09d5e8ea";
const STRIPE_CHECKOUT_ENDPOINT =
  import.meta.env.VITE_STRIPE_CHECKOUT_ENDPOINT || "";
const EVENT_CHECKOUT_ENDPOINT =
  import.meta.env.VITE_EVENT_CHECKOUT_ENDPOINT || "";
const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || "https://api.pul.com.mx";
const PUBLIC_INVITE_ENDPOINT =
  import.meta.env.VITE_PUBLIC_INVITE_ENDPOINT || `${BACKEND_URL}/public`;
const EMAIL_CONFIRMATION_ENDPOINT =
  import.meta.env.VITE_EMAIL_CONFIRMATION_ENDPOINT ||
  `${BACKEND_URL}/email/send`;
const PLAN_JOIN_ENDPOINT =
  import.meta.env.VITE_PLAN_JOIN_ENDPOINT || `${BACKEND_URL}/plans/join`;
const PLAN_LEAVE_ENDPOINT =
  import.meta.env.VITE_PLAN_LEAVE_ENDPOINT || `${BACKEND_URL}/plans/leave`;
const RESERVA_RESPONSE_ENDPOINT =
  import.meta.env.VITE_RESERVA_RESPONSE_ENDPOINT ||
  import.meta.env.VITE_Reserva_RESPONSE_ENDPOINT ||
  "";
const APP_STORE_URL =
  import.meta.env.VITE_APP_STORE_URL || "https://www.apple.com/app-store/";
const PLAY_STORE_URL =
  import.meta.env.VITE_PLAY_STORE_URL || "https://play.google.com/store";

const DEBUG_PREFIX = "[Pul Web]";

const initialForm = {
  nombre: "",
  email: "",
  telefono: "",
  password: "",
};

const initialLoginForm = {
  email: "",
  password: "",
};

const initialGuestForm = {
  nombre: "",
  email: "",
  telefono: "",
};

function getUserId(user) {
  return user?.id || user?.uid || user?.userId || "";
}

function normalizeUserSummary(value, fallbackId = "") {
  if (value && typeof value === "object") {
    const id = getUserId(value) || fallbackId;
    return {
      id,
      nombre:
        value.nombre ||
        value.name ||
        value.displayName ||
        value.email ||
        id ||
        "Pul",
      imagen: value.imagen || value.image || value.avatar || value.foto || "",
      email: value.email || "",
    };
  }

  const id = String(value || fallbackId || "");
  return {
    id,
    nombre: id ? `Usuario ${id.slice(0, 5)}` : "Usuario Pul",
    imagen: "",
    email: "",
  };
}

function getUniqueIds(values = []) {
  return [
    ...new Set(
      values
        .map((value) => (typeof value === "object" ? getUserId(value) : value))
        .filter(Boolean)
        .map(String),
    ),
  ];
}

function getInviteContext() {
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

function normalizePlan(document, id) {
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
  const attendees = integrantesUsers.length
    ? integrantesUsers
    : integrantesIds.map((memberId) =>
        memberId === host.id ? host : normalizeUserSummary(memberId),
      );

  return {
    id: data.id || id,
    kind: "plan",
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
    emoji: data.emoji || "?",
    tags: data.hashtags || data.tags || data.tendencias?.tags || [],
    image: data.linkedEntity?.image || data.anfitrion?.imagen || "",
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
  };
}

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
      ? `${data.mesa.zona || "Zona"} ? Mesa ${data.mesa.noMesa || ""}`.trim()
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

function fallbackInvite(context) {
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

async function fetchInvite(context) {
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

function isMobileBrowser() {
  return /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent);
}

function getDeepLinkBase(kind) {
  if (kind === "event") return EVENT_DEEP_LINK_BASE;
  if (kind === "eventDetail") return EVENT_DETAIL_DEEP_LINK_BASE;
  return kind === "reserva" ? RESERVA_DEEP_LINK_BASE : APP_DEEP_LINK_BASE;
}

function buildRouteDeepLink(base, id) {
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return `${normalizedBase}${encodeURIComponent(id)}`;
}

function getInviteDeepLink(invite) {
  if (!invite.id) return;

  return buildRouteDeepLink(getDeepLinkBase(invite.kind), invite.id);
}

function attemptOpenApp(invite, source = "auto") {
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

function formatInviteDate(invite) {
  const date = [invite.date, invite.time].filter(Boolean).join(" ? ");
  const end = [invite.endDate, invite.endTime].filter(Boolean).join(" ? ");
  if (date && end) return `${date} a ${end}`;
  return date || "Fecha por confirmar";
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(amount);
}

function formatPlanVisibility(value) {
  const visibility = String(value || "publico").toLowerCase();
  if (visibility === "privado") return "Plan privado";
  if (visibility === "amigos") return "Solo amigos";
  return "Plan público";
}

function formatPlanDate(dateString, timeString) {
  if (!dateString) return "Por confirmar";
  const safeDate = new Date(`${dateString}T12:00:00`);
  const formatted = Number.isNaN(safeDate.getTime())
    ? dateString
    : new Intl.DateTimeFormat("es-MX", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "2-digit",
      }).format(safeDate);
  return [formatted, timeString?.slice?.(0, 5)].filter(Boolean).join(" · ");
}

function UserAvatar({ user, size = "md" }) {
  const initial = (user?.nombre || user?.email || "P")
    .slice(0, 1)
    .toUpperCase();

  return (
    <span className={`user-avatar ${size}`}>
      {user?.imagen ? <img src={user.imagen} alt="" /> : initial}
    </span>
  );
}

function PlanSection({ icon, title, children, action }) {
  return (
    <section className="plan-web-section">
      <div className="plan-web-section-head">
        <span className="plan-web-icon" aria-hidden="true">
          {icon}
        </span>
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function PlanAuthPanel({
  view,
  setView,
  errors,
  registerForm,
  loginForm,
  onRegisterFieldChange,
  onLoginFieldChange,
  onRegisterSubmit,
  onLoginSubmit,
  flowStatus,
}) {
  if (view === "register") {
    return (
      <form className="plan-auth-card" onSubmit={onRegisterSubmit} noValidate>
        <div>
          <span>Registro rápido</span>
          <strong>Crea tu cuenta para continuar</strong>
        </div>
        <label>
          <span>Nombre</span>
          <input
            name="nombre"
            value={registerForm.nombre}
            onChange={onRegisterFieldChange}
          />
          {errors.nombre && <small>{errors.nombre}</small>}
        </label>
        <label>
          <span>Email</span>
          <input
            name="email"
            type="email"
            value={registerForm.email}
            onChange={onRegisterFieldChange}
          />
          {errors.email && <small>{errors.email}</small>}
        </label>
        <label>
          <span>Teléfono</span>
          <input
            name="telefono"
            type="tel"
            value={registerForm.telefono}
            onChange={onRegisterFieldChange}
          />
          {errors.telefono && <small>{errors.telefono}</small>}
        </label>
        <label>
          <span>Contraseña</span>
          <input
            name="password"
            type="password"
            value={registerForm.password}
            onChange={onRegisterFieldChange}
          />
          {errors.password && <small>{errors.password}</small>}
        </label>
        {errors.form && <p className="status-note error-note">{errors.form}</p>}
        <button
          className="primary-button"
          disabled={flowStatus === "registering"}
          type="submit"
        >
          {flowStatus === "registering" ? "Creando cuenta..." : "Crear cuenta"}
        </button>
        <button
          className="ghost-button"
          type="button"
          onClick={() => setView("login")}
        >
          Ya tengo cuenta
        </button>
      </form>
    );
  }

  return (
    <form className="plan-auth-card" onSubmit={onLoginSubmit} noValidate>
      <div>
        <span>Login rápido</span>
        <strong>Entra para unirte al plan</strong>
      </div>
      <label>
        <span>Email</span>
        <input
          name="email"
          type="email"
          value={loginForm.email}
          onChange={onLoginFieldChange}
        />
        {errors.email && <small>{errors.email}</small>}
      </label>
      <label>
        <span>Contraseña</span>
        <input
          name="password"
          type="password"
          value={loginForm.password}
          onChange={onLoginFieldChange}
        />
        {errors.password && <small>{errors.password}</small>}
      </label>
      {errors.form && <p className="status-note error-note">{errors.form}</p>}
      <button
        className="primary-button"
        disabled={flowStatus === "logging-in"}
        type="submit"
      >
        {flowStatus === "logging-in" ? "Iniciando sesión..." : "Iniciar sesión"}
      </button>
      <button
        className="ghost-button"
        type="button"
        onClick={() => setView("register")}
      >
        Registro rápido
      </button>
    </form>
  );
}

function PlanWebView({
  invite,
  inviteStatus,
  authUser,
  onLogout,
  flowStatus,
  planJoinMessage,
  view,
  setView,
  errors,
  registerForm,
  loginForm,
  onRegisterFieldChange,
  onLoginFieldChange,
  onRegisterSubmit,
  onLoginSubmit,
  joinCurrentPlan,
  leaveCurrentPlan,
  attemptOpenApp,
}) {
  const [attendeesOpen, setAttendeesOpen] = useState(false);
  const [attendeeSearch, setAttendeeSearch] = useState("");
  const userId = getUserId(authUser);
  const memberIds = invite.integrantesIds || [];
  const requestIds = invite.solicitudesIds || [];
  const isHost = Boolean(userId && userId === invite.hostId);
  const isMember = Boolean(userId && memberIds.includes(userId));
  const isPending = Boolean(userId && requestIds.includes(userId));
  const capacity = Number(invite.capacity || 0);
  const memberCount = Number(invite.members || memberIds.length || 0);
  const spotsLeft = capacity > 0 ? Math.max(capacity - memberCount, 0) : null;
  const isFull = spotsLeft === 0;
  const attendees = invite.attendees?.length
    ? invite.attendees
    : [
        invite.hostUser,
        ...memberIds.map((id) => normalizeUserSummary(id)),
      ].filter(Boolean);
  const visibleAttendees = attendees.filter((user) =>
    `${user?.nombre || ""} ${user?.email || ""}`
      .toLowerCase()
      .includes(attendeeSearch.toLowerCase()),
  );
  const mapQuery = encodeURIComponent(invite.address || invite.title || "Pul");
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
  const actionText = isHost
    ? "Eres anfitrión"
    : isPending || flowStatus === "plan-requested"
      ? "Solicitud enviada"
      : isMember
        ? "Salirse del plan"
        : isFull
          ? "Unirse a lista de espera"
          : "Unirse al plan";

  return (
    <main className="plan-web-shell">
      <nav className="plan-web-topbar" aria-label="Plan">
        <button
          className="round-icon-button"
          type="button"
          onClick={() => window.history.back()}
        >
          ?
        </button>
        <img src={logo} alt="Pul" className="brand-logo" />
        <button
          className="ghost-button compact"
          type="button"
          onClick={() => attemptOpenApp(invite, "manual-open")}
        >
          Abrir app
        </button>
      </nav>

      <section className="plan-web-hero">
        <div className="plan-web-hero-card">
          <div className="plan-web-emoji" aria-hidden="true">
            {invite.emoji || "⚽"}
          </div>
          <p className="eyebrow">{formatPlanVisibility(invite.visibility)}</p>
          <h1>{invite.title}</h1>
          <p>
            {invite.description || "Este plan no tiene descripción adicional."}
          </p>
          <div className="plan-web-host-card">
            <UserAvatar user={invite.hostUser} size="lg" />
            <div>
              <span>ANFITRIÓN</span>
              <strong>{invite.host}</strong>
            </div>
          </div>
        </div>
        <aside className="plan-web-action-card">
          <div className="plan-web-capacity">
            <span>{memberCount}</span>
            <p>de {capacity || "?"} personas</p>
            {spotsLeft !== null && (
              <strong>
                {spotsLeft > 0 ? `${spotsLeft} disponibles` : "Lista llena"}
              </strong>
            )}
          </div>
          {authUser ? (
            <>
              <button
                className={isMember ? "secondary-button" : "primary-button"}
                type="button"
                onClick={isMember ? leaveCurrentPlan : joinCurrentPlan}
                disabled={
                  isHost ||
                  isPending ||
                  flowStatus === "joining-plan" ||
                  flowStatus === "leaving-plan"
                }
              >
                {flowStatus === "joining-plan" || flowStatus === "leaving-plan"
                  ? "Actualizando..."
                  : actionText}
              </button>
              <p className="plan-web-user-note">
                Sesión iniciada como <strong>{authUser.email}</strong>
              </p>
              <button
                className="text-button plan-logout-button"
                type="button"
                onClick={onLogout}
              >
                Cerrar sesión
              </button>
            </>
          ) : (
            <>
              <button
                className="primary-button"
                type="button"
                onClick={() => setView("register")}
              >
                Registrarme para unirme
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setView("login")}
              >
                Iniciar sesión
              </button>
            </>
          )}
          {planJoinMessage && (
            <p
              className={`status-note ${flowStatus === "plan-join-error" ? "error-note" : "success-note"}`}
            >
              {planJoinMessage}
            </p>
          )}
          {inviteStatus === "loading" && <div className="plan-web-skeleton" />}
        </aside>
      </section>

      <section className="plan-web-content">
        {!authUser && (view === "register" || view === "login") && (
          <div className="plan-web-mobile-auth">
            <PlanAuthPanel
              view={view}
              setView={setView}
              errors={errors}
              registerForm={registerForm}
              loginForm={loginForm}
              onRegisterFieldChange={onRegisterFieldChange}
              onLoginFieldChange={onLoginFieldChange}
              onRegisterSubmit={onRegisterSubmit}
              onLoginSubmit={onLoginSubmit}
              flowStatus={flowStatus}
            />
          </div>
        )}

        <div className="plan-web-main">
          <PlanSection icon="⏱" title="Fecha y hora">
            <div className="plan-web-timeline">
              <div>
                <span>COMIENZA</span>
                <strong>{formatPlanDate(invite.date, invite.time)}</strong>
              </div>
              <div>
                <span>TERMINA</span>
                <strong>
                  {formatPlanDate(invite.endDate, invite.endTime)}
                </strong>
              </div>
            </div>
          </PlanSection>

          <PlanSection icon="📍" title="Ubicación">
            <div className="plan-web-map-card">
              <div className="fake-map premium" aria-hidden="true">
                <span className="map-pin" />
              </div>
              <div>
                <strong>{invite.address || "Ubicación por confirmar"}</strong>
                <a
                  className="map-link"
                  href={mapUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ir
                </a>
              </div>
            </div>
          </PlanSection>

          <PlanSection icon="✦" title="Descripción">
            <div className="plan-web-description">
              {invite.description ||
                "Este plan no tiene descripción adicional."}
            </div>
          </PlanSection>

          <PlanSection
            icon="ðŸ‘¥"
            title="Asistentes"
            action={
              attendees.length > 5 ? (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setAttendeesOpen(true)}
                >
                  Ver todos
                </button>
              ) : null
            }
          >
            <div className="plan-web-attendees">
              {attendees.slice(0, 8).map((user) => (
                <div className="plan-web-attendee" key={user.id || user.nombre}>
                  <UserAvatar user={user} />
                  <span>{user.nombre}</span>
                </div>
              ))}
              {!attendees.length && (
                <p className="empty-attendees">
                  Aún no hay asistentes a este plan.
                </p>
              )}
            </div>
          </PlanSection>
        </div>

        <aside className="plan-web-side">
          {!authUser && (view === "register" || view === "login") && (
            <div className="plan-web-desktop-auth">
              <PlanAuthPanel
                view={view}
                setView={setView}
                errors={errors}
                registerForm={registerForm}
                loginForm={loginForm}
                onRegisterFieldChange={onRegisterFieldChange}
                onLoginFieldChange={onLoginFieldChange}
                onRegisterSubmit={onRegisterSubmit}
                onLoginSubmit={onLoginSubmit}
                flowStatus={flowStatus}
              />
            </div>
          )}
          <div className="plan-web-mini-card">
            <span>Estado</span>
            <strong>{invite.status || "Activo"}</strong>
            <p>{invite.requests || 0} solicitudes pendientes</p>
          </div>
        </aside>
      </section>

      {attendeesOpen && (
        <div className="plan-modal-backdrop" role="presentation">
          <section
            className="plan-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Asistentes"
          >
            <div className="plan-modal-head">
              <strong>Asistentes</strong>
              <button
                className="round-icon-button"
                type="button"
                onClick={() => setAttendeesOpen(false)}
              >
                ?
              </button>
            </div>
            <input
              className="plan-search-input"
              placeholder="Buscar..."
              value={attendeeSearch}
              onChange={(event) => setAttendeeSearch(event.target.value)}
            />
            <div className="plan-modal-list">
              {visibleAttendees.map((user) => (
                <div className="plan-modal-user" key={user.id || user.nombre}>
                  <UserAvatar user={user} />
                  <span>{user.nombre}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function validateRegisterForm(form) {
  const errors = {};
  const telefonoLimpio = form.telefono.replace(/\D/g, "");
  if (form.nombre.trim().length < 2) errors.nombre = "Escribe tu nombre.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = "Usa un email válido.";
  }
  if (telefonoLimpio.length !== 10) {
    errors.telefono = "Incluye un teléfono de 10 dígitos.";
  }
  if (form.password.length < 6) {
    errors.password = "La contraseña debe tener al menos 6 caracteres.";
  }
  return errors;
}

function validateLoginForm(form) {
  const errors = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = "Usa un email válido.";
  }
  if (form.password.length < 6) {
    errors.password = "Ingresa tu contraseña.";
  }
  return errors;
}

function validateGuestForm(form) {
  const errors = {};
  if (form.nombre.trim().length < 2) errors.nombre = "Escribe tu nombre.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = "Usa un email válido para enviar tu boleto.";
  }
  if (form.telefono && form.telefono.replace(/\D/g, "").length < 10) {
    errors.telefono = "Incluye un teléfono válido o deja el campo vacío.";
  }
  return errors;
}

async function postJson(endpoint, payload) {
  if (!endpoint) return null;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const errorPayload = await response.json();
      message = errorPayload?.message || message;
    } catch {
      // Keep the generic status error if the backend did not return JSON.
    }
    throw new Error(message);
  }

  return response.json();
}

async function signInWithFirebasePassword(email, password) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    },
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || "No se pudo iniciar sesión.");
  }

  return payload;
}

async function signUpWithFirebasePassword(email, password) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    },
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || "No se pudo crear la cuenta.");
  }

  return payload;
}

function App() {
  const isComingSoonView =
    window.location.pathname === "/" && window.location.search === "";
  const [context] = useState(getInviteContext);
  const [invite, setInvite] = useState(() => fallbackInvite(context));
  const [inviteStatus, setInviteStatus] = useState(
    context.id ? "loading" : "missing",
  );
  const [view, setView] = useState("landing");
  const [registerForm, setRegisterForm] = useState(initialForm);
  const [loginForm, setLoginForm] = useState(initialLoginForm);
  const [guestForm, setGuestForm] = useState(initialGuestForm);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [errors, setErrors] = useState({});
  const [planJoinMessage, setPlanJoinMessage] = useState("");
  const [authUser, setAuthUser] = useState(() => {
    const cached = sessionStorage.getItem("pulExpressUser");
    return cached ? JSON.parse(cached) : null;
  });
  const [flowStatus, setFlowStatus] = useState(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("payment") !== "success") return "idle";
    return context.kind === "event" ? "event-paid" : "paid";
  });
  const [appPrompt, setAppPrompt] = useState(() =>
    context.id && isMobileBrowser() ? "opening" : "fallback",
  );

  const userDataComplete = {
    id: "",
    idStripe: "",
    email: "",
    nombre: "",
    apellidos: "",
    fechaNacimiento: "",
    edad: 0,
    telefono: 0,
    actividad: "",
    situacionSentimental: "",
    bebidaFavorita: "",
    comidaFavorita: "",
    universidad: "",
    direccion: "",
    lugarFavorito: "",
    genero: "",
    gustos: {},
    cartera: [],
    amigos: [],
    intereses: [],
    salir: [],
    hacerAmigos: [],
    tenerCitas: [],
    econtrarQueHacer: false,
    viewInteractionInfo: true,
    viewQrInfo: true,
    images: [],
    imagen: "",
    zona: "PUEBLA",
    estatus: true,
    estado: "",
    distancia: "",
    profesion: "",
    perfilPublico: "",
    ubicacion: "",
    descripcion: "",
    tooltips: {
      qr: false,
      pulers: false,
      ayuda: false,
      crearPlan: false,
      credito: false,
      division: false,
      invitados: false,
      unirseAPlan: false,
    },
    nombreBusqueda: [],
    method: "",
    createdAt: null,
  };

  useEffect(() => {
    console.info(`${DEBUG_PREFIX} Estado de invitacion`, {
      context,
      inviteStatus,
      invite,
    });
  }, [context, invite, inviteStatus]);

  useEffect(() => {
    if (!context.id) {
      console.warn(`${DEBUG_PREFIX} No hay ID en la URL`, context);
      return;
    }

    let ignore = false;
    fetchInvite(context)
      .then((data) => {
        if (ignore) return;
        console.info(`${DEBUG_PREFIX} Invitacion lista para render`, data);
        setInvite(data);
        setInviteStatus("ready");
      })
      .catch((error) => {
        if (ignore) return;
        console.error(`${DEBUG_PREFIX} Usando fallback por error al cargar`, {
          context,
          error,
        });
        setInvite(fallbackInvite(context));
        setInviteStatus("fallback");
      });

    return () => {
      ignore = true;
    };
  }, [context]);

  useEffect(() => {
    if (!context.id || context.kind !== "plan") return;

    const intervalId = window.setInterval(() => {
      fetchInvite(context)
        .then((data) => {
          setInvite(data);
          setInviteStatus("ready");
        })
        .catch((error) => {
          console.warn(`${DEBUG_PREFIX} No se pudo refrescar el plan`, error);
        });
    }, 12000);

    return () => window.clearInterval(intervalId);
  }, [context]);

  useEffect(() => {
    if (!context.id || !isMobileBrowser() || inviteStatus === "loading") return;

    const timeoutId = window.setTimeout(() => {
      attemptOpenApp(invite);
    }, 450);

    const fallbackId = window.setTimeout(() => {
      if (!document.hidden && document.hasFocus()) setAppPrompt("fallback");
    }, 1800);

    const markAsOpened = () => {
      setAppPrompt("opened");
    };

    const onVisibilityChange = () => {
      if (document.hidden) markAsOpened();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", markAsOpened);
    window.addEventListener("pagehide", markAsOpened);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearTimeout(fallbackId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", markAsOpened);
      window.removeEventListener("pagehide", markAsOpened);
    };
  }, [context.id, invite, inviteStatus]);

  const isReserva = invite.kind === "reserva";
  const isEventDetail = invite.kind === "eventDetail";
  const usesReservaLayout = isReserva || isEventDetail;
  const isEvent = invite.kind === "event";
  const isPlan = invite.kind === "plan";
  const purchasableItems = isEvent ? [...invite.tickets, ...invite.tables] : [];
  const selectedItem =
    purchasableItems.find((item) => item.id === selectedItemId) ||
    purchasableItems[0];
  const guestTotal = selectedItem ? selectedItem.price * quantity : 0;
  const spotsLeft =
    invite.capacity > 0 ? Math.max(invite.capacity - invite.members, 0) : null;
  const heroImage = invite.image || invite.hostImage;
  const displayTags = [
    ...new Set(
      [
        ...(Array.isArray(invite.tags) ? invite.tags : []),
        isEvent
          ? "Evento"
          : isEventDetail
            ? "Detalle de evento"
            : isReserva
              ? "Reservacion"
              : "Plan",
        isPlan ? formatPlanVisibility(invite.visibility) : invite.host,
      ]
        .filter(Boolean)
        .map((tag) => String(tag).replace(/^#/, "")),
    ),
  ].slice(0, 4);

  if (isComingSoonView) {
    return (
      <main className="coming-soon-shell">
        <div className="coming-bg" />

        <div className="coming-card">
          <div className="logo-wrapper">
            <img src={logo} alt="Pul" className="coming-soon-logo" />
          </div>

          <div className="badge-live">
            <span className="dot-live" />
            Próximamente
          </div>

          <h1 className="coming-title">
            Estamos preparando algo <span>increíble</span>
          </h1>

          <p className="coming-description">
            Muy pronto podrás descubrir nuevas experiencias, eventos,
            reservaciones y planes compartidos con Pul.
          </p>

          <div className="coming-actions">
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noreferrer"
              className="store-btn"
            >
              App Store
            </a>

            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noreferrer"
              className="store-btn primary"
            >
              Google Play
            </a>
          </div>

          <div className="coming-footer">
            <div className="pulse-circle" />
            <span>Pul ? 2026</span>
          </div>
        </div>
      </main>
    );
  }

  const onRegisterFieldChange = (event) => {
    const { name, value } = event.target;
    setRegisterForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const onLoginFieldChange = (event) => {
    const { name, value } = event.target;
    setLoginForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const onGuestFieldChange = (event) => {
    const { name, value } = event.target;
    setGuestForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const validatePhone = async (telefono) => {
    const response = await fetch(`${BACKEND_URL}/users/validate-phone`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        telefono,
      }),
    });

    return await response.json();
  };

  const createStripeCustomer = async ({ name, email, phone }) => {
    try {
      const response = await fetch(`${BACKEND_URL}/stripe/create-customer`, {
        method: "POST",
        headers: {
          Accept: "*/*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description: `Cliente pul: ${name}`,
          email,
          name,
          phone,
        }),
      });

      const { info } = await response.json();

      return info.id;
    } catch (error) {
      console.error(error);
      return null;
    }
  };

  const registerUser = async (uid, data) => {
    const response = await fetch(`${BACKEND_URL}/users/register-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uid,
        data,
      }),
    });

    return await response.json();
  };

  const completeAuth = async (user) => {
    sessionStorage.setItem("pulExpressUser", JSON.stringify(user));

    setAuthUser(user);

    setFlowStatus("authenticated");

    setView(isReserva ? "payment" : isEvent ? "event-checkout" : "landing");

    setPlanJoinMessage("");
  };

  const onRegisterSubmit = async (event) => {
    event.preventDefault();

    const nextErrors = validateRegisterForm(registerForm);

    console.log(nextErrors);

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    try {
      const phoneValidation = await validatePhone(registerForm.telefono.trim());

      if (phoneValidation.exists) {
        setErrors({
          form: "Este teléfono ya está registrado.",
        });

        return;
      }

      setFlowStatus("registering");

      const firebaseUser = await signUpWithFirebasePassword(
        registerForm.email.trim().toLowerCase(),
        registerForm.password,
      );

      // CREAR CUSTOMER STRIPE
      const idStripe = await createStripeCustomer({
        name: registerForm.nombre.trim(),
        email: firebaseUser.email || registerForm.email.trim(),
        phone: registerForm.telefono.trim(),
      });

      // OBJETO USUARIO
      const userData = {
        ...userDataComplete,
        id: firebaseUser.localId,
        idStripe,
        nombre: registerForm.nombre.trim(),
        email: firebaseUser.email || registerForm.email.trim().toLowerCase(),
        telefono: registerForm.telefono.trim(),
        method: "express-register",
        createdAt: new Date().toISOString(),
        nombreBusqueda: [registerForm.nombre.trim()],
      };

      console.log(userData);

      await registerUser(userData.id, userData);

      // FIRESTORE + LOGIN
      const firebaseUserLogin = await signInWithFirebasePassword(
        registerForm.email.trim().toLowerCase(),
        registerForm.password,
      );
      completeAuth({
        id: firebaseUserLogin.localId,
        uid: firebaseUserLogin.localId,
        idToken: firebaseUserLogin.idToken,
        nombre: firebaseUserLogin.displayName || loginForm.email.split("@")[0],
        email: firebaseUserLogin.email || loginForm.email.trim(),
        method: "web-login",
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      setFlowStatus("register-error");

      const message =
        error.message === "EMAIL_EXISTS"
          ? "Este email ya está registrado. Inicia sesión para continuar."
          : error.message || "No se pudo crear la cuenta.";

      setErrors({ form: message });
    }
  };

  const onLoginSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validateLoginForm(loginForm);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setFlowStatus("logging-in");
    try {
      const firebaseUser = await signInWithFirebasePassword(
        loginForm.email.trim(),
        loginForm.password,
      );
      completeAuth({
        id: firebaseUser.localId,
        uid: firebaseUser.localId,
        idToken: firebaseUser.idToken,
        nombre: firebaseUser.displayName || loginForm.email.split("@")[0],
        email: firebaseUser.email || loginForm.email.trim(),
        method: "web-login",
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      setFlowStatus("login-error");
      setErrors({ form: error.message || "No se pudo iniciar sesión." });
    }
  };

  const openLoginInApp = () => {
    attemptOpenApp(invite, "express-login");
  };

  const sendTicketEmail = async (purchase) => {
    await postJson(EMAIL_CONFIRMATION_ENDPOINT, {
      to: purchase.buyer.email,
      template: "event-ticket-confirmation",
      purchase,
    });
  };

  const joinCurrentPlan = async () => {
    if (!authUser || !invite.id || !isPlan) {
      setView("login");
      return;
    }

    setFlowStatus("joining-plan");
    setPlanJoinMessage("");
    try {
      const result = await postJson(PLAN_JOIN_ENDPOINT, {
        planId: invite.id,
        user: authUser,
      });
      const nextMessage =
        result?.message || "Listo, actualizamos tu participación en el plan.";
      setPlanJoinMessage(nextMessage);
      setFlowStatus(
        result?.status === "requested" ? "plan-requested" : "plan-joined",
      );
      if (result?.status === "joined") {
        const nextUser = normalizeUserSummary(authUser);
        setInvite((current) => ({
          ...current,
          members: Number(current.members || 0) + 1,
          integrantesIds: [
            ...new Set([
              ...(current.integrantesIds || []),
              getUserId(authUser),
            ]),
          ],
          attendees: [...(current.attendees || []), nextUser],
        }));
      }
      if (result?.status === "requested") {
        setInvite((current) => ({
          ...current,
          requests: Number(current.requests || 0) + 1,
          solicitudesIds: [
            ...new Set([
              ...(current.solicitudesIds || []),
              getUserId(authUser),
            ]),
          ],
        }));
      }
    } catch (error) {
      setPlanJoinMessage(
        error.message || "No se pudo completar la unión al plan.",
      );
      setFlowStatus("plan-join-error");
    }
  };

  const leaveCurrentPlan = async () => {
    if (!authUser || !invite.id || !isPlan) {
      setView("login");
      return;
    }

    setFlowStatus("leaving-plan");
    setPlanJoinMessage("");
    try {
      const result = await postJson(PLAN_LEAVE_ENDPOINT, {
        planId: invite.id,
        user: authUser,
      });
      setPlanJoinMessage(result?.message || "Te saliste del plan.");
      setFlowStatus("plan-left");
      const userId = getUserId(authUser);
      setInvite((current) => ({
        ...current,
        members: Math.max(Number(current.members || 1) - 1, 0),
        integrantesIds: (current.integrantesIds || []).filter(
          (id) => id !== userId,
        ),
        attendees: (current.attendees || []).filter(
          (user) => getUserId(user) !== userId,
        ),
      }));
    } catch (error) {
      setPlanJoinMessage(
        error.message || "No se pudo salir del plan. Intenta de nuevo.",
      );
      setFlowStatus("plan-join-error");
    }
  };

  const completeGuestPurchase = async (buyer) => {
    if (!selectedItem) {
      setFlowStatus("purchase-error");
      return;
    }

    setFlowStatus("purchasing");
    const purchaseId =
      `web-${invite.id}-${selectedItem.id}-${buyer.email}`.replace(
        /[^a-zA-Z0-9_-]/g,
        "-",
      );
    const purchase = {
      id: purchaseId,
      eventId: invite.id,
      eventName: invite.title,
      item: selectedItem,
      quantity,
      total: guestTotal,
      buyer,
      qrPayload: JSON.stringify({
        eventId: invite.id,
        itemId: selectedItem.id,
        quantity,
        email: buyer.email,
      }),
      successUrl: `${window.location.origin}${window.location.pathname}?eventId=${invite.id}&payment=success`,
      cancelUrl: window.location.href,
    };

    try {
      const result = await postJson(
        EVENT_CHECKOUT_ENDPOINT || STRIPE_CHECKOUT_ENDPOINT,
        purchase,
      );
      if (result?.url) {
        window.location.assign(result.url);
        return;
      }

      await sendTicketEmail(purchase);
      sessionStorage.setItem(
        `pulEventPurchase:${invite.id}`,
        JSON.stringify(purchase),
      );
      setFlowStatus("event-paid");
    } catch {
      if (
        !EVENT_CHECKOUT_ENDPOINT &&
        !STRIPE_CHECKOUT_ENDPOINT &&
        !EMAIL_CONFIRMATION_ENDPOINT
      ) {
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        sessionStorage.setItem(
          `pulEventPurchase:${invite.id}`,
          JSON.stringify(purchase),
        );
        setFlowStatus("event-paid");
        return;
      }
      setFlowStatus("purchase-error");
    }
  };

  const buyAsGuest = async (event) => {
    event.preventDefault();
    const nextErrors = validateGuestForm(guestForm);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    await completeGuestPurchase({
      nombre: guestForm.nombre.trim(),
      email: guestForm.email.trim(),
      telefono: guestForm.telefono.trim(),
      method: "guest",
    });
  };

  const buyAsUser = async () => {
    if (!authUser) {
      setView("register");
      return;
    }

    await completeGuestPurchase({
      ...authUser,
      method: authUser.method || "authenticated-web",
    });
  };

  const acceptAndPay = async () => {
    if (!authUser || !isReserva) {
      setView("register");
      return;
    }

    setFlowStatus("paying");
    try {
      const result = await postJson(STRIPE_CHECKOUT_ENDPOINT, {
        reservaId: invite.id,
        amount: invite.amount,
        user: authUser,
        successUrl: `${window.location.origin}${window.location.pathname}?reservaId=${invite.id}&payment=success`,
        cancelUrl: window.location.href,
      });

      if (result?.url) {
        window.location.href = result.url;
        return;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 900));
      sessionStorage.setItem(
        `pulReservaPayment:${invite.id}`,
        JSON.stringify({ paidAt: new Date().toISOString(), user: authUser }),
      );
      setFlowStatus("paid");
    } catch {
      setFlowStatus("payment-error");
    }
  };

  const rejectInvitation = async () => {
    setFlowStatus("rejecting");
    try {
      await postJson(RESERVA_RESPONSE_ENDPOINT, {
        reservaId: invite.id,
        action: "reject",
        user: authUser,
      });
      sessionStorage.setItem(
        `pulReservaRejected:${invite.id}`,
        JSON.stringify({
          rejectedAt: new Date().toISOString(),
          user: authUser,
        }),
      );
      setFlowStatus("rejected");
    } catch {
      setFlowStatus("reject-error");
    }
  };

  const planSlots = [];

  if (isPlan) {
    return (
      <PlanWebView
        invite={invite}
        inviteStatus={inviteStatus}
        authUser={authUser}
        onLogout={() => {
          sessionStorage.removeItem("pulExpressUser");
          setAuthUser(null);
          setView("landing");
          setPlanJoinMessage("");
          setFlowStatus("idle");
        }}
        flowStatus={flowStatus}
        planJoinMessage={planJoinMessage}
        view={view}
        setView={setView}
        errors={errors}
        registerForm={registerForm}
        loginForm={loginForm}
        onRegisterFieldChange={onRegisterFieldChange}
        onLoginFieldChange={onLoginFieldChange}
        onRegisterSubmit={onRegisterSubmit}
        onLoginSubmit={onLoginSubmit}
        joinCurrentPlan={joinCurrentPlan}
        leaveCurrentPlan={leaveCurrentPlan}
        attemptOpenApp={attemptOpenApp}
      />
    );
  }

  return (
    <main
      className={`express-shell ${isPlan ? "plan-app-shell" : "media-invite-shell"}`}
    >
      <section className="hero-panel">
        {isPlan ? (
          <nav className="topbar plan-topbar" aria-label="Plan">
            <button
              className="round-icon-button"
              type="button"
              onClick={() => window.history.back()}
            >
              ?
            </button>
          </nav>
        ) : (
          <nav className="topbar" aria-label="Pul">
            <img src={logo} alt="Pul" className="brand-logo" />
            <button
              className="ghost-button compact"
              type="button"
              onClick={() => attemptOpenApp(invite, "manual-open")}
              disabled={!invite.id}
            >
              Abrir app
            </button>
          </nav>
        )}

        <div className="hero-grid">
          <article className="plan-summary" aria-live="polite">
            {isPlan ? (
              <>
                <div
                  className={`plan-hero-content ${heroImage ? "has-image" : ""}`}
                  style={
                    heroImage
                      ? {
                          backgroundImage: `linear-gradient(180deg, rgba(255, 70, 70, 0.08) 0%, rgba(82, 8, 37, 0.76) 100%), url(${heroImage})`,
                        }
                      : undefined
                  }
                >
                  <div className="plan-emoji-badge" aria-hidden="true">
                    {invite.emoji || "?"}
                  </div>
                  <div className="plan-kicker">
                    {displayTags.slice(0, 2).map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                    <span>
                      ?{" "}
                      {invite.address
                        ? invite.address.split(",")[0]
                        : "Ubicación por confirmar"}
                    </span>
                    <span>14 km</span>
                  </div>
                  <h1>{invite.title}</h1>
                  <span className="time-pill">? Mediodía</span>
                </div>

                <div className="plan-info-strip">
                  <div>
                    <span>?</span>
                    <strong>{formatInviteDate(invite)}</strong>
                  </div>
                  <div>
                    <span>?</span>
                    <strong>
                      {spotsLeft === null
                        ? "Lugares por confirmar"
                        : spotsLeft > 0
                          ? `Quedan ${spotsLeft} lugares`
                          : "Lista llena"}
                    </strong>
                  </div>
                </div>

                <section
                  className="participants-panel"
                  aria-label="Participantes"
                >
                  <div className="participants-heading">
                    <span>YA VAN {Math.max(invite.members || 1, 1)}</span>
                    <strong>{spotsLeft ?? 0} lugares libres</strong>
                  </div>
                  <div className="participant-grid">
                    {planSlots.map((slot) => {
                      const isHostSlot = slot === 0;
                      const isUserSlot = slot === 1;
                      const isLastSlot = slot === planSlots.length - 1;
                      return (
                        <div
                          className={`participant-slot ${isHostSlot ? "filled" : ""} ${isLastSlot ? "last" : ""}`}
                          key={slot}
                        >
                          <div className="slot-circle">
                            {isHostSlot ? (
                              invite.hostImage || heroImage ? (
                                <img
                                  src={invite.hostImage || heroImage}
                                  alt=""
                                />
                              ) : (
                                <span>
                                  {invite.host.slice(0, 1).toUpperCase()}
                                </span>
                              )
                            ) : isUserSlot || isLastSlot ? (
                              "+"
                            ) : null}
                          </div>
                          {isHostSlot && (
                            <small>
                              {invite.host.split(" ")[0]}
                              <b>HOST</b>
                            </small>
                          )}
                          {isUserSlot && <small>Tu lugar</small>}
                          {isLastSlot && <small>Último lugar</small>}
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="host-card">
                  <div className="host-avatar">
                    {invite.hostImage || heroImage ? (
                      <img src={invite.hostImage || heroImage} alt="" />
                    ) : (
                      invite.host.slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <div>
                    <strong>{invite.host}</strong>
                    <span>
                      Host ? {formatPlanVisibility(invite.visibility)}
                    </span>
                  </div>
                </section>

                <section className="plan-detail-section">
                  <h2>Sobre el plan</h2>
                  <p>{invite.description}</p>
                </section>

                <section className="plan-detail-section">
                  <h2>Dónde</h2>
                  <div className="location-card">
                    <div className="fake-map" aria-hidden="true">
                      <span className="map-pin">●</span>
                      <span className="google-label">Google</span>
                    </div>
                    <div>
                      <strong>
                        {invite.address || "Ubicación por confirmar"}
                      </strong>
                      <button
                        className="map-link"
                        type="button"
                        onClick={() => attemptOpenApp(invite, "location")}
                      >
                        ᐅ 14 km · Abrir ubicación
                      </button>
                    </div>
                  </div>
                </section>

                <div className="tag-row plan-tag-row" aria-label="Etiquetas">
                  {displayTags.slice(0, 4).map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div
                  className={`media-hero-content ${heroImage ? "has-image" : ""}`}
                  style={
                    heroImage
                      ? {
                          backgroundImage: `linear-gradient(180deg, rgba(255, 70, 70, 0.08) 0%, rgba(82, 8, 37, 0.76) 100%), url(${heroImage})`,
                        }
                      : undefined
                  }
                >
                  <p className="eyebrow">
                    {isEvent
                      ? "Evento compartido"
                      : isEventDetail
                        ? "Detalle de evento"
                        : isReserva
                          ? "Detalle de reserva"
                          : "Registro Express"}
                  </p>
                  <h1>{invite.title}</h1>
                </div>
                <p className="lead">{invite.description}</p>

                <div className="meta-grid">
                  <div>
                    <span>Cuándo</span>
                    <strong>{formatInviteDate(invite)}</strong>
                  </div>
                  <div>
                    <span>Dónde</span>
                    <strong>
                      {invite.address || "Ubicación por confirmar"}
                    </strong>
                  </div>
                  <div>
                    <span>{usesReservaLayout ? "Invita" : "Anfitrion"}</span>
                    <strong>{invite.host}</strong>
                  </div>
                  <div>
                    <span>
                      {isEvent
                        ? "Asistentes"
                        : isEventDetail
                          ? "Asistentes"
                          : isReserva
                            ? "Tu parte"
                            : "Lugares"}
                    </span>
                    <strong>
                      {isEvent
                        ? `${invite.members || 0}${invite.capacity ? ` / ${invite.capacity}` : ""}`
                        : isEventDetail
                          ? `${invite.members || 0}${invite.capacity ? ` / ${invite.capacity}` : ""}`
                          : isReserva
                            ? invite.amount > 0
                              ? formatCurrency(invite.amount)
                              : "Monto por confirmar"
                            : spotsLeft === null
                              ? "Por confirmar"
                              : spotsLeft > 0
                                ? `${spotsLeft} disponibles`
                                : "Lista llena"}
                    </strong>
                  </div>
                </div>
              </>
            )}

            {isReserva && (
              <div className="payment-summary" aria-label="Resumen de cuenta">
                <div>
                  <span>Total</span>
                  <strong>{formatCurrency(invite.total)}</strong>
                </div>
                <div>
                  <span>Subtotal</span>
                  <strong>{formatCurrency(invite.subtotal)}</strong>
                </div>
                <div>
                  <span>Servicio Stripe</span>
                  <strong>{formatCurrency(invite.fee)}</strong>
                </div>
                <div>
                  <span>Participantes</span>
                  <strong>{invite.participants || "Por confirmar"}</strong>
                </div>
              </div>
            )}

            {isEvent && (
              <div className="event-copy-grid">
                <div>
                  <span>Descripción</span>
                  <p>{invite.description}</p>
                </div>
                {invite.schedule && (
                  <div>
                    <span>Cronograma</span>
                    <p>{invite.schedule}</p>
                  </div>
                )}
                {invite.rules && (
                  <div>
                    <span>Reglas</span>
                    <p>{invite.rules}</p>
                  </div>
                )}
              </div>
            )}

            {displayTags.length > 0 && (
              <div className="tag-row" aria-label="Etiquetas">
                {displayTags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>
            )}

            {(!isPlan || authUser) && (
              <div className="cta-row">
                {isEvent ? (
                  <>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => setView("guest-checkout")}
                    >
                      Comprar boletos o mesas
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setView("login")}
                    >
                      Iniciar sesión
                    </button>
                  </>
                ) : isEventDetail ? (
                  <>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => attemptOpenApp(invite, "manual-open")}
                    >
                      Abrir evento en app
                    </button>
                  </>
                ) : isReserva ? (
                  <>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={acceptAndPay}
                    >
                      {authUser ? "Aceptar y pagar" : "Registrarme para pagar"}
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() =>
                        authUser ? rejectInvitation() : setView("login")
                      }
                    >
                      Rechazar invitación
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={joinCurrentPlan}
                      disabled={flowStatus === "joining-plan" || !invite.id}
                    >
                      {flowStatus === "joining-plan"
                        ? "Entrando al grupo..."
                        : `Entrar al grupo ? vamos ${Math.max(invite.members || 1, 1)}`}
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() =>
                        authUser ? openLoginInApp() : setView("register")
                      }
                    >
                      {authUser ? "Abrir en app" : "Registrarme"}
                    </button>
                  </>
                )}
              </div>
            )}

            {isPlan && authUser && (
              <p className="status-note">
                Sesión iniciada como <strong>{authUser.email}</strong>.
              </p>
            )}

            {planJoinMessage && (
              <p
                className={`status-note ${
                  flowStatus === "plan-join-error"
                    ? "error-note"
                    : "success-note"
                }`}
              >
                {planJoinMessage}
              </p>
            )}

            {appPrompt === "opening" && (
              <p className="status-note">
                Intentando abrir Pul automáticamente...
              </p>
            )}
            {inviteStatus === "fallback" && (
              <p className="status-note">
                No pudimos cargar el detalle completo, pero el enlace está
                listo.
              </p>
            )}
            {inviteStatus === "missing" && (
              <p className="status-note">
                Este enlace no incluye un identificador válido.
              </p>
            )}
          </article>

          <aside className="visual-panel" aria-label="Vista previa">
            {heroImage ? (
              <img src={heroImage} alt="" className="plan-image" />
            ) : (
              <div className="plan-monogram">PUL</div>
            )}
            <div className="floating-ticket">
              <span>
                {isEvent
                  ? "Evento ID"
                  : isEventDetail
                    ? "Detalle evento ID"
                    : isReserva
                      ? "Reserva ID"
                      : "Plan ID"}
              </span>
              <strong>{invite.id || "sin-id"}</strong>
            </div>
          </aside>
        </div>
      </section>

      <section className="action-panel">
        <div className="section-copy">
          <p className="eyebrow">
            {isEvent
              ? "Compra web"
              : isEventDetail
                ? "Detalle en app"
                : isReserva
                  ? "Pago seguro"
                  : "Fallback web"}
          </p>
          <h2>
            {flowStatus === "event-paid"
              ? "Compra confirmada"
              : flowStatus === "paid"
                ? "Participación confirmada"
                : view === "register"
                  ? "Crea tu cuenta en segundos"
                  : view === "login"
                    ? "Entra a tu cuenta"
                    : view === "guest-checkout" || view === "event-checkout"
                      ? "Selecciona tu compra"
                      : isEventDetail
                        ? "Abre el detalle en Pul"
                        : isReserva
                          ? "Acepta, paga o rechaza"
                          : isEvent
                            ? "Compra como invitado"
                            : "Continua como prefieras"}
          </h2>
          <p>
            {isEvent
              ? "Puedes comprar boletos o mesas sin iniciar sesion. Al finalizar, recibiras tu confirmacion y QR por correo electronico."
              : isEventDetail
                ? "Abre Pul para ver el detalle completo del evento en la app."
                : isReserva
                  ? "Si la app no se abre, puedes autenticarte aqui y completar tu parte de la cuenta con Stripe."
                  : "Si la app no se abre, puedes iniciar sesion o dejar tu registro express para continuar el flujo asociado a este plan."}
          </p>
        </div>

        {flowStatus === "event-paid" ? (
          <div className="confirmation-panel">
            <strong>Compra exitosa</strong>
            <p>
              Enviamos la confirmación al correo indicado con el detalle de la
              compra y el código QR del boleto. Descarga Pul para gestionar tus
              eventos.
            </p>
            <div className="store-row">
              <a href={APP_STORE_URL} target="_blank" rel="noreferrer">
                App Store
              </a>
              <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer">
                Google Play
              </a>
            </div>
          </div>
        ) : flowStatus === "paid" ? (
          <div className="confirmation-panel">
            <strong>Pago exitoso</strong>
            <p>
              Ya estás marcado como participante de esta división. Descarga Pul
              para ver el seguimiento, detalles del consumo y futuras
              invitaciones.
            </p>
            <div className="store-row">
              <a href={APP_STORE_URL} target="_blank" rel="noreferrer">
                App Store
              </a>
              <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer">
                Google Play
              </a>
            </div>
          </div>
        ) : flowStatus === "rejected" ? (
          <div className="confirmation-panel muted">
            <strong>Invitación rechazada</strong>
            <p>Registramos tu respuesta para esta división de cuenta.</p>
          </div>
        ) : isEvent &&
          (view === "guest-checkout" || view === "event-checkout") ? (
          <form className="event-checkout" onSubmit={buyAsGuest} noValidate>
            <div
              className="ticket-list"
              aria-label="Boletos y mesas disponibles"
            >
              {purchasableItems.length > 0 ? (
                purchasableItems.map((item) => (
                  <label
                    className={`ticket-option ${selectedItem?.id === item.id ? "selected" : ""}`}
                    key={`${item.type}-${item.id}`}
                  >
                    <input
                      type="radio"
                      name="purchaseItem"
                      value={item.id}
                      checked={selectedItem?.id === item.id}
                      onChange={() => setSelectedItemId(item.id)}
                    />
                    <span>{item.type === "table" ? "Mesa" : "Boleto"}</span>
                    <strong>{item.name}</strong>
                    {item.description && <p>{item.description}</p>}
                    <em>{formatCurrency(item.price)}</em>
                    <small>
                      {item.available > 0
                        ? `${item.available} disponibles`
                        : "Disponibilidad por confirmar"}
                    </small>
                  </label>
                ))
              ) : (
                <div className="empty-purchase">
                  <strong>Venta por confirmar</strong>
                  <p>
                    Este evento todavía no tiene boletos o mesas visibles para
                    compra web.
                  </p>
                </div>
              )}
            </div>

            <div className="guest-box">
              <div className="quantity-row">
                <span>Cantidad</span>
                <div>
                  <button
                    className="stepper-button"
                    type="button"
                    onClick={() =>
                      setQuantity((current) => Math.max(1, current - 1))
                    }
                  >
                    -
                  </button>
                  <strong>{quantity}</strong>
                  <button
                    className="stepper-button"
                    type="button"
                    onClick={() =>
                      setQuantity((current) => Math.min(10, current + 1))
                    }
                  >
                    +
                  </button>
                </div>
              </div>

              <label>
                <span>Nombre</span>
                <input
                  name="nombre"
                  type="text"
                  autoComplete="name"
                  value={guestForm.nombre}
                  onChange={onGuestFieldChange}
                  aria-invalid={Boolean(errors.nombre)}
                />
                {errors.nombre && <small>{errors.nombre}</small>}
              </label>
              <label>
                <span>Email para confirmación</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={guestForm.email}
                  onChange={onGuestFieldChange}
                  aria-invalid={Boolean(errors.email)}
                />
                {errors.email && <small>{errors.email}</small>}
              </label>
              <label>
                <span>Teléfono opcional</span>
                <input
                  name="telefono"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={guestForm.telefono}
                  onChange={onGuestFieldChange}
                  aria-invalid={Boolean(errors.telefono)}
                />
                {errors.telefono && <small>{errors.telefono}</small>}
              </label>

              <div className="checkout-total">
                <span>Total</span>
                <strong>{formatCurrency(guestTotal)}</strong>
              </div>

              <button
                className="primary-button"
                type="submit"
                disabled={!selectedItem || flowStatus === "purchasing"}
              >
                {flowStatus === "purchasing"
                  ? "Procesando compra..."
                  : "Comprar como invitado"}
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={buyAsUser}
                disabled={!selectedItem || flowStatus === "purchasing"}
              >
                Comprar con mi cuenta
              </button>
              {flowStatus === "purchase-error" && (
                <p className="status-note">
                  No se pudo completar la compra. Intenta de nuevo.
                </p>
              )}
            </div>
          </form>
        ) : view === "register" ? (
          <form className="express-form" onSubmit={onRegisterSubmit} noValidate>
            <label>
              <span>Nombre</span>
              <input
                name="nombre"
                type="text"
                autoComplete="name"
                value={registerForm.nombre}
                onChange={onRegisterFieldChange}
                aria-invalid={Boolean(errors.nombre)}
              />
              {errors.nombre && <small>{errors.nombre}</small>}
            </label>

            <label>
              <span>Email</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                value={registerForm.email}
                onChange={onRegisterFieldChange}
                aria-invalid={Boolean(errors.email)}
              />
              {errors.email && <small>{errors.email}</small>}
            </label>

            <label>
              <span>Teléfono</span>
              <input
                name="telefono"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={registerForm.telefono}
                onChange={onRegisterFieldChange}
                aria-invalid={Boolean(errors.telefono)}
              />
              {errors.telefono && <small>{errors.telefono}</small>}
            </label>

            <label>
              <span>Contraseña</span>
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                value={registerForm.password}
                onChange={onRegisterFieldChange}
                aria-invalid={Boolean(errors.password)}
              />
              {errors.password && <small>{errors.password}</small>}
            </label>

            {errors.form && (
              <p className="status-note error-note">{errors.form}</p>
            )}

            <div className="form-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={!invite.id || flowStatus === "registering"}
              >
                {flowStatus === "registering"
                  ? "Creando cuenta..."
                  : isEvent
                    ? "Continuar a compra"
                    : isReserva
                      ? "Continuar al pago"
                      : "Crear cuenta"}
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setView("landing")}
              >
                Volver
              </button>
            </div>
          </form>
        ) : view === "login" ? (
          <form
            className="express-form login-form"
            onSubmit={onLoginSubmit}
            noValidate
          >
            <label>
              <span>Email</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                value={loginForm.email}
                onChange={onLoginFieldChange}
                aria-invalid={Boolean(errors.email)}
              />
              {errors.email && <small>{errors.email}</small>}
            </label>
            <label>
              <span>Contraseña</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                value={loginForm.password}
                onChange={onLoginFieldChange}
                aria-invalid={Boolean(errors.password)}
              />
              {errors.password && <small>{errors.password}</small>}
            </label>
            {errors.form && (
              <p className="status-note error-note">{errors.form}</p>
            )}
            <div className="form-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={flowStatus === "logging-in"}
              >
                {flowStatus === "logging-in"
                  ? "Iniciando sesión..."
                  : "Continuar"}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setView("register")}
              >
                Registro express
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={openLoginInApp}
              >
                Abrir en app
              </button>
            </div>
          </form>
        ) : isReserva && authUser ? (
          <div className="payment-card">
            <div>
              <span>Autenticado como</span>
              <strong>{authUser.email}</strong>
            </div>
            <div>
              <span>Concepto</span>
              <strong>{invite.itemLabel}</strong>
            </div>
            <div>
              <span>Monto a pagar</span>
              <strong>
                {invite.amount > 0
                  ? formatCurrency(invite.amount)
                  : "Por confirmar"}
              </strong>
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={acceptAndPay}
              disabled={flowStatus === "paying"}
            >
              {flowStatus === "paying"
                ? "Conectando con Stripe..."
                : "Pagar con Stripe"}
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={rejectInvitation}
              disabled={flowStatus === "rejecting"}
            >
              Rechazar invitación
            </button>
            {flowStatus === "payment-error" && (
              <p className="status-note">
                No se pudo iniciar el pago. Intenta de nuevo.
              </p>
            )}
            {flowStatus === "reject-error" && (
              <p className="status-note">
                No se pudo registrar el rechazo. Intenta de nuevo.
              </p>
            )}
          </div>
        ) : isEventDetail ? (
          <div className="confirmation-panel muted">
            <strong>Detalle de evento</strong>
            <p>Abre Pul para ver este evento en la app.</p>
            <button
              className="primary-button"
              type="button"
              onClick={() => attemptOpenApp(invite, "manual-open")}
            >
              Abrir evento en app
            </button>
          </div>
        ) : isPlan && authUser ? (
          <div className="payment-card">
            <div>
              <span>Autenticado como</span>
              <strong>{authUser.email}</strong>
            </div>
            <div>
              <span>Plan</span>
              <strong>{invite.title}</strong>
            </div>
            <div>
              <span>Lugares</span>
              <strong>
                {spotsLeft === null
                  ? "Por confirmar"
                  : spotsLeft > 0
                    ? `${spotsLeft} disponibles`
                    : "Lista llena"}
              </strong>
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={joinCurrentPlan}
              disabled={flowStatus === "joining-plan" || !invite.id}
            >
              {flowStatus === "joining-plan"
                ? "Entrando al grupo..."
                : `Entrar al grupo ? vamos ${Math.max(invite.members || 1, 1)}`}
            </button>
            {planJoinMessage && (
              <p
                className={`status-note ${
                  flowStatus === "plan-join-error"
                    ? "error-note"
                    : "success-note"
                }`}
              >
                {planJoinMessage}
              </p>
            )}
          </div>
        ) : (
          <div className="choice-grid">
            <button
              className="choice-card"
              type="button"
              onClick={() => setView("login")}
            >
              <span>Ya tengo cuenta</span>
              <strong>Iniciar sesión</strong>
            </button>
            <button
              className="choice-card accent"
              type="button"
              onClick={() => setView(isEvent ? "guest-checkout" : "register")}
            >
              <span>{isEvent ? "Sin cuenta" : "Soy nuevo en Pul"}</span>
              <strong>{isEvent ? "Comprar invitado" : "Registrarme"}</strong>
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
