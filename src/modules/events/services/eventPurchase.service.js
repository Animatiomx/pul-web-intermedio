import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../../firebase";
import { getUserId } from "../../../shared/utils/users";

const CLAIM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CLAIM_LENGTH = 10;

function getRandomInt(max) {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return value[0] % max;
  }
  return Math.floor(Math.random() * max);
}

function generateTicketClaimCode() {
  return Array.from({ length: CLAIM_LENGTH }, () =>
    CLAIM_ALPHABET[getRandomInt(CLAIM_ALPHABET.length)],
  ).join("");
}

export async function generateUniqueTicketClaimCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateTicketClaimCode();
    const snap = await getDoc(doc(db, "ticketClaims", code));
    if (!snap.exists()) return code;
  }
  throw new Error("No se pudo generar un identificador único para el boleto.");
}

export function calculateEventPurchaseCuenta(baseAmount) {
  const subtotal = Number(baseAmount || 0);
  const comisionStripe = Number(
    (subtotal * 0.036 + (subtotal > 0 ? 3 : 0)).toFixed(2),
  );
  const total = Number((subtotal + comisionStripe).toFixed(2));

  return {
    subtotal,
    comisionStripe,
    total,
    cu: total,
    propina: 0,
    pagado: false,
  };
}

function eventCoordinates(event) {
  const coords = event?.coordenadas;
  if (Array.isArray(coords)) return coords;
  if (coords && typeof coords === "object") return [coords.lat, coords.lng];
  return [];
}

function buildEventSnapshot(event) {
  return {
    id: event.id,
    coordenadas: eventCoordinates(event),
    fotos: event.fotos || [],
    nombre: event.nombre || event.title || "",
    ubicacion: event.ubicacion || event.address || "",
    fechaString: event.fechaString || event.date || "",
    fechaStringFin: event.fechaStringFin || event.endDate || event.fechaString || "",
    horaInicio: event.horaInicio || event.time || "",
    horaFin: event.horaFin || event.endTime || "",
    fotoHome: event.fotoHome || event.image || "",
    idPerfil: event.idPerfil || "",
  };
}

function buildMember(buyer, fallbackId) {
  const id = getUserId(buyer) || fallbackId || "";
  return {
    id,
    nombre: buyer?.nombre || buyer?.displayName || buyer?.email || "",
    imagen: buyer?.imagen || buyer?.photoURL || "",
    pushToken: buyer?.pushToken || "",
    divider: false,
    pagado: "Pagado",
    joinType: buyer?.method === "guest" ? "guestCheckout" : "joinedBySelf",
    joinedBySelf: buyer?.method !== "guest",
    invitedByAdmin: false,
    joinedAt: new Date(),
  };
}

function getItemAmount(type, item, quantity) {
  const raw = item?.raw || item || {};
  if (type === "zona") return Number(item?.price ?? raw.costoMesa ?? 0);
  return Number(item?.price ?? raw.precio ?? 0) * Number(quantity || 1);
}

function getItemId(item) {
  const raw = item?.raw || item || {};
  return raw.id || raw.idAlternativo || raw.noMesa || item?.id || item?.name || "";
}

function getTicketPayload(item, quantity) {
  const raw = item?.raw || item || {};
  return {
    id: getItemId(item),
    nombre: item?.name || raw.nombre || "Boleto",
    descripcion: item?.description || raw.descripcion || "",
    precio: Number(item?.price ?? raw.precio ?? 0),
    disponibles: Number(item?.available ?? raw.disponibles ?? quantity ?? 0),
  };
}

function getMesaPayload(item) {
  const raw = item?.raw || item || {};
  return {
    ...raw,
    id: getItemId(item),
    nombre: item?.name || raw.nombre || `Mesa ${raw.noMesa || ""}`.trim(),
    costoMesa: Number(item?.price ?? raw.costoMesa ?? 0),
    ticketMesa: Number(item?.capacity ?? raw.ticketMesa ?? 1),
    disponible: item?.available === 0 ? false : raw.disponible,
  };
}

export function buildEventPurchaseDraft({
  event,
  buyer,
  type,
  quantity,
  item,
  purchaseId,
  ticketClaimCode = "",
  paymentIntentId = "",
}) {
  const now = new Date();
  const eventSnapshot = buildEventSnapshot(event);
  const normalizedQuantity =
    type === "zona"
      ? Number(item?.capacity ?? item?.ticketMesa ?? quantity ?? 1)
      : Number(quantity || 1);
  const member = buildMember(
    buyer,
    ticketClaimCode ? `guest-${ticketClaimCode}` : "",
  );
  const cuenta = calculateEventPurchaseCuenta(
    getItemAmount(type, item, normalizedQuantity),
  );
  const eventPurchase = {
    eventId: event.id,
    type,
    quantity: normalizedQuantity,
    event: eventSnapshot,
  };
  if (type === "ticket") eventPurchase.boleto = getTicketPayload(item, quantity);
  if (type === "zona") eventPurchase.mesa = getMesaPayload(item);

  return {
    id: purchaseId,
    sourceType: "event",
    status: "confirmado",
    setupStep: "payment",
    draftOwnerId: member.id,
    createdBy: member.id,
    createdAt: now,
    draftUpdatedAt: now,
    draftExpiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24),
    anfitrion: {
      id: member.id,
      nombre: member.nombre,
      imagen: member.imagen,
      pushToken: member.pushToken,
    },
    mesa:
      type === "zona"
        ? getMesaPayload(item)
        : {
            id: getItemId(item),
            zona: "ticket",
            nombre: item?.name || item?.nombre || "Ticket",
            consumominimo: 0,
            tipoReserva: "Ticket",
            mesas: [],
          },
    fecha: eventSnapshot.fechaString,
    hora: eventSnapshot.horaInicio,
    dateTime: new Date(`${eventSnapshot.fechaString} ${eventSnapshot.horaInicio}`),
    cuenta,
    cuentaPorCobrar: false,
    paymentRequestStatus: "complete",
    paymentRequests: [],
    pendingPaymentUserIds: [],
    paymentLocks: {},
    payers: [
      {
        fecha: now,
        id: member.id,
        nombre: member.nombre,
        imagen: member.imagen,
        monto: cuenta.total,
      },
    ],
    dividers: [],
    integrantes: [member],
    integrantesDivers: [member],
    integrantesIds: [member.id],
    movementCounterActive: false,
    evento: eventSnapshot,
    boleto: eventPurchase.boleto || {},
    zona: type === "zona" ? eventPurchase.mesa?.zona || "" : "",
    personas: normalizedQuantity,
    pagada: true,
    eventPurchase,
    idPagos: paymentIntentId ? [paymentIntentId] : [],
    ticketClaimCode,
    ticketClaimUsed: false,
    buyer: {
      id: getUserId(buyer) || "",
      nombre: buyer?.nombre || buyer?.displayName || "",
      email: buyer?.email || "",
      telefono: buyer?.telefono || "",
      method: buyer?.method || "",
    },
  };
}

export async function commitEventPurchase({
  event,
  buyer,
  type,
  quantity,
  item,
  ticketClaimCode = "",
  paymentIntentId = "",
}) {
  const eventId = event?.id;
  if (!eventId) throw new Error("No se pudo identificar el evento.");
  if (!item) throw new Error("Selecciona un boleto o mesa.");

  const purchaseRef = doc(collection(db, "eventosUsers"));
  const eventRef = doc(db, "eventos", eventId);
  const memberId =
    getUserId(buyer) || (ticketClaimCode ? `guest-${ticketClaimCode}` : "");
  const isGuestPurchase = buyer?.method === "guest";
  const shouldRegisterMember = Boolean(memberId && !isGuestPurchase);
  const eventMemberRef = shouldRegisterMember
    ? doc(db, "eventos", eventId, "integrantes", memberId)
    : null;
  const purchase = buildEventPurchaseDraft({
    event,
    buyer,
    type,
    quantity,
    item,
    purchaseId: purchaseRef.id,
    ticketClaimCode,
    paymentIntentId,
  });
  const claimRef = ticketClaimCode ? doc(db, "ticketClaims", ticketClaimCode) : null;

  await runTransaction(db, async (transaction) => {
    const eventSnap = await transaction.get(eventRef);
    const claimSnap = claimRef ? await transaction.get(claimRef) : null;
    const eventMemberSnap = eventMemberRef
      ? await transaction.get(eventMemberRef)
      : null;
    if (!eventSnap.exists()) throw new Error("El evento ya no existe.");
    if (claimSnap?.exists()) {
      throw new Error("El identificador de boleto ya existe. Intenta de nuevo.");
    }

    const eventData = eventSnap.data();
    const normalizedQuantity = Number(purchase.eventPurchase.quantity || 1);
    const currentEventParticipantIds = Array.isArray(eventData.integrantesIds)
      ? eventData.integrantesIds
      : [];
    const nextEventParticipantIds = shouldRegisterMember
      ? Array.from(
          new Set([...currentEventParticipantIds, memberId].filter(Boolean)),
        )
      : currentEventParticipantIds;

    if (type === "ticket") {
      const ticketId = getItemId(item);
      let foundTicket = false;
      const boletosTipo = (eventData.boletosTipo || []).map((ticket) => {
        if (ticket.id !== ticketId) return ticket;
        foundTicket = true;
        const available = Number(ticket.disponibles || 0);
        if (available < normalizedQuantity) {
          throw new Error("Ya no hay boletos suficientes.");
        }
        return { ...ticket, disponibles: available - normalizedQuantity };
      });
      if (!foundTicket) throw new Error("El boleto seleccionado ya no existe.");
      transaction.update(eventRef, { boletosTipo, updatedAt: serverTimestamp() });
    }

    if (type === "zona") {
      const mesaId = getItemId(item);
      let foundMesa = false;
      const mesas = (eventData.mesas || []).map((mesa) => {
        const sameMesa = mesa.id === mesaId || mesa.noMesa === mesaId;
        if (!sameMesa) return mesa;
        foundMesa = true;
        if (mesa.disponible === false) {
          throw new Error("Esta mesa ya no está disponible.");
        }
        return { ...mesa, disponible: false };
      });
      if (!foundMesa) throw new Error("La mesa seleccionada ya no existe.");
      transaction.update(eventRef, { mesas, updatedAt: serverTimestamp() });
    }

    if (shouldRegisterMember) {
      const currentIntegrantesCount = Number(
        eventData.integrantesCount ?? currentEventParticipantIds.length ?? 0,
      );
      transaction.update(eventRef, {
        integrantesIds: nextEventParticipantIds,
        integrantesCount: eventMemberSnap?.exists()
          ? currentIntegrantesCount
          : currentIntegrantesCount + 1,
        updatedAt: serverTimestamp(),
      });
    }

    transaction.set(purchaseRef, {
      ...purchase,
      updatedAt: serverTimestamp(),
    });

    if (claimRef) {
      transaction.set(claimRef, {
        code: ticketClaimCode,
        purchaseId: purchaseRef.id,
        eventId,
        buyerEmail: buyer?.email || "",
        used: false,
        createdAt: serverTimestamp(),
      });
    }

    if (eventMemberRef) {
      transaction.set(
        eventMemberRef,
        {
          ...purchase.integrantes[0],
          purchaseId: purchaseRef.id,
          eventId,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }
  });

  return purchase;
}

export async function redeemTicketClaimCode(code, user) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  const userId = getUserId(user);
  if (!normalizedCode || !userId) {
    throw new Error("No se pudo identificar el código o el usuario.");
  }

  const claimRef = doc(db, "ticketClaims", normalizedCode);

  await runTransaction(db, async (transaction) => {
    const claimSnap = await transaction.get(claimRef);
    if (!claimSnap.exists()) {
      throw new Error("El identificador no existe.");
    }

    const claim = claimSnap.data();
    if (claim.used) {
      throw new Error("Este identificador ya fue utilizado.");
    }
    if (!claim.purchaseId || !claim.eventId) {
      throw new Error("El identificador no pertenece a un boleto válido.");
    }

    const purchaseRef = doc(db, "eventosUsers", claim.purchaseId);
    const eventRef = doc(db, "eventos", claim.eventId);
    const eventMemberRef = doc(
      db,
      "eventos",
      claim.eventId,
      "integrantes",
      userId,
    );
    const purchaseSnap = await transaction.get(purchaseRef);
    const eventSnap = await transaction.get(eventRef);
    const eventMemberSnap = await transaction.get(eventMemberRef);
    if (!purchaseSnap.exists()) {
      throw new Error("El boleto asociado ya no existe.");
    }
    if (!eventSnap.exists()) {
      throw new Error("El evento asociado ya no existe.");
    }

    const purchase = purchaseSnap.data();
    if (purchase.ticketClaimUsed) {
      throw new Error("Este boleto ya fue asociado a una cuenta.");
    }

    const previousGuestId = `guest-${normalizedCode}`;
    const member = buildMember(user, userId);
    const replaceMember = (members = []) => {
      const next = members
        .filter((item) => item?.id && item.id !== previousGuestId && item.id !== userId)
        .concat(member);
      return next;
    };

    transaction.update(purchaseRef, {
      draftOwnerId: userId,
      createdBy: userId,
      anfitrion: {
        id: userId,
        nombre: member.nombre,
        imagen: member.imagen,
        pushToken: member.pushToken,
      },
      integrantes: replaceMember(purchase.integrantes || []),
      integrantesDivers: replaceMember(purchase.integrantesDivers || []),
      integrantesIds: [userId],
      buyer: {
        ...(purchase.buyer || {}),
        id: userId,
        nombre: member.nombre,
        email: user?.email || purchase.buyer?.email || "",
        method: "claimed",
      },
      ticketClaimUsed: true,
      ticketClaimUsedAt: serverTimestamp(),
      ticketClaimUsedBy: userId,
      updatedAt: serverTimestamp(),
    });
    transaction.update(claimRef, {
      used: true,
      usedAt: serverTimestamp(),
      usedBy: userId,
      updatedAt: serverTimestamp(),
    });
    const eventData = eventSnap.data();
    const currentEventParticipantIds = Array.isArray(eventData.integrantesIds)
      ? eventData.integrantesIds
      : [];
    const nextEventParticipantIds = Array.from(
      new Set(
        currentEventParticipantIds
          .filter((id) => id !== previousGuestId)
          .concat(userId),
      ),
    );
    const currentIntegrantesCount = Number(
      eventData.integrantesCount ?? currentEventParticipantIds.length ?? 0,
    );
    transaction.update(eventRef, {
      integrantesIds: nextEventParticipantIds,
      integrantesCount: eventMemberSnap.exists()
        ? currentIntegrantesCount
        : currentIntegrantesCount + 1,
      updatedAt: serverTimestamp(),
    });
    transaction.set(
      eventMemberRef,
      {
        ...buildMember(user, userId),
        claimCode: normalizedCode,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });
}
