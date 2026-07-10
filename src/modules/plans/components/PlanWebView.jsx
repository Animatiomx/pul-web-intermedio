import { useRef, useState } from "react";
import defaultAvatar from "../../../assets/default.png";
import logo from "../../../assets/logopul.png";
import { getUserId, normalizeUserSummary } from "../../../shared/utils/users";
import {
  formatPlanDate,
  formatPlanVisibility,
} from "../../../shared/utils/formatters";

function scrollAuthTargetIntoView(refs) {
  const scroll = () => {
    const target =
      refs
        .map((ref) => ref.current)
        .find((element) => element && element.getClientRects().length > 0) ||
      refs.find((ref) => ref.current)?.current;

    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (typeof window === "undefined" || !window.requestAnimationFrame) {
    scroll();
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(scroll);
  });
}

/**
 * Iconos SVG locales para evitar agregar dependencias y mantener la vista ligera.
 */
function SectionIcon({ name }) {
  const iconProps = {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };
  const icons = {
    attendees: (
      <svg {...iconProps}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    description: (
      <svg {...iconProps}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8" />
        <path d="M8 17h5" />
      </svg>
    ),
    dates: (
      <svg {...iconProps}>
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M3 10h18" />
        <path d="M8 14h.01" />
        <path d="M12 14h.01" />
        <path d="M16 14h.01" />
      </svg>
    ),
    location: (
      <svg {...iconProps}>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
    status: (
      <svg {...iconProps}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    ),
    requests: (
      <svg {...iconProps}>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    ),
    waitlist: (
      <svg {...iconProps}>
        <path d="M12 6v6l4 2" />
        <circle cx="12" cy="12" r="10" />
      </svg>
    ),
    activity: (
      <svg {...iconProps}>
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
    map: (
      <svg {...iconProps} width="18" height="18">
        <path d="M12 21s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12Z" />
        <circle cx="12" cy="9" r="2.5" />
      </svg>
    ),
  };

  return icons[name] || icons.description;
}

/**
 * Renderiza avatar de usuario usando imagen cuando existe o avatar default.
 */
function UserAvatar({ user, size = "md" }) {
  return (
    <span className={`user-avatar ${size}`}>
      <img src={user?.imagen || defaultAvatar} alt="" />
    </span>
  );
}

/**
 * Wrapper visual reutilizable para bloques de información dentro del plan.
 */
function PlanSection({ icon, title, children, action }) {
  return (
    <section className="plan-web-section">
      <div className="plan-web-section-head">
        <span className="plan-web-icon" aria-hidden="true">
          <SectionIcon name={icon} />
        </span>
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Formulario de autenticación compacto usado dentro de la vista de plan.
 */
function PlanAuthPanel({
  view,
  setView,
  errors,
  registerForm,
  loginForm,
  passwordResetForm,
  onRegisterFieldChange,
  onLoginFieldChange,
  onPasswordResetFieldChange,
  onRegisterSubmit,
  onLoginSubmit,
  onPasswordResetSubmit,
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

  if (view === "recover-password") {
    const isSuccess = flowStatus === "password-reset-sent";

    return (
      <form className="plan-auth-card" onSubmit={onPasswordResetSubmit} noValidate>
        <div>
          <span>Recuperar contraseña</span>
          <strong>Te enviaremos un correo</strong>
        </div>
        <label>
          <span>Email</span>
          <input
            name="email"
            type="email"
            value={passwordResetForm.email}
            onChange={onPasswordResetFieldChange}
          />
          {errors.email && <small>{errors.email}</small>}
        </label>
        {errors.form && (
          <p
            className={`status-note ${
              isSuccess ? "success-note" : "error-note"
            }`}
          >
            {errors.form}
          </p>
        )}
        <button
          className="primary-button"
          disabled={flowStatus === "recovering-password"}
          type="submit"
        >
          {flowStatus === "recovering-password"
            ? "Enviando..."
            : "Enviar correo"}
        </button>
        <button
          className="ghost-button"
          type="button"
          onClick={() => setView("login")}
        >
          Volver al inicio de sesión
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
      <button
        className="text-button"
        type="button"
        onClick={() => setView("recover-password")}
      >
        Recuperar contraseña
      </button>
    </form>
  );
}

/**
 * Genera una key estable para listas de usuarios aun cuando falte id.
 */
function getUserRenderKey(user, index) {
  return (
    user?.id || user?.uid || user?.email || user?.nombre || `user-${index}`
  );
}

/**
 * Deduplica usuarios antes de renderizar para evitar keys repetidas en React.
 */
function getUniqueUsers(users = []) {
  const seen = new Set();

  return users.filter((user, index) => {
    const key = getUserRenderKey(user, index);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Devuelve la etiqueta visual del tipo de plan sin afectar la lógica del flujo.
 */
function getPlanVariantLabel(planVariant) {
  if (planVariant === "business") return "Negocio";
  if (planVariant === "event") return "Evento";
  return "Plan";
}

/**
 * Vista especializada del plan: participantes, solicitudes, lista de espera y actividad.
 */
export default function PlanWebView({
  invite,
  inviteStatus,
  authUser,
  onLogout,
  flowStatus,
  planJoinMessage,
  planRequests,
  planWaitlist,
  planActivities,
  usersById,
  view,
  setView,
  errors,
  registerForm,
  loginForm,
  passwordResetForm,
  onRegisterFieldChange,
  onLoginFieldChange,
  onPasswordResetFieldChange,
  onRegisterSubmit,
  onLoginSubmit,
  onPasswordResetSubmit,
  joinCurrentPlan,
  leaveCurrentPlan,
  resolveRequest,
  resolveWaitlist,
  attemptOpenApp,
  loadAttendeesPage,
}) {
  const [attendeesOpen, setAttendeesOpen] = useState(false);
  const [attendeeSearch, setAttendeeSearch] = useState("");
  const [pagedAttendees, setPagedAttendees] = useState([]);
  const [attendeesCursor, setAttendeesCursor] = useState("");
  const [attendeesHasMore, setAttendeesHasMore] = useState(true);
  const [attendeesLoading, setAttendeesLoading] = useState(false);
  const [attendeesError, setAttendeesError] = useState("");
  const mobileAuthPanelRef = useRef(null);
  const desktopAuthPanelRef = useRef(null);
  const userId = getUserId(authUser);
  const memberIds = invite.integrantesIds || [];
  const requestIds = invite.solicitudesIds || [];
  const planVariant = invite.planVariant || "normal";
  const isHost = Boolean(userId && userId === invite.hostId);
  const isMember = Boolean(userId && memberIds.includes(userId));
  const isPending = Boolean(userId && requestIds.includes(userId));
  const isWaiting = Boolean(
    userId &&
    (planWaitlist || []).some((item) => (item.userId || item.id) === userId),
  );
  const isOriginPlan = Boolean(invite.isOriginPlan || (invite.origenTipo && invite.origenId));
  const capacity = Number(invite.capacity || 0);
  const memberCount = Number(invite.members || memberIds.length || 0);
  const spotsLeft = capacity > 0 ? Math.max(capacity - memberCount, 0) : null;
  const isFull = spotsLeft === 0;
  const attendees = getUniqueUsers(
    invite.attendees?.length
      ? invite.attendees
      : [
          invite.hostUser,
          ...memberIds.map((id) => normalizeUserSummary(id)),
        ].filter(Boolean),
  );
  const requestUsers = (planRequests || []).map(
    (item) =>
      usersById.get(item.userId || item.id) ||
      normalizeUserSummary(item.userId || item.id),
  );
  const waitlistUsers = (planWaitlist || []).map(
    (item) =>
      usersById.get(item.userId || item.id) ||
      normalizeUserSummary(item.userId || item.id),
  );
  const modalAttendees = authUser
    ? getUniqueUsers([...attendees, ...pagedAttendees])
    : attendees;
  const visibleAttendees = modalAttendees.filter((user) =>
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
          ? isOriginPlan
            ? "Cupo completo"
            : "Unirse a lista de espera"
          : "Unirse al plan";
  const effectiveActionText = isWaiting && !isOriginPlan
    ? "Salir de lista de espera"
    : isPending
      ? "Cancelar solicitud"
      : actionText;
  const canPromptLoginForMoreAttendees = !authUser && attendees.length >= 20;
  const showAuthSide =
    !authUser &&
    (view === "register" || view === "login" || view === "recover-password");

  const openAuthView = (nextView) => {
    setView(nextView);
    scrollAuthTargetIntoView([mobileAuthPanelRef, desktopAuthPanelRef]);
  };

  const loadNextAttendeesPage = async () => {
    if (
      !authUser ||
      !loadAttendeesPage ||
      attendeesLoading ||
      !attendeesHasMore
    ) {
      return;
    }

    setAttendeesLoading(true);
    setAttendeesError("");
    try {
      const page = await loadAttendeesPage(attendeesCursor);
      setPagedAttendees((current) =>
        getUniqueUsers([...current, ...page.users]),
      );
      setAttendeesCursor(page.nextCursor || "");
      setAttendeesHasMore(Boolean(page.hasMore));
    } catch (error) {
      setAttendeesError(
        error.message || "No se pudieron cargar más asistentes.",
      );
    } finally {
      setAttendeesLoading(false);
    }
  };

  const openAttendeesModal = () => {
    setAttendeesOpen(true);
    if (authUser && !pagedAttendees.length) {
      loadNextAttendeesPage();
    }
  };

  return (
    <main className={`plan-web-shell plan-web-${planVariant}`}>
      <nav className="plan-web-topbar" aria-label="Plan">
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

      <section className="plan-web-hero">
        <div className="plan-web-media-column">
          <div
            className={`plan-web-hero-card ${invite.image ? "has-image" : ""}`}
            style={
              invite.image
                ? {
                    backgroundImage: `url(${invite.image})`,
                  }
                : undefined
            }
          >
            {planVariant !== "normal" && (
              <span className="plan-web-kind">
                {getPlanVariantLabel(planVariant)}
              </span>
            )}
            <p className="eyebrow">{formatPlanVisibility(invite.visibility)}</p>
            <div className="plan-emoji-badge" aria-hidden="true">
              {invite.emoji || ""}
            </div>
            {/* <div className="plan-web-emoji" aria-hidden="true">
            </div> */}
            <h1>{invite.title}</h1>
            <div className="inviteRow plan-web-tags">
              {invite.live && (
                <div className="liveBadge">
                  <div className="liveDot" />
                  <p className="liveText">LIVE</p>
                </div>
              )}

              {invite.tags && <span>{invite.tags}</span>}
            </div>
          </div>
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
                onClick={
                  isMember || isWaiting || isPending
                    ? leaveCurrentPlan
                    : joinCurrentPlan
                }
                disabled={
                  isHost ||
                  (isOriginPlan && isFull && !isMember && !isPending) ||
                  flowStatus === "joining-plan" ||
                  flowStatus === "leaving-plan"
                }
              >
                {flowStatus === "joining-plan" || flowStatus === "leaving-plan"
                  ? "Actualizando..."
                  : effectiveActionText}
              </button>
              <div className="plan-web-current-user event-current-user">
                <img src={authUser.imagen || authUser.photoURL || defaultAvatar} alt="" />
                <div>
                  <span>Sesión iniciada como</span>
                  <strong>
                    {authUser.nombre || authUser.displayName || "Usuario Pul"}
                  </strong>
                  <p>{authUser.email}</p>
                </div>
              </div>
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
                onClick={() => openAuthView("register")}
              >
                Registrarme para unirme
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => openAuthView("login")}
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

      <section
        className={`plan-web-content ${showAuthSide ? "has-side" : "is-full"}`}
      >
        {!authUser &&
          (view === "register" ||
            view === "login" ||
            view === "recover-password") && (
          <div className="plan-web-mobile-auth" ref={mobileAuthPanelRef}>
            <PlanAuthPanel
              view={view}
              setView={openAuthView}
              errors={errors}
              registerForm={registerForm}
              loginForm={loginForm}
              passwordResetForm={passwordResetForm}
              onRegisterFieldChange={onRegisterFieldChange}
              onLoginFieldChange={onLoginFieldChange}
              onPasswordResetFieldChange={onPasswordResetFieldChange}
              onRegisterSubmit={onRegisterSubmit}
              onLoginSubmit={onLoginSubmit}
              onPasswordResetSubmit={onPasswordResetSubmit}
              flowStatus={flowStatus}
            />
          </div>
        )}

        <div className="plan-web-main">
          <PlanSection
            icon="attendees"
            title="Asistentes"
            action={
              attendees.length > 10 ? (
                <button
                  className="text-button"
                  type="button"
                  onClick={openAttendeesModal}
                >
                  Ver todos
                </button>
              ) : null
            }
          >
            <div className="plan-web-attendees">
              {attendees.slice(0, 10).map((user, index) => (
                <div
                  className="plan-web-attendee"
                  key={getUserRenderKey(user, index)}
                >
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

          <PlanSection icon="description" title="Descripción">
            <div className="plan-web-description">
              {invite.description ||
                "Este plan no tiene descripción adicional."}
            </div>
          </PlanSection>

          <PlanSection icon="dates" title="Fechas">
            <div className="plan-web-timeline">
              <div>
                <span>FECHA INICIO</span>
                <strong>{formatPlanDate(invite.date, invite.time)}</strong>
              </div>
              <div>
                <span>FECHA FIN</span>
                <strong>
                  {formatPlanDate(invite.endDate, invite.endTime)}
                </strong>
              </div>
            </div>
          </PlanSection>

          <PlanSection icon="location" title="Ubicación">
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
                  <SectionIcon name="map" />
                  <span>Ver en mapa</span>
                </a>
              </div>
            </div>
          </PlanSection>

          {isHost && (
            <PlanSection icon="status" title="Estado">
              <div className="plan-web-state-card">
                <div>
                  <span>ESTADO</span>
                  <strong>{invite.status || "Activo"}</strong>
                </div>
                <p>{invite.requests || 0} solicitudes pendientes</p>
              </div>
            </PlanSection>
          )}

          {isHost && requestUsers.length > 0 && (
            <PlanSection
              icon="requests"
              title={`Solicitudes (${requestUsers.length})`}
            >
              <div className="plan-web-request-list">
                {requestUsers.map((user) => (
                  <div className="plan-web-request" key={user.id}>
                    <UserAvatar user={user} />
                    <span>{user.nombre}</span>
                    <button
                      className="secondary-button compact"
                      type="button"
                      onClick={() => resolveRequest(user, "reject")}
                    >
                      Rechazar
                    </button>
                    <button
                      className="primary-button compact"
                      type="button"
                      onClick={() => resolveRequest(user, "accept")}
                    >
                      Aceptar
                    </button>
                  </div>
                ))}
              </div>
            </PlanSection>
          )}
          {isHost && !isOriginPlan && waitlistUsers.length > 0 && (
            <PlanSection
              icon="waitlist"
              title={`Lista de espera (${waitlistUsers.length})`}
            >
              <div className="plan-web-request-list">
                {waitlistUsers.map((user) => (
                  <div className="plan-web-request" key={user.id}>
                    <UserAvatar user={user} />
                    <span>{user.nombre}</span>
                    <button
                      className="secondary-button compact"
                      type="button"
                      onClick={() => resolveWaitlist(user, "reject")}
                    >
                      Quitar
                    </button>
                    <button
                      className="primary-button compact"
                      type="button"
                      onClick={() => resolveWaitlist(user, "accept")}
                    >
                      Aceptar
                    </button>
                  </div>
                ))}
              </div>
            </PlanSection>
          )}
          {isHost && planActivities.length > 0 && (
            <PlanSection icon="activity" title="Actividad reciente">
              <div className="plan-web-activity-list">
                {planActivities.slice(0, 5).map((activity) => (
                  <p key={activity.id}>{activity.message}</p>
                ))}
              </div>
            </PlanSection>
          )}
        </div>

        {showAuthSide && (
          <aside className="plan-web-side">
            <div className="plan-web-desktop-auth" ref={desktopAuthPanelRef}>
              <PlanAuthPanel
                view={view}
                setView={openAuthView}
                errors={errors}
                registerForm={registerForm}
                loginForm={loginForm}
                passwordResetForm={passwordResetForm}
                onRegisterFieldChange={onRegisterFieldChange}
                onLoginFieldChange={onLoginFieldChange}
                onPasswordResetFieldChange={onPasswordResetFieldChange}
                onRegisterSubmit={onRegisterSubmit}
                onLoginSubmit={onLoginSubmit}
                onPasswordResetSubmit={onPasswordResetSubmit}
                flowStatus={flowStatus}
              />
            </div>
          </aside>
        )}
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
                ×
              </button>
            </div>
            <input
              className="plan-search-input"
              placeholder="Buscar..."
              value={attendeeSearch}
              onChange={(event) => setAttendeeSearch(event.target.value)}
            />
            <div className="plan-modal-list">
              {visibleAttendees.map((user, index) => (
                <div
                  className="plan-modal-user"
                  key={getUserRenderKey(user, index)}
                >
                  <UserAvatar user={user} />
                  <span>{user.nombre}</span>
                </div>
              ))}
            </div>
            {!authUser && canPromptLoginForMoreAttendees && (
              <div className="plan-auth-card">
                <strong>Hay más asistentes disponibles</strong>
                <p>Para ver más de 20 asistentes, inicia sesión.</p>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => {
                    setAttendeesOpen(false);
                    openAuthView("login");
                  }}
                >
                  Iniciar sesión
                </button>
              </div>
            )}
            {authUser && attendeesError && (
              <p className="status-note error-note">{attendeesError}</p>
            )}
            {authUser && attendeesHasMore && (
              <button
                className="secondary-button"
                type="button"
                onClick={loadNextAttendeesPage}
                disabled={attendeesLoading}
              >
                {attendeesLoading ? "Cargando..." : "Cargar 100 más"}
              </button>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
