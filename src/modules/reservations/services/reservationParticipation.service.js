import {
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
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
    ...new Set([
      ...(Array.isArray(reservation.integrantesIds)
        ? reservation.integrantesIds
        : []),
      ...(Array.isArray(reservation.integrantes)
        ? reservation.integrantes.map((member) => member?.id)
        : []),
    ].filter(Boolean)),
  ];
}

export function getPendingPaymentRequest(reservation = {}, userId = "") {
  if (!reservation || reservation.status !== "pending_payment" || !userId) {
    return null;
  }

  return (
    (reservation.paymentRequests || []).find(
      (request) => request.id === userId && request.status === "pending",
    ) || null
  );
}

export function shouldHideReservationForUser(reservation = {}, userId = "") {
  const status = reservation.status || "";
  if (status === "cancelada") return true;
  if (status !== "finalizada") return false;
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
    if (["cancelada", "finalizada"].includes(reservation.status)) {
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
      reviewers: [
        ...new Set([...(reservation.reviewers || []), userId]),
      ],
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
    const alreadyPaid = Boolean(
      request?.status === "paid" ||
        (reservation.payers || []).some((payer) => payer.id === userId),
    );

    if (!request || alreadyPaid) {
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
