import defaultAvatar from "../../../assets/default.png";
import logo from "../../../assets/logopul.png";
import {
  APP_STORE_URL,
  PLAY_STORE_URL,
} from "../../../shared/constants/appConfig";
import {
  formatCurrency,
  formatInviteDate,
  formatPlanVisibility,
} from "../../../shared/utils/formatters";
import {
  EventPublicView,
  ReservationPublicView,
} from "./PublicInviteRichViews";

/**
 * Vista publica para eventos, reservas y fallback de planes.
 * Recibe estado y handlers desde PublicInviteScreen para mantener la UI separada.
 */
export default function PublicInviteView({
  isPlan,
  isEvent,
  isEventDetail,
  isReserva,
  individualAccount,
  usesReservaLayout,
  heroImage,
  invite,
  displayTags,
  attemptOpenApp,
  authUser,
  rejectInvitation,
  setView,
  openLoginInApp,
  planSlots,
  spotsLeft,
  appPrompt,
  inviteStatus,
  planJoinMessage,
  eventAttendees,
  eventAttendeesHasMore,
  eventAttendeesLoading,
  loadMoreEventAttendees,
  joinCurrentReservation,
  payPendingReservationRequest,
  reservationActionLoading,
  reservationPaymentSession,
  reservationPaymentLoading,
  cancelReservationPayment,
  confirmReservationPayment,
  onLogout,
  view,
  flowStatus,
  purchasableItems,
  selectedItem,
  setSelectedItemId,
  setQuantity,
  quantity,
  guestForm,
  onGuestFieldChange,
  errors,
  guestTotal,
  buyAsGuest,
  buyAsUser,
  registerForm,
  onRegisterFieldChange,
  onRegisterSubmit,
  loginForm,
  onLoginFieldChange,
  onLoginSubmit,
  acceptAndPay,
  joinCurrentPlan,
}) {
  if (isReserva) {
    return (
      <ReservationPublicView
        invite={invite}
        authUser={authUser}
        individualAccount={individualAccount}
        setView={setView}
        flowStatus={flowStatus}
        planJoinMessage={planJoinMessage}
        joinCurrentReservation={joinCurrentReservation}
        payPendingReservationRequest={payPendingReservationRequest}
        reservationActionLoading={reservationActionLoading}
        reservationPaymentSession={reservationPaymentSession}
        reservationPaymentLoading={reservationPaymentLoading}
        cancelReservationPayment={cancelReservationPayment}
        confirmReservationPayment={confirmReservationPayment}
        rejectInvitation={rejectInvitation}
        attemptOpenApp={attemptOpenApp}
        onLogout={onLogout}
        view={view}
        errors={errors}
        registerForm={registerForm}
        loginForm={loginForm}
        onRegisterFieldChange={onRegisterFieldChange}
        onLoginFieldChange={onLoginFieldChange}
        onRegisterSubmit={onRegisterSubmit}
        onLoginSubmit={onLoginSubmit}
      />
    );
  }

  if (isEvent || isEventDetail) {
    return (
      <EventPublicView
        invite={invite}
        authUser={authUser}
        eventAttendees={eventAttendees}
        eventAttendeesHasMore={eventAttendeesHasMore}
        eventAttendeesLoading={eventAttendeesLoading}
        loadMoreEventAttendees={loadMoreEventAttendees}
        view={view}
        setView={setView}
        purchasableItems={purchasableItems}
        selectedItem={selectedItem}
        setSelectedItemId={setSelectedItemId}
        quantity={quantity}
        setQuantity={setQuantity}
        guestForm={guestForm}
        onGuestFieldChange={onGuestFieldChange}
        errors={errors}
        guestTotal={guestTotal}
        buyAsGuest={buyAsGuest}
        buyAsUser={buyAsUser}
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
              onClick={() => window.location.assign("/")}
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
                              <img
                                src={invite.hostImage || defaultAvatar}
                                alt=""
                              />
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
                    <img src={invite.hostImage || defaultAvatar} alt="" />
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
                      <span className="map-pin">?</span>
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
                        ? 14 km · Abrir ubicación
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
