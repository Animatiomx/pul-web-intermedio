import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "../../../firebase";
import { getUserId } from "../../../shared/utils/users";

const PAYMENT_LOCK_TTL_MS = 1000 * 60 * 10;

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

function uniqueById(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export class ReservationConcurrencyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ReservationConcurrencyError";
    this.code = code;
  }
}

export function getReservationMemberIds(reservation = {}) {
  return [
    ...new Set(
      [
        ...(Array.isArray(reservation.integrantesIds)
          ? reservation.integrantesIds
          : []),
        ...(Array.isArray(reservation.integrantes)
          ? reservation.integrantes.map((member) => member?.id)
          : []),
      ].filter(Boolean),
    ),
  ];
}

export function getPendingPaymentRequest(reservation = {}, userId = "") {
  if (!reservation || !userId) {
    return null;
  }

  const request = (reservation.paymentRequests || []).find(
    (item) => item.id === userId && item.status === "pending",
  );
  if (request) return request;

  const dividersCurso = Array.isArray(reservation.dividersCurso)
    ? reservation.dividersCurso
    : [];
  if (!dividersCurso.includes(userId)) return null;

  const cuentaCurso = reservation.cuentaCurso || {};
  const monto = Number(
    cuentaCurso.cu || cuentaCurso.total || cuentaCurso.subtotal || 0,
  );
  if (monto <= 0) return null;

  const member = (reservation.integrantes || []).find(
    (item) => item?.id === userId,
  );

  return {
    id: userId,
    nombre: member?.nombre || "",
    imagen: member?.imagen || "",
    monto,
    status: "pending",
  };
}

export function shouldHideReservationForUser(reservation = {}, userId = "") {
  const status = reservation.status || "";
  if (!["cancelada", "curso", "finalizada"].includes(status)) return false;
  if (!userId) return false;
  return !getReservationMemberIds(reservation).includes(userId);
}

export async function joinReservationTransaction(reservationId, user) {
  const userId = getUserId(user);
  if (!reservationId || !userId) {
    throw new ReservationConcurrencyError(
      "missing",
      "No se pudo identificar la reservación o el usuario.",
    );
  }

  const reservationRef = doc(db, "reservaciones", reservationId);

  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(reservationRef);
    if (!snap.exists()) {
      throw new ReservationConcurrencyError(
        "missing",
        "La reservación ya no existe.",
      );
    }

    const reservation = { id: snap.id, ...snap.data() };
    if (["cancelada", "curso", "finalizada"].includes(reservation.status)) {
      throw new ReservationConcurrencyError(
        "closed",
        "La reservación ya no acepta integrantes.",
      );
    }

    const integrantes = uniqueById(reservation.integrantes || []);
    const integrantesIds = new Set([
      ...(reservation.integrantesIds || []),
      ...integrantes.map((member) => member.id),
    ]);

    if (integrantesIds.has(userId)) {
      throw new ReservationConcurrencyError(
        "already-member",
        "Ya formas parte de esta reservación.",
      );
    }

    const capacity = Number(reservation.noPersonas || 0);
    if (capacity > 0 && integrantesIds.size >= capacity) {
      throw new ReservationConcurrencyError(
        "full",
        "El cupo de esta reservación ya está lleno.",
      );
    }

    const newMember = {
      id: userId,
      nombre: user?.nombre || user?.email || "",
      imagen: user?.imagen || user?.photoURL || "",
      pushToken: user?.pushToken || "",
      divider: false,
      pagado: "",
      joinType: "joinedBySelf",
      joinedBySelf: true,
      invitedByAdmin: false,
      joinedAt: new Date(),
    };

    const nextIntegrantes = uniqueById([...integrantes, newMember]);
    const nextIntegrantesIds = nextIntegrantes.map((member) => member.id);

    transaction.update(reservationRef, {
      integrantes: nextIntegrantes,
      integrantesIds: nextIntegrantesIds,
      reviewers: [...new Set([...(reservation.reviewers || []), userId])],
      updatedAt: serverTimestamp(),
    });

    return { member: newMember, reservation };
  });
}

export async function beginReservationPayment(reservationId, userId) {
  if (!reservationId || !userId) {
    throw new ReservationConcurrencyError(
      "missing",
      "No se pudo identificar el pago.",
    );
  }

  const reservationRef = doc(db, "reservaciones", reservationId);
  const lockId = `${userId}-${Date.now()}`;
  const now = Date.now();
  const expiresAt = new Date(now + PAYMENT_LOCK_TTL_MS);

  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(reservationRef);
    if (!snap.exists()) {
      throw new ReservationConcurrencyError(
        "missing",
        "La reservación ya no existe.",
      );
    }

    const reservation = snap.data();
    const request = getPendingPaymentRequest(reservation, userId);
    const isCurso = reservation?.status === "curso";

    const pendingRequest = isCurso
      ? (reservation?.paymentRequests || []).find(
          (item) => item?.id === userId && item?.status === "pending",
        )
      : request;

    const payers = isCurso ? [] : reservation?.payers || [];

    const alreadyPaid = Boolean(
      !isCurso &&
      (request?.status === "paid" ||
        payers.some((payer) => payer.id === userId)),
    );

    if (!pendingRequest || alreadyPaid) {
      throw new ReservationConcurrencyError(
        "not-pending",
        "Este pago ya no está pendiente.",
      );
    }

    const paymentLocks = { ...(reservation.paymentLocks || {}) };
    const existingLock = paymentLocks[userId];
    if (existingLock && toMillis(existingLock.expiresAt) > now) {
      throw new ReservationConcurrencyError(
        "payment-locked",
        "Ya hay un pago en proceso para esta solicitud.",
      );
    }

    paymentLocks[userId] = {
      lockId,
      lockedAt: new Date(now),
      startedAt: new Date(now),
      expiresAt,
      monto: request.monto,
    };

    transaction.update(reservationRef, {
      paymentLocks,
      updatedAt: serverTimestamp(),
    });

    return { lockId, request };
  });
}

export async function releaseReservationPaymentLock(
  reservationId,
  userId,
  lockId,
) {
  if (!reservationId || !userId || !lockId) return;

  const reservationRef = doc(db, "reservaciones", reservationId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(reservationRef);
    if (!snap.exists()) return;

    const reservation = snap.data();
    const paymentLocks = { ...(reservation.paymentLocks || {}) };
    if (paymentLocks[userId]?.lockId !== lockId) return;

    delete paymentLocks[userId];
    transaction.update(reservationRef, {
      paymentLocks,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function completeReservationPayment({
  reservationId,
  userId,
  lockId,
  paymentIntentId = "",
  payer,
}) {
  if (!reservationId || !userId || !lockId) {
    throw new ReservationConcurrencyError(
      "missing",
      "No se pudo identificar el pago.",
    );
  }

  const reservationRef = doc(db, "reservaciones", reservationId);

  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(reservationRef);
    if (!snap.exists()) {
      throw new ReservationConcurrencyError(
        "missing",
        "La reservación ya no existe.",
      );
    }

    const reservation = snap.data();
    const paymentLocks = { ...(reservation.paymentLocks || {}) };
    const activeLock = paymentLocks[userId];
    if (activeLock?.lockId !== lockId) {
      throw new ReservationConcurrencyError(
        "payment-locked",
        "El pago ya fue actualizado desde otro dispositivo.",
      );
    }

    const nextDividersCurso = (reservation.dividersCurso || []).filter(
      (id) => id !== userId,
    );
    const paymentRequests = (reservation.paymentRequests || []).map(
      (request) =>
        request.id === userId
          ? {
              ...request,
              status: "paid",
              paidAt: new Date(),
            }
          : request,
    );
    const requestExists =
      paymentRequests.some((request) => request.id === userId) ||
      (reservation.dividersCurso || []).includes(userId);
    if (!requestExists) {
      throw new ReservationConcurrencyError(
        "not-pending",
        "La solicitud de pago ya no existe.",
      );
    }

    const payersCurso = uniqueById([
      ...(reservation.payersCurso || []).filter((item) => item.id !== userId),
      payer,
    ]);
    const payers = uniqueById([
      ...(reservation.payers || []).filter((item) => item.id !== userId),
      payer,
    ]);
    const integrantes = (reservation.integrantes || []).map((integrante) =>
      integrante.id === userId
        ? { ...integrante, pagado: "Pagado" }
        : integrante,
    );
    const integrantesDivers = (reservation.integrantesDivers || []).map(
      (integrante) =>
        integrante.id === userId
          ? { ...integrante, pagado: "Pagado" }
          : integrante,
    );
    const pendingPaymentUserIds = (
      reservation.pendingPaymentUserIds || []
    ).filter((id) => id !== userId);
    const allPaid =
      nextDividersCurso.length === 0 &&
      (!paymentRequests.length ||
        paymentRequests.every((request) => request.status !== "pending"));

    delete paymentLocks[userId];

    transaction.update(reservationRef, {
      paymentRequests,
      pendingPaymentUserIds,
      paymentRequestStatus: allPaid ? "complete" : "requested",
      payers,
      payersCurso,
      dividersCurso: nextDividersCurso,
      integrantes,
      integrantesDivers,
      dividers: (reservation.dividers || []).filter((id) => id !== userId),
      idPagos: paymentIntentId
        ? Array.from(new Set([...(reservation.idPagos || []), paymentIntentId]))
        : reservation.idPagos || [],
      paymentLocks,
      updatedAt: serverTimestamp(),
    });

    return { allPaid };
  });
}
