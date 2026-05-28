/**
 * Formatea el rango de fecha y hora que se muestra en la invitacion.
 */
export function formatInviteDate(invite) {
  const date = [invite.date, invite.time].filter(Boolean).join(" · ");
  const end = [invite.endDate, invite.endTime].filter(Boolean).join(" · ");
  if (date && end) return `${date} a ${end}`;
  return date || "Fecha por confirmar";
}

/**
 * Formatea montos en pesos mexicanos.
 */
export function formatCurrency(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(amount);
}

/**
 * Traduce la visibilidad tecnica del plan a texto de producto.
 */
export function formatPlanVisibility(value) {
  const visibility = String(value || "publico").toLowerCase();
  if (visibility === "privado") return "Plan privado";
  if (visibility === "amigos") return "Solo amigos";
  return "Plan público";
}

/**
 * Formatea fechas especificas de plan para la vista detallada.
 */
export function formatPlanDate(dateString, timeString) {
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
