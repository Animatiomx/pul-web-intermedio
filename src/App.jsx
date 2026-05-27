import { useEffect, useState } from "react";
import logo from "./assets/logo.png";
import "./App.css";

const APP_DEEP_LINK_BASE =
  import.meta.env.VITE_APP_DEEP_LINK_BASE || "pul://registro-express";
const Reserva_DEEP_LINK_BASE =
  import.meta.env.VITE_Reserva_DEEP_LINK_BASE || "pul://reserva-cuenta";
const EVENT_DEEP_LINK_BASE =
  import.meta.env.VITE_EVENT_DEEP_LINK_BASE || "pul://evento-detalle";
const LOGIN_DEEP_LINK_BASE =
  import.meta.env.VITE_LOGIN_DEEP_LINK_BASE || "pul://login";
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
const Reserva_RESPONSE_ENDPOINT =
  import.meta.env.VITE_Reserva_RESPONSE_ENDPOINT || "";
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

function getInviteContext() {
  const url = new URL(window.location.href);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const explicitPlanId =
    url.searchParams.get("planId") ||
    url.searchParams.get("idPlan") ||
    (pathParts.includes("plan")
      ? pathParts[pathParts.indexOf("plan") + 1]
      : "");
  const explicitReservaId =
    url.searchParams.get("reservaId") ||
    url.searchParams.get("reservaId") ||
    url.searchParams.get("eventoUserId") ||
    url.searchParams.get("inviteId");
  const explicitEventId =
    url.searchParams.get("eventId") ||
    url.searchParams.get("eventoId") ||
    url.searchParams.get("idEvento");
  const planIndex = pathParts.findIndex((part) =>
    ["plan", "planes", "registro"].includes(part),
  );
  const reservaIndex = pathParts.findIndex((part) =>
    ["reserva", "cuenta", "split", "reservacion"].includes(part),
  );
  const eventIndex = pathParts.findIndex((part) =>
    ["evento", "eventos", "event", "events"].includes(part),
  );
  const typeParam =
    url.searchParams.get("type") || url.searchParams.get("tipo") || "";
  const normalizedType =
    typeParam === "evento" || pathParts.includes("evento")
      ? "evento"
      : typeParam === "reservacion" || pathParts.includes("reservacion")
        ? "reservacion"
        : "auto";

  console.info(`${DEBUG_PREFIX} URL recibida`, {
    href: url.href,
    pathname: url.pathname,
    search: url.search,
    pathParts,
    query: Object.fromEntries(url.searchParams.entries()),
    explicitPlanId,
    explicitReservaId,
    explicitEventId,
    planIndex,
    reservaIndex,
    eventIndex,
    normalizedType,
  });

  if (explicitReservaId || reservaIndex >= 0) {
    const context = {
      kind: "reserva",
      id:
        explicitReservaId || pathParts[reservaIndex + 1] || pathParts[0] || "",
      reservaType: normalizedType,
    };
    console.info(`${DEBUG_PREFIX} Contexto detectado`, context);
    return context;
  }

  if (explicitEventId || eventIndex >= 0) {
    const context = {
      kind: "event",
      id: explicitEventId || pathParts[eventIndex + 1] || pathParts[0] || "",
      reservaType: "auto",
    };
    console.info(`${DEBUG_PREFIX} Contexto detectado`, context);
    return context;
  }

  const context = {
    kind: "plan",
    id: explicitPlanId || pathParts[planIndex + 1] || pathParts[0] || "",
    reservaType: "auto",
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
  const miembros = Number(data.integrantesCount ?? integrantes.length ?? 0);

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
    host: data.anfitrion?.nombre || "Anfitrión Pul",
    hostId: data.anfitrion?.id || "",
    hostImage: data.anfitrion?.imagen || "",
    capacity: data.personas || 0,
    members: miembros,
    requests: Number(data.solicitudesCount ?? solicitudes.length ?? 0),
    visibility: data.visibilidad || "amigos",
    status: data.estatus || "",
    emoji: data.emoji || "⚽",
    tags: data.hashtags || data.tags || data.tendencias?.tags || [],
    image: data.linkedEntity?.image || data.anfitrion?.imagen || "",
    amount: null,
    total: null,
    subtotal: null,
    fee: null,
    participants: null,
    resourceType: "plan",
  };
}

function normalizeReserva(document, id, resourceType) {
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

function normalizeEvent(document, id) {
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
    kind: "event",
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
      resourceType: context.reservaType === "evento" ? "evento" : "reservacion",
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
    emoji: "⚽",
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

  if (context.kind === "plan") {
    const plan = normalizePlan(
      (await fetchPublicInviteDocument("planes", context.id)).data,
      context.id,
    );
    console.info(`${DEBUG_PREFIX} Plan normalizado`, plan);
    return plan;
  }

  const payload = await fetchPublicInviteDocument("reservaes", context.id, {
    type: context.reservaType,
  });
  const reserva = normalizeReserva(
    payload.data,
    context.id,
    payload.resourceType || context.reservaType,
  );
  console.info(`${DEBUG_PREFIX} Reserva normalizada`, reserva);
  return reserva;
}

function buildDeepLink(base, params) {
  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}

function isMobileBrowser() {
  return /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent);
}

function getDeepLinkBase(kind) {
  if (kind === "event") return EVENT_DEEP_LINK_BASE;
  return kind === "reserva" ? Reserva_DEEP_LINK_BASE : APP_DEEP_LINK_BASE;
}

function attemptOpenApp(invite, source = "auto") {
  if (!invite.id) return;

  const deepLink = buildDeepLink(getDeepLinkBase(invite.kind), {
    planId: invite.kind === "plan" ? invite.id : undefined,
    reservaId: invite.kind === "reserva" ? invite.id : undefined,
    eventId: invite.kind === "event" ? invite.id : undefined,
    id: invite.kind === "event" ? invite.id : undefined,
    type: invite.kind === "reserva" ? invite.resourceType : undefined,
    source,
  });

  window.location.href = deepLink;
}

function formatInviteDate(invite) {
  const date = [invite.date, invite.time].filter(Boolean).join(" · ");
  const end = [invite.endDate, invite.endTime].filter(Boolean).join(" · ");
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

function validateRegisterForm(form) {
  const errors = {};
  if (form.nombre.trim().length < 2) errors.nombre = "Escribe tu nombre.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = "Usa un email válido.";
  }
  if (form.telefono.replace(/\D/g, "").length < 10) {
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
    if (!context.id || !isMobileBrowser()) return;

    const timeoutId = window.setTimeout(() => {
      attemptOpenApp(invite);
    }, 450);

    const fallbackId = window.setTimeout(() => {
      if (!document.hidden) setAppPrompt("fallback");
    }, 1800);

    const onVisibilityChange = () => {
      if (document.hidden) setAppPrompt("opened");
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearTimeout(fallbackId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [context.id, invite]);

  const isReserva = invite.kind === "reserva";
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
        isEvent ? "Evento" : isReserva ? "Reservación" : "Plan",
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
            <span>Pul © 2026</span>
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

  const completeAuth = (user) => {
    sessionStorage.setItem("pulExpressUser", JSON.stringify(user));
    setAuthUser(user);
    setFlowStatus("authenticated");
    setView(isReserva ? "payment" : isEvent ? "event-checkout" : "landing");
    setPlanJoinMessage("");
  };

  const onRegisterSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validateRegisterForm(registerForm);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setFlowStatus("registering");
    try {
      const firebaseUser = await signUpWithFirebasePassword(
        registerForm.email.trim(),
        registerForm.password,
      );
      completeAuth({
        id: firebaseUser.localId,
        uid: firebaseUser.localId,
        idToken: firebaseUser.idToken,
        nombre: registerForm.nombre.trim(),
        email: firebaseUser.email || registerForm.email.trim(),
        telefono: registerForm.telefono.trim(),
        method: "express-register",
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
    if (!invite.id) return;
    window.location.href = buildDeepLink(LOGIN_DEEP_LINK_BASE, {
      planId: invite.kind === "plan" ? invite.id : undefined,
      reservaId: invite.kind === "reserva" ? invite.id : undefined,
      eventId: invite.kind === "event" ? invite.id : undefined,
      type: invite.kind === "reserva" ? invite.resourceType : undefined,
      source: "express-login",
    });
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
        setInvite((current) => ({
          ...current,
          members: Number(current.members || 0) + 1,
        }));
      }
      if (result?.status === "requested") {
        setInvite((current) => ({
          ...current,
          requests: Number(current.requests || 0) + 1,
        }));
      }
    } catch (error) {
      setPlanJoinMessage(
        error.message || "No se pudo completar la unión al plan.",
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
        type: invite.resourceType,
        amount: invite.amount,
        user: authUser,
        successUrl: `${window.location.origin}${window.location.pathname}?reservaId=${invite.id}&type=${invite.resourceType}&payment=success`,
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
      await postJson(Reserva_RESPONSE_ENDPOINT, {
        reservaId: invite.id,
        type: invite.resourceType,
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

  const planSlots = isPlan
    ? Array.from(
        { length: Math.max(invite.capacity || 10, 10) },
        (_, index) => index,
      )
    : [];

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
              ←
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
                    {invite.emoji || "⚽"}
                  </div>
                  <div className="plan-kicker">
                    {displayTags.slice(0, 2).map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                    <span>
                      ⌖{" "}
                      {invite.address
                        ? invite.address.split(",")[0]
                        : "Ubicación por confirmar"}
                    </span>
                    <span>14 km</span>
                  </div>
                  <h1>{invite.title}</h1>
                  <span className="time-pill">☼ Mediodía</span>
                </div>

                <div className="plan-info-strip">
                  <div>
                    <span>◷</span>
                    <strong>{formatInviteDate(invite)}</strong>
                  </div>
                  <div>
                    <span>♙</span>
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
                      Host · {formatPlanVisibility(invite.visibility)}
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
                    <span>{isReserva ? "Invita" : "Anfitrión"}</span>
                    <strong>{invite.host}</strong>
                  </div>
                  <div>
                    <span>
                      {isEvent
                        ? "Asistentes"
                        : isReserva
                          ? "Tu parte"
                          : "Lugares"}
                    </span>
                    <strong>
                      {isEvent
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
                        : `Entrar al grupo · vamos ${Math.max(invite.members || 1, 1)}`}
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
                {isEvent ? "Evento ID" : isReserva ? "División ID" : "Plan ID"}
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
                      : isReserva
                        ? "Acepta, paga o rechaza"
                        : isEvent
                          ? "Compra como invitado"
                          : "Continúa como prefieras"}
          </h2>
          <p>
            {isEvent
              ? "Puedes comprar boletos o mesas sin iniciar sesión. Al finalizar, recibirás tu confirmación y QR por correo electrónico."
              : isReserva
                ? "Si la app no se abre, puedes autenticarte aquí y completar tu parte de la cuenta con Stripe."
                : "Si la app no se abre, puedes iniciar sesión o dejar tu registro express para continuar el flujo asociado a este plan."}
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
                : `Entrar al grupo · vamos ${Math.max(invite.members || 1, 1)}`}
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
