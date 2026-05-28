import { useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import defaultAvatar from "../../../assets/default.png";
import logo from "../../../assets/logopul.png";
import {
  formatCurrency,
  formatInviteDate,
} from "../../../shared/utils/formatters";
import { getUserId, normalizeUserSummary } from "../../../shared/utils/users";
import {
  getPendingPaymentRequest,
  getReservationMemberIds,
} from "../../reservations/services/reservationParticipation.service";

function ReservationIcon({ name }) {
  const common = {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };
  const icons = {
    users: (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    calendar: (
      <svg {...common}>
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M3 10h18" />
      </svg>
    ),
    map: (
      <svg {...common}>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
    table: (
      <svg {...common}>
        <path d="M3 9h18" />
        <path d="M4 9v10" />
        <path d="M20 9v10" />
        <path d="M8 9V5h8v4" />
      </svg>
    ),
    plus: (
      <svg {...common}>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    ),
    user: (
      <svg {...common}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 22a8 8 0 0 1 16 0" />
      </svg>
    ),
  };

  return icons[name] || icons.users;
}

function AvatarStack({ users = [], total = 0 }) {
  const visible = users.slice(0, 5);
  const extra = Math.max(0, total - visible.length);

  return (
    <div className="mobile-avatar-stack">
      {visible.map((user) => (
        <span className="mobile-avatar" key={user.id || user.nombre}>
          <img src={user.imagen || defaultAvatar} alt="" />
        </span>
      ))}
      {extra > 0 && <span className="mobile-avatar more">+{extra}</span>}
    </div>
  );
}

function InfoRow({ icon, label, children, action }) {
  return (
    <div className="mobile-info-row">
      <span className="mobile-info-icon" aria-hidden="true">
        <ReservationIcon name={icon} />
      </span>
      <div className="mobile-info-copy">
        <span>{label}</span>
        <strong>{children}</strong>
      </div>
      {action}
    </div>
  );
}

function StatusNote({ message, flowStatus }) {
  if (!message) return null;
  const isError = String(flowStatus || "").includes("error");

  return (
    <p
      className={`status-note ${isError ? "error-note" : "success-note"}`}
    >
      {message}
    </p>
  );
}

function ReservationPaymentForm({
  amount,
  loading,
  authUser,
  onCancel,
  onConfirm,
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!stripe || !elements || loading) return;

    setError("");
    const result = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        payment_method_data: {
          billing_details: {
            name: authUser?.nombre || authUser?.displayName || "",
            email: authUser?.email || "",
          },
        },
      },
    });

    if (result.error) {
      setError(result.error.message || "El pago no se ha realizado.");
      return;
    }

    await onConfirm(result.paymentIntent);
  };

  return (
    <form className="reservation-payment-form" onSubmit={handleSubmit}>
      <PaymentElement
        options={{
          defaultValues: {
            billingDetails: {
              name: authUser?.nombre || authUser?.displayName || "",
              email: authUser?.email || "",
            },
          },
          fields: {
            billingDetails: {
              email: "never",
            },
          },
          layout: {
            type: "accordion",
            defaultCollapsed: false,
          },
        }}
      />
      {error && <p className="status-note error-note">{error}</p>}
      <div className="reservation-payment-actions">
        <button
          className="ghost-button compact"
          type="button"
          onClick={onCancel}
          disabled={loading}
        >
          Cancelar
        </button>
        <button
          className="primary-button compact"
          type="submit"
          disabled={!stripe || !elements || loading}
        >
          {loading ? "Confirmando..." : `Pagar ${formatCurrency(amount || 0)}`}
        </button>
      </div>
    </form>
  );
}

function ReservationPaymentModal({
  paymentSession,
  paymentLoading,
  authUser,
  onCancel,
  onConfirm,
}) {
  const stripePromise = useMemo(
    () =>
      paymentSession?.publishableKey
        ? loadStripe(paymentSession.publishableKey)
        : null,
    [paymentSession],
  );

  if (!paymentSession?.clientSecret || !stripePromise) return null;

  return (
    <div className="reservation-modal-backdrop" role="presentation">
      <section
        className="reservation-detail-modal reservation-payment-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Pagar reservación"
      >
        <div className="reservation-modal-head">
          <strong>Pagar reservación</strong>
          <button
            className="round-icon-button"
            type="button"
            onClick={onCancel}
            disabled={paymentLoading}
          >
            ×
          </button>
        </div>
        <div className="reservation-payment-user">
          <span>Cuenta Stripe</span>
          <strong>{authUser?.nombre || authUser?.email || "Usuario Pul"}</strong>
          {authUser?.email && <p>{authUser.email}</p>}
        </div>
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret: paymentSession.clientSecret,
            customerSessionClientSecret:
              paymentSession.customerSessionClientSecret,
            loader: "auto",
          }}
        >
          <ReservationPaymentForm
            amount={paymentSession.amount}
            loading={paymentLoading}
            authUser={authUser}
            onCancel={onCancel}
            onConfirm={onConfirm}
          />
        </Elements>
      </section>
    </div>
  );
}

function ReservationCapacityCounter({ memberCount, capacity, availableSpots }) {
  return (
    <div
      className="reservation-capacity-counter"
      aria-label="Cupo de la reserva"
    >
      <span>{memberCount}</span>
      <p>de {capacity || "?"} personas</p>
      {availableSpots !== null && (
        <strong>
          {availableSpots > 0 ? `${availableSpots} disponibles` : "Lista llena"}
        </strong>
      )}
    </div>
  );
}

function ReservationAuthPanel({
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
      <form
        className="reservation-auth-card reservation-auth-form-card"
        onSubmit={onRegisterSubmit}
        noValidate
      >
        <div className="reservation-auth-head">
          <span className="mobile-info-icon" aria-hidden="true">
            <ReservationIcon name="user" />
          </span>
          <div>
            <span>Registro rápido</span>
            <strong>Crea tu cuenta para continuar</strong>
          </div>
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

  if (view === "login") {
    return (
      <form
        className="reservation-auth-card reservation-auth-form-card"
        onSubmit={onLoginSubmit}
        noValidate
      >
        <div className="reservation-auth-head">
          <span className="mobile-info-icon" aria-hidden="true">
            <ReservationIcon name="user" />
          </span>
          <div>
            <span>Login rápido</span>
            <strong>Entra para continuar</strong>
          </div>
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
          {flowStatus === "logging-in"
            ? "Iniciando sesión..."
            : "Iniciar sesión"}
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

  return null;
}

function ReservationAuthPrompt({
  setView,
  memberCount,
  capacity,
  availableSpots,
}) {
  return (
    <section className="reservation-auth-card reservation-auth-choice">
      <ReservationCapacityCounter
        memberCount={memberCount}
        capacity={capacity}
        availableSpots={availableSpots}
      />
      <div className="reservation-auth-choice-body">
        <span className="mobile-info-icon" aria-hidden="true">
          <ReservationIcon name="user" />
        </span>
        <div>
          <span>Continúa con tu cuenta</span>
          <strong>Inicia sesión o regístrate</strong>
          <p>
            Necesitamos tu usuario para validar cupo y pagos en tiempo real.
          </p>
        </div>
      </div>
      <div className="reservation-session-actions">
        <button
          className="primary-button compact"
          type="button"
          onClick={() => setView("login")}
        >
          Iniciar sesión
        </button>
        <button
          className="ghost-button compact"
          type="button"
          onClick={() => setView("register")}
        >
          Registrarme
        </button>
      </div>
    </section>
  );
}

function getProductKey(product, index) {
  return (
    product?.id ||
    product?.idAlternativo ||
    `${product?.nombre || "producto"}-${index}`
  );
}

function ReservationProductCard({ product, onOpen }) {
  const quantity = Number(product?.cantidad || 1);
  const name = product?.nombre || "Producto";

  return (
    <button className="reservation-product-card" type="button" onClick={onOpen}>
      <span className="reservation-product-image-frame">
        <img src={product?.imagen || defaultAvatar} alt="" loading="lazy" />
      </span>
      <div>
        <strong>
          {quantity > 1 ? `${quantity} ` : ""}
          {name}
        </strong>
        <span>{formatCurrency(product?.precio || 0)}</span>
        {product?.comentario && <p>Nota: {product.comentario}</p>}
      </div>
    </button>
  );
}

function getAccountAmount(account, key) {
  return Number(account?.[key] ?? account?.cuenta?.[key] ?? 0);
}

function getReservationSummaryAccount(reservation) {
  const currentAccount = reservation.cuentaCurso || {};
  const generalAccount = reservation.cuenta || {};
  const currentTotal = getAccountAmount(currentAccount, "total");
  const generalTotal = getAccountAmount(generalAccount, "total");

  if (currentTotal > 0 || generalTotal <= 0) return currentAccount;
  return generalAccount;
}

function getMemberRole(member, reservation) {
  const memberId = member?.id || "";
  const payerIds = new Set(
    (reservation.payers || reservation.payersCurso || [])
      .map((payer) => payer?.id)
      .filter(Boolean),
  );

  if (member?.divider || member?.pagado === true || payerIds.has(memberId)) {
    return "payer";
  }

  return "guest";
}

export function ReservationPublicView({
  invite,
  authUser,
  individualAccount,
  setView,
  flowStatus,
  planJoinMessage,
  joinCurrentReservation,
  payPendingReservationRequest,
  reservationActionLoading,
  reservationPaymentSession,
  reservationPaymentLoading,
  cancelReservationPayment,
  confirmReservationPayment,
  attemptOpenApp,
  onLogout,
  view,
  errors,
  registerForm,
  loginForm,
  onRegisterFieldChange,
  onLoginFieldChange,
  onRegisterSubmit,
  onLoginSubmit,
}) {
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [mesaDetailOpen, setMesaDetailOpen] = useState(false);
  const [accountMode, setAccountMode] = useState("general");
  const reservation = invite.raw || {};
  const venue = reservation.negocio || {};
  const account = getReservationSummaryAccount(reservation);
  const individualSummary =
    individualAccount?.cuenta || individualAccount || null;
  const mesa = reservation.mesa || {};
  const userId = getUserId(authUser);
  const memberIds = getReservationMemberIds(reservation);
  const members = (reservation.integrantes || [])
    .map((member) => ({
      ...normalizeUserSummary(member),
      role: getMemberRole(member, reservation),
    }))
    .sort((a, b) => {
      if (a.id === reservation.anfitrion?.id) return -1;
      if (b.id === reservation.anfitrion?.id) return 1;
      return (a.nombre || "").localeCompare(b.nombre || "");
    });
  const visibleMembers = members.slice(0, 20);
  const capacity = Number(reservation.noPersonas || invite.capacity || 0);
  const availableSpots =
    capacity > 0 ? Math.max(capacity - memberIds.length, 0) : null;
  const isMember = Boolean(userId && memberIds.includes(userId));
  const pendingPaymentRequest = getPendingPaymentRequest(reservation, userId);
  const mapQuery = encodeURIComponent(venue.direccion || invite.address || "");
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
  const canJoin =
    Boolean(authUser && !isMember) &&
    !["cancelada", "finalizada"].includes(reservation.status || "") &&
    (availableSpots === null || availableSpots > 0);
  const hasMesa =
    Boolean(mesa && Object.keys(mesa).length > 0) &&
    Boolean(
      mesa.zona ||
      mesa.nombre ||
      mesa.noMesa ||
      mesa.tipoMesa ||
      mesa.consumominimo,
    );
  const hasVisibleMesa = hasMesa && mesa.zona !== "cover";
  const generalProducts = Array.isArray(reservation.productos)
    ? reservation.productos
    : Array.isArray(account.productos)
      ? account.productos
      : [];
  const individualProducts = Array.isArray(individualAccount?.productosPagados)
    ? individualAccount.productosPagados
    : Array.isArray(individualSummary?.productosPagados)
      ? individualSummary.productosPagados
      : [];
  const showingIndividual = accountMode === "individual" && individualSummary;
  const visibleProducts = showingIndividual
    ? individualProducts
    : generalProducts;
  const summaryAccount = showingIndividual ? individualSummary : account;

  return (
    <main className="mobile-detail-shell reservation-detail-shell">
      <nav className="plan-web-topbar">
        <button
          className="round-icon-button"
          type="button"
          onClick={() => window.location.assign("/")}
        >
          ←
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

      <section className="reservation-detail-grid">
        <div className="plan-web-media-column">
          <section className="reservation-venue-card">
            <div className="reservation-venue-image">
              <img src={venue.imagen || invite.image || defaultAvatar} alt="" />
            </div>
            <div className="reservation-venue-copy">
              <p className="eyebrow">Detalle de reservación</p>
              <h1>{venue.nombre || invite.title}</h1>
              <span>{venue.direccion || invite.address}</span>
            </div>
          </section>

          {Number(reservation.credito || 0) > 0 && (
            <section className="mobile-soft-card accent">
              <strong>
                Crédito a favor {formatCurrency(reservation.credito)}
              </strong>
              <p>
                Este crédito es exclusivo para esta reservación. Si no lo
                utilizas, se perderá.
              </p>
            </section>
          )}
        </div>

        {authUser ? (
          <section className="reservation-auth-card reservation-auth-choice">
            {/* <img src={authUser.imagen || defaultAvatar} alt="" /> */}
            <ReservationCapacityCounter
              memberCount={memberIds.length}
              capacity={capacity}
              availableSpots={availableSpots}
            />
            <div className="reservation-current-user">
              <div>
                <span>Sesión iniciada como</span>
                <strong>
                  {authUser.nombre || authUser.displayName || "Usuario Pul"}
                </strong>
                <p>{authUser.email}</p>
              </div>
            </div>
            <button
              className="text-button reservation-logout-button"
              type="button"
              onClick={onLogout}
            >
              Cerrar sesión
            </button>
          </section>
        ) : (
          <ReservationAuthPrompt
            setView={setView}
            memberCount={memberIds.length}
            capacity={capacity}
            availableSpots={availableSpots}
          />
        )}

        {!authUser && (view === "login" || view === "register") && (
          <div className="reservation-auth-mobile-slot">
            <ReservationAuthPanel
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

        {pendingPaymentRequest && (
          <section className="mobile-payment-card">
            <div className="mobile-payment-head">
              <span aria-hidden="true">$</span>
              <div>
                <strong>Pago pendiente</strong>
                <p>Tienes una solicitud de pago para esta reservación.</p>
              </div>
            </div>
            <div className="mobile-total-row">
              <span>Debes pagar</span>
              <strong>{formatCurrency(pendingPaymentRequest.monto)}</strong>
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={payPendingReservationRequest}
              disabled={reservationActionLoading === "paying"}
            >
              {reservationActionLoading === "paying"
                ? "Abriendo pago..."
                : "Pagar ahora"}
            </button>
            <StatusNote message={planJoinMessage} flowStatus={flowStatus} />
          </section>
        )}

        <section
          className={`mobile-section reservation-members-section ${
            !authUser && (view === "login" || view === "register")
              ? "with-auth-panel"
              : ""
          }`}
        >
          <div className="mobile-section-head">
            <h2>Integrantes de la reservación</h2>
            <span>
              {memberIds.length}
              {capacity > 0 ? `/${capacity}` : ""} personas
            </span>
          </div>

          {canJoin && (
            <div className="reservation-join-card">
              <span aria-hidden="true">
                <ReservationIcon name="plus" />
              </span>
              <div>
                <strong>¿Quieres unirte?</strong>
                <p>
                  Puedes agregarte como integrante. El anfitrión también cuenta
                  dentro del cupo.
                </p>
                <em>
                  {availableSpots === null
                    ? "Cupo disponible"
                    : `${availableSpots} ${
                        availableSpots === 1
                          ? "lugar disponible"
                          : "lugares disponibles"
                      }`}
                </em>
              </div>
              <button
                className="primary-button compact"
                type="button"
                onClick={joinCurrentReservation}
                disabled={reservationActionLoading === "joining"}
              >
                {reservationActionLoading === "joining"
                  ? "Uniendo..."
                  : "Unirme"}
              </button>
            </div>
          )}
          {!pendingPaymentRequest && planJoinMessage && (
            <StatusNote message={planJoinMessage} flowStatus={flowStatus} />
          )}

          {!authUser && (
            <div className="reservation-join-card">
              <span aria-hidden="true">
                <ReservationIcon name="user" />
              </span>
              <div>
                <strong>Inicia sesión para unirte</strong>
                <p>
                  Necesitamos tu cuenta Pul para validar cupo en tiempo real.
                </p>
              </div>
              <button
                className="primary-button compact"
                type="button"
                onClick={() => setView("login")}
              >
                Entrar
              </button>
            </div>
          )}

          <div className="reservation-members-grid">
            {visibleMembers.map((member) => (
              <div className="reservation-member" key={member.id}>
                <img src={member.imagen || defaultAvatar} alt="" />
                <span>{member.nombre}</span>
                <em className={`reservation-member-badge ${member.role}`}>
                  {member.role === "payer" ? "Pagador" : "Invitado"}
                </em>
              </div>
            ))}
          </div>
          {members.length > visibleMembers.length && (
            <p className="mobile-muted">
              Mostrando 20 de {members.length} integrantes.
            </p>
          )}
        </section>

        {!authUser && (view === "login" || view === "register") && (
          <div className="reservation-auth-desktop-slot">
            <ReservationAuthPanel
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

        <section className="mobile-card-grid reservation-info-grid">
          <InfoRow icon="users" label="Personas">
            {capacity || "Por confirmar"}
            {mesa.zona ? ` · ${mesa.zona}` : ""}
          </InfoRow>
          <InfoRow icon="calendar" label="Fecha">
            {formatInviteDate(invite)}
          </InfoRow>
          <InfoRow
            icon="map"
            label="Ubicación"
            action={
              venue.direccion || invite.address ? (
                <a
                  className="mobile-map-button"
                  href={mapUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ReservationIcon name="map" />
                 Ver en mapa
                </a>
              ) : null
            }
          >
            {venue.direccion || invite.address || "Por confirmar"}
          </InfoRow>
          {hasVisibleMesa && (
            <InfoRow
              icon="table"
              label="Mesa"
              action={
                <button
                  className="mobile-map-button"
                  type="button"
                  onClick={() => setMesaDetailOpen(true)}
                >
                  Detalle
                </button>
              }
            >
              {mesa.nombre || mesa.zona || `Mesa ${mesa.noMesa || ""}`.trim()}
            </InfoRow>
          )}
        </section>

        <section className="mobile-section reservation-products-section">
          <div className="mobile-section-head">
            <h2>Productos</h2>
            {individualSummary && (
              <div className="reservation-account-switch" aria-label="Cuenta">
                <button
                  className={accountMode === "general" ? "active" : ""}
                  type="button"
                  onClick={() => setAccountMode("general")}
                >
                  General
                </button>
                <button
                  className={accountMode === "individual" ? "active" : ""}
                  type="button"
                  onClick={() => setAccountMode("individual")}
                >
                  Individual
                </button>
              </div>
            )}
          </div>
          <div className="reservation-products-list">
            {visibleProducts.length ? (
              visibleProducts.map((product, index) => (
                <ReservationProductCard
                  key={getProductKey(product, index)}
                  product={product}
                  onOpen={() => setSelectedProduct(product)}
                />
              ))
            ) : (
              <p className="mobile-muted">No hay productos registrados.</p>
            )}
          </div>
        </section>

        <section className="mobile-summary-card">
          {/* <div className="mobile-section-head">
          <h2>Resumen</h2>
          <span>{reservation.status || "activa"}</span>
        </div> */}
          <div className="mobile-total-row">
            <span>Subtotal</span>
            <strong>
              {formatCurrency(getAccountAmount(summaryAccount, "subtotal"))}
            </strong>
          </div>
          <div className="mobile-total-row">
            <span>Propina</span>
            <strong>
              {formatCurrency(getAccountAmount(summaryAccount, "propina"))}
            </strong>
          </div>
          <div className="mobile-total-row">
            <span>Comisión Stripe</span>
            <strong>
              {formatCurrency(
                getAccountAmount(summaryAccount, "comisionStripe"),
              )}
            </strong>
          </div>
          <div className="mobile-total-row grand">
            <span>Total</span>
            <strong>
              {formatCurrency(getAccountAmount(summaryAccount, "total"))}
            </strong>
          </div>
        </section>

        {/* {authUser && !pendingPaymentRequest && (
        <button
          className="ghost-button mobile-danger-action"
          type="button"
          onClick={rejectInvitation}
        >
          Rechazar invitación
        </button>
      )} */}
      </section>
      {selectedProduct && (
        <div className="reservation-modal-backdrop" role="presentation">
          <section
            className="reservation-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Detalle del producto"
          >
            <div className="reservation-modal-head">
              <strong>Detalle del producto</strong>
              <button
                className="round-icon-button"
                type="button"
                onClick={() => setSelectedProduct(null)}
              >
                ×
              </button>
            </div>
            <img
              className="reservation-product-detail-image"
              src={selectedProduct.imagen || defaultAvatar}
              alt=""
            />
            <div className="reservation-product-detail-copy">
              <h2>
                {selectedProduct.cantidad > 1
                  ? `${selectedProduct.cantidad} `
                  : ""}
                {selectedProduct.nombre || "Producto"}
              </h2>
              {selectedProduct.descripcion && (
                <p>{selectedProduct.descripcion}</p>
              )}
              {selectedProduct.comentario && (
                <p>Nota: {selectedProduct.comentario}</p>
              )}
              <strong>{formatCurrency(selectedProduct.precio || 0)}</strong>
            </div>
          </section>
        </div>
      )}
      {mesaDetailOpen && hasVisibleMesa && (
        <div className="reservation-modal-backdrop" role="presentation">
          <section
            className="reservation-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Detalle de mesa"
          >
            <div className="reservation-modal-head">
              <strong>Detalle de mesa</strong>
              <button
                className="round-icon-button"
                type="button"
                onClick={() => setMesaDetailOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="reservation-mesa-detail">
              <InfoRow icon="users" label="Personas">
                {capacity || "Por confirmar"}
              </InfoRow>
              {mesa.consumominimo !== undefined && (
                <InfoRow icon="table" label="Consumo mínimo">
                  {formatCurrency(mesa.consumominimo || 0)}
                </InfoRow>
              )}
              {mesa.zona && (
                <InfoRow icon="map" label="Zona">
                  {mesa.zona}
                </InfoRow>
              )}
              {mesa.nombre && (
                <InfoRow icon="table" label="Mesa asignada">
                  {mesa.nombre}
                </InfoRow>
              )}
            </div>
          </section>
        </div>
      )}
      <ReservationPaymentModal
        paymentSession={reservationPaymentSession}
        paymentLoading={reservationPaymentLoading}
        authUser={authUser}
        onCancel={cancelReservationPayment}
        onConfirm={confirmReservationPayment}
      />
    </main>
  );
}

export function EventPublicView({
  invite,
  authUser,
  eventAttendees,
  eventAttendeesHasMore,
  eventAttendeesLoading,
  loadMoreEventAttendees,
  view,
  setView,
  purchasableItems,
  selectedItem,
  setSelectedItemId,
  quantity,
  setQuantity,
  guestForm,
  onGuestFieldChange,
  errors,
  guestTotal,
  buyAsGuest,
  buyAsUser,
}) {
  const event = invite.raw || {};
  const images = [invite.image, ...(invite.images || [])].filter(Boolean);
  const tabs = [
    ["descripcion", "Descripción"],
    ["cronograma", "Cronograma"],
    ["detalles", "Detalles"],
    ["mapa", "Mapa"],
    ["tickets", "$ Ticket"],
    ["zonas", "$ Zona"],
  ];
  const [activeTab, setActiveTab] = useState("descripcion");
  const attendeesCount =
    event.integrantesCount ||
    event.integrantesIds?.length ||
    eventAttendees.length ||
    0;
  const tickets = invite.tickets || [];
  const tables = invite.tables || [];

  const renderTab = () => {
    if (activeTab === "cronograma") {
      const items = String(invite.schedule || "")
        .split(/\n+/)
        .map((item) => item.trim())
        .filter(Boolean);
      return items.length ? (
        <div className="event-schedule-list">
          {items.map((item, index) => (
            <div className="event-schedule-item" key={`${item}-${index}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{item}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mobile-muted">No hay cronograma disponible.</p>
      );
    }

    if (activeTab === "detalles") {
      return (
        <div className="mobile-copy-stack">
          <strong>Especificaciones del evento</strong>
          <p>{invite.details || "No hay especificaciones disponibles."}</p>
          <strong>Reglas del evento</strong>
          <p>{invite.rules || "No hay reglas disponibles."}</p>
        </div>
      );
    }

    if (activeTab === "mapa") {
      const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(invite.address || invite.title)}`;
      return (
        <a
          className="event-map-card"
          href={mapUrl}
          target="_blank"
          rel="noreferrer"
        >
          <span aria-hidden="true">📍</span>
          <div>
            <strong>Ver ubicación</strong>
            <p>{invite.address || "Ubicación por confirmar"}</p>
          </div>
        </a>
      );
    }

    if (activeTab === "tickets") {
      return (
        <div className="event-option-list">
          {tickets.length ? (
            tickets.map((ticket) => (
              <div className="event-ticket-card" key={ticket.id}>
                <strong>{ticket.name}</strong>
                <p>{ticket.description}</p>
                <div>
                  <span>{formatCurrency(ticket.price)}</span>
                  <em>{ticket.available} disponibles</em>
                </div>
              </div>
            ))
          ) : (
            <p className="mobile-muted">No hay tickets disponibles.</p>
          )}
        </div>
      );
    }

    if (activeTab === "zonas") {
      return (
        <div className="event-option-list">
          {tables.length ? (
            tables.map((table) => (
              <div className="event-table-card" key={table.id}>
                <strong>{table.name}</strong>
                <p>{table.description}</p>
                <span>{formatCurrency(table.price)}</span>
              </div>
            ))
          ) : (
            <p className="mobile-muted">No hay mesas disponibles.</p>
          )}
        </div>
      );
    }

    return (
      <p className="event-description">
        {invite.description || "No hay descripción disponible."}
      </p>
    );
  };

  return (
    <main className="mobile-detail-shell event-detail-shell">
      <section className="event-gallery">
        <button
          className="round-icon-button event-back-button"
          type="button"
          onClick={() => window.location.assign("/")}
        >
          ←
        </button>
        {images.length ? (
          <img src={images[0]} alt="" />
        ) : (
          <div className="event-image-placeholder">Pul</div>
        )}
        <div className="event-gallery-gradient" />
        <span className="event-attendees-badge">
          {attendeesCount} asistirán
        </span>
      </section>

      <section className="event-info-card">
        <h1>{invite.title}</h1>
        <InfoRow icon="👤" label="Organiza">
          {invite.host || event.nombreNegocio || "Pul"}
        </InfoRow>
        <InfoRow icon="📅" label="Fecha">
          {formatInviteDate(invite)}
        </InfoRow>
        <InfoRow icon="📍" label="Ubicación">
          {invite.address || "Por confirmar"}
        </InfoRow>

        <div className="event-actions-row">
          <button
            className="secondary-button"
            type="button"
            onClick={() => setView("event-checkout")}
          >
            Tickets
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => setView("event-checkout")}
          >
            Comprar
          </button>
        </div>
      </section>

      <section className="event-tabs">
        <div className="event-tabs-scroll">
          {tabs.map(([id, label]) => (
            <button
              className={activeTab === id ? "active" : ""}
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="event-tab-content">{renderTab()}</div>
      </section>

      {eventAttendees.length > 0 && (
        <section className="mobile-section">
          <div className="mobile-section-head">
            <h2>Personas que asistirán</h2>
            <span>{attendeesCount}</span>
          </div>
          <AvatarStack users={eventAttendees} total={attendeesCount} />
          {eventAttendeesHasMore && (
            <button
              className="ghost-button compact"
              type="button"
              onClick={loadMoreEventAttendees}
              disabled={eventAttendeesLoading}
            >
              {eventAttendeesLoading ? "Cargando..." : "Ver más"}
            </button>
          )}
        </section>
      )}

      {view === "event-checkout" && (
        <form
          className="event-checkout mobile-checkout"
          onSubmit={buyAsGuest}
          noValidate
        >
          <div className="ticket-list" aria-label="Boletos y mesas disponibles">
            {purchasableItems.length > 0 ? (
              purchasableItems.map((item) => (
                <label
                  className={`ticket-option ${
                    selectedItem?.id === item.id ? "selected" : ""
                  }`}
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
                </label>
              ))
            ) : (
              <p className="mobile-muted">Venta por confirmar.</p>
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
            {!authUser && (
              <>
                <label>
                  <span>Nombre</span>
                  <input
                    name="nombre"
                    value={guestForm.nombre}
                    onChange={onGuestFieldChange}
                  />
                  {errors.nombre && <small>{errors.nombre}</small>}
                </label>
                <label>
                  <span>Email para confirmación</span>
                  <input
                    name="email"
                    type="email"
                    value={guestForm.email}
                    onChange={onGuestFieldChange}
                  />
                  {errors.email && <small>{errors.email}</small>}
                </label>
                <label>
                  <span>Teléfono opcional</span>
                  <input
                    name="telefono"
                    type="tel"
                    value={guestForm.telefono}
                    onChange={onGuestFieldChange}
                  />
                </label>
              </>
            )}
            <div className="checkout-total">
              <span>Total</span>
              <strong>{formatCurrency(guestTotal)}</strong>
            </div>
            <button
              className="primary-button"
              type="submit"
              disabled={!selectedItem}
            >
              Comprar como invitado
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={buyAsUser}
              disabled={!selectedItem}
            >
              Comprar con mi cuenta
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
