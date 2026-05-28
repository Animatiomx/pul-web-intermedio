/**
 * Valida datos del registro express antes de llamar a Firebase y backend.
 */
export function validateRegisterForm(form) {
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

/**
 * Valida credenciales minimas del formulario de inicio de sesion.
 */
export function validateLoginForm(form) {
  const errors = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = "Usa un email válido.";
  }
  if (form.password.length < 6) {
    errors.password = "Ingresa tu contraseña.";
  }
  return errors;
}

/**
 * Valida comprador invitado para compras web de eventos.
 */
export function validateGuestForm(form) {
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
