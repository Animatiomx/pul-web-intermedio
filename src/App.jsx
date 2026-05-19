import { useEffect, useState } from 'react'
import logo from './assets/logo.png'
import './App.css'

const FIREBASE_PROJECT_ID =
  import.meta.env.VITE_FIREBASE_PROJECT_ID || 'pul-33698'
const FIREBASE_API_KEY =
  import.meta.env.VITE_FIREBASE_API_KEY || 'REDACTED_CREDENTIAL_09d5e8ea'
const APP_DEEP_LINK_BASE =
  import.meta.env.VITE_APP_DEEP_LINK_BASE || 'pul://registro-express'
const DIVISION_DEEP_LINK_BASE =
  import.meta.env.VITE_DIVISION_DEEP_LINK_BASE || 'pul://division-cuenta'
const EVENT_DEEP_LINK_BASE =
  import.meta.env.VITE_EVENT_DEEP_LINK_BASE || 'pul://evento-detalle'
const LOGIN_DEEP_LINK_BASE =
  import.meta.env.VITE_LOGIN_DEEP_LINK_BASE || 'pul://login'
const STRIPE_CHECKOUT_ENDPOINT = import.meta.env.VITE_STRIPE_CHECKOUT_ENDPOINT || ''
const EVENT_CHECKOUT_ENDPOINT = import.meta.env.VITE_EVENT_CHECKOUT_ENDPOINT || ''
const EMAIL_CONFIRMATION_ENDPOINT = import.meta.env.VITE_EMAIL_CONFIRMATION_ENDPOINT || ''
const DIVISION_RESPONSE_ENDPOINT = import.meta.env.VITE_DIVISION_RESPONSE_ENDPOINT || ''
const APP_STORE_URL = import.meta.env.VITE_APP_STORE_URL || 'https://www.apple.com/app-store/'
const PLAY_STORE_URL = import.meta.env.VITE_PLAY_STORE_URL || 'https://play.google.com/store'

const initialForm = {
  nombre: '',
  email: '',
  telefono: '',
  password: '',
}

const initialLoginForm = {
  email: '',
  password: '',
}

const initialGuestForm = {
  nombre: '',
  email: '',
  telefono: '',
}

function getInviteContext() {
  const url = new URL(window.location.href)
  const pathParts = url.pathname.split('/').filter(Boolean)
  const explicitPlanId =
    url.searchParams.get('planId') ||
    url.searchParams.get('idPlan') ||
    (pathParts.includes('plan') ? pathParts[pathParts.indexOf('plan') + 1] : '')
  const explicitDivisionId =
    url.searchParams.get('divisionId') ||
    url.searchParams.get('reservaId') ||
    url.searchParams.get('eventoUserId') ||
    url.searchParams.get('inviteId')
  const explicitEventId =
    url.searchParams.get('eventId') ||
    url.searchParams.get('eventoId') ||
    url.searchParams.get('idEvento')
  const planIndex = pathParts.findIndex((part) =>
    ['plan', 'planes', 'registro'].includes(part),
  )
  const divisionIndex = pathParts.findIndex((part) =>
    ['division', 'cuenta', 'split', 'reservacion'].includes(part),
  )
  const eventIndex = pathParts.findIndex((part) =>
    ['evento', 'eventos', 'event', 'events'].includes(part),
  )
  const typeParam = url.searchParams.get('type') || url.searchParams.get('tipo') || ''
  const normalizedType =
    typeParam === 'evento' || pathParts.includes('evento')
      ? 'evento'
      : typeParam === 'reservacion' || pathParts.includes('reservacion')
        ? 'reservacion'
        : 'auto'

  if (explicitDivisionId || divisionIndex >= 0) {
    return {
      kind: 'division',
      id: explicitDivisionId || pathParts[divisionIndex + 1] || pathParts[0] || '',
      divisionType: normalizedType,
    }
  }

  if (explicitEventId || eventIndex >= 0) {
    return {
      kind: 'event',
      id: explicitEventId || pathParts[eventIndex + 1] || pathParts[0] || '',
      divisionType: 'auto',
    }
  }

  return {
    kind: 'plan',
    id: explicitPlanId || pathParts[planIndex + 1] || pathParts[0] || '',
    divisionType: 'auto',
  }
}

function firestoreValueToJs(value) {
  if (!value || typeof value !== 'object') return value
  if ('stringValue' in value) return value.stringValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return Number(value.doubleValue)
  if ('booleanValue' in value) return Boolean(value.booleanValue)
  if ('timestampValue' in value) return value.timestampValue
  if ('nullValue' in value) return null
  if ('arrayValue' in value) {
    return (value.arrayValue.values || []).map(firestoreValueToJs)
  }
  if ('mapValue' in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields || {}).map(([key, item]) => [
        key,
        firestoreValueToJs(item),
      ]),
    )
  }
  if ('geoPointValue' in value) return value.geoPointValue
  return value
}

function normalizeFirestoreDocument(document) {
  const fields = document?.fields || {}
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, firestoreValueToJs(value)]),
  )
}

function normalizePlan(document, id) {
  const data = normalizeFirestoreDocument(document)

  return {
    id: data.id || id,
    kind: 'plan',
    title: data.concepto || data.linkedEntity?.title || 'Plan en Pul',
    description:
      data.descripcion ||
      data.indicacines ||
      'Un plan compartido contigo para que te unas de forma rápida.',
    date: data.fecha || '',
    time: data.hora || '',
    endDate: data.fechaFin || '',
    endTime: data.horaFin || '',
    address: data.direccion || data.linkedEntity?.address || '',
    host: data.anfitrion?.nombre || 'Anfitrión Pul',
    hostImage: data.anfitrion?.imagen || '',
    capacity: data.personas || 0,
    members:
      data.integrantesCount ||
      (Array.isArray(data.integrantes) ? data.integrantes.length : 0),
    tags: data.hashtags || data.tags || data.tendencias?.tags || [],
    image: data.linkedEntity?.image || data.anfitrion?.imagen || '',
    amount: null,
    total: null,
    subtotal: null,
    fee: null,
    participants: null,
    resourceType: 'plan',
  }
}

function normalizeDivision(document, id, resourceType) {
  const data = normalizeFirestoreDocument(document)
  const isEvent = resourceType === 'evento'
  const event = data.evento || {}
  const venue = data.negocio || {}
  const account = data.cuentaCurso || data.cuenta || {}
  const dividers = Array.isArray(data.dividers) ? data.dividers : []
  const payers = Array.isArray(data.payers) ? data.payers : []
  const refused = Array.isArray(data.refused) ? data.refused : []
  const title = isEvent
    ? event.nombre || 'División de evento'
    : venue.nombre
      ? `Cuenta en ${venue.nombre}`
      : 'División de reservación'
  const itemLabel = isEvent
    ? data.mesa?.tipoMesa
      ? `${data.mesa.zona || 'Zona'} · Mesa ${data.mesa.noMesa || ''}`.trim()
      : data.boleto?.nombre || 'Boleto de evento'
    : data.mesa?.nombre || data.mesa?.zona || 'Reservación'

  return {
    id: data.id || id,
    kind: 'division',
    title,
    description:
      data.peticion ||
      `Te invitaron a dividir una cuenta de ${isEvent ? 'evento' : 'reservación'} en Pul.`,
    date: isEvent ? event.fechaString || '' : data.fecha || '',
    time: isEvent ? event.horaInicio || '' : data.hora || '',
    endDate: isEvent ? event.fechaStringFin || '' : '',
    endTime: isEvent ? event.horaFin || '' : '',
    address: isEvent ? event.ubicacion || '' : venue.direccion || '',
    host: data.anfitrion?.nombre || 'Anfitrión Pul',
    hostImage: data.anfitrion?.imagen || '',
    capacity: data.personas || data.noPersonas || 0,
    members: dividers.length + 1,
    tags: [
      'División de cuenta',
      isEvent ? 'Evento' : 'Reservación',
      account.pagado ? 'Pagado' : 'Pago pendiente',
    ],
    image: isEvent ? event.fotoHome || event.fotos?.[0] || '' : venue.imagen || '',
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
  }
}

function normalizeEvent(document, id) {
  const data = normalizeFirestoreDocument(document)
  const tickets = Array.isArray(data.boletosTipo)
    ? data.boletosTipo.map((ticket) => ({
        id: ticket.id || ticket.nombre,
        type: 'ticket',
        name: ticket.nombre || 'Boleto',
        description: ticket.descripcion || '',
        price: Number(ticket.precio || 0),
        available: Number(ticket.disponibles ?? ticket.cantidad ?? 0),
      }))
    : []
  const tables = Array.isArray(data.mesas)
    ? data.mesas.map((table) => ({
        id: table.id || `${table.zona}-${table.noMesa}`,
        type: 'table',
        name: table.tipoMesa
          ? `${table.tipoMesa} ${table.noMesa ? `Mesa ${table.noMesa}` : ''}`.trim()
          : table.zona || 'Mesa',
        description: table.especificaciones || table.zona || '',
        price: Number(table.costoMesa || table.ticketMesa || 0),
        available: table.disponible === false ? 0 : 1,
      }))
    : []

  return {
    id: data.id || id,
    kind: 'event',
    title: data.nombre || 'Evento Pul',
    description:
      data.descripcion ||
      data.especificaciones ||
      'Evento compartido contigo en Pul.',
    date: data.fechaString || '',
    time: data.horaInicio || '',
    endDate: data.fechaStringFin || '',
    endTime: data.horaFin || '',
    address: data.ubicacion || '',
    host: data.nombreNegocio || 'Pul',
    hostImage: '',
    capacity: Number(data.cupo || 0),
    members: Array.isArray(data.integrantesIds) ? data.integrantesIds.length : 0,
    tags: [
      'Evento',
      tickets.length ? 'Boletos' : '',
      tables.length ? 'Mesas' : '',
    ].filter(Boolean),
    image: data.fotoHome || data.fotos?.[0] || '',
    images: data.fotos || [],
    amount: null,
    total: null,
    subtotal: null,
    fee: null,
    participants: null,
    resourceType: 'evento',
    tickets,
    tables,
    schedule: data.cronograma || '',
    rules: data.reglas || '',
    details: data.especificaciones || '',
    periodicity: Array.isArray(data.periodicidad) ? data.periodicidad : [],
  }
}

function fallbackInvite(context) {
  if (context.kind === 'event') {
    return {
      id: context.id,
      kind: 'event',
      title: 'Evento Pul',
      description:
        'Abre Pul o compra como invitado desde esta página para recibir tu confirmación por correo.',
      date: '',
      time: '',
      endDate: '',
      endTime: '',
      address: 'Información disponible dentro de Pul',
      host: 'Pul',
      hostImage: '',
      capacity: 0,
      members: 0,
      tags: ['Evento', 'Compra invitado'],
      image: '',
      images: [],
      amount: null,
      total: null,
      subtotal: null,
      fee: null,
      participants: null,
      resourceType: 'evento',
      tickets: [],
      tables: [],
      schedule: '',
      rules: '',
      details: '',
      periodicity: [],
    }
  }

  if (context.kind === 'division') {
    return {
      id: context.id,
      kind: 'division',
      title: 'División de cuenta',
      description:
        'Abre Pul o continúa en web para aceptar la invitación, pagar tu parte o rechazarla.',
      date: '',
      time: '',
      endDate: '',
      endTime: '',
      address: 'Información disponible dentro de Pul',
      host: 'Pul',
      hostImage: '',
      capacity: 0,
      members: 0,
      tags: ['División de cuenta', 'Pago con Stripe'],
      image: '',
      amount: 0,
      total: 0,
      subtotal: 0,
      fee: 0,
      tip: 0,
      participants: null,
      payers: 0,
      refused: 0,
      resourceType: context.divisionType === 'evento' ? 'evento' : 'reservacion',
      itemLabel: 'Invitación compartida',
    }
  }

  return {
    id: context.id,
    kind: 'plan',
    title: 'Únete a este plan',
    description:
      'Abre Pul para ver todos los detalles o regístrate en segundos para continuar.',
    date: '',
    time: '',
    endDate: '',
    endTime: '',
    address: 'Información disponible dentro de Pul',
    host: 'Pul',
    hostImage: '',
    capacity: 0,
    members: 0,
    tags: ['Registro express', 'Plan compartido'],
    image: '',
    amount: null,
    total: null,
    subtotal: null,
    fee: null,
    participants: null,
    resourceType: 'plan',
  }
}

async function fetchFirestoreDocument(collectionName, id) {
  const encodedId = encodeURIComponent(id)
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}` +
    `/databases/(default)/documents/${collectionName}/${encodedId}?key=${FIREBASE_API_KEY}`

  const response = await fetch(endpoint)
  if (!response.ok) {
    throw new Error(`${collectionName} request failed with ${response.status}`)
  }

  return response.json()
}

async function fetchInvite(context) {
  if (context.kind === 'event') {
    return normalizeEvent(await fetchFirestoreDocument('eventos', context.id), context.id)
  }

  if (context.kind === 'plan') {
    return normalizePlan(await fetchFirestoreDocument('planes', context.id), context.id)
  }

  const collections =
    context.divisionType === 'evento'
      ? [['eventosUsers', 'evento']]
      : context.divisionType === 'reservacion'
        ? [['reservaciones', 'reservacion']]
        : [
            ['reservaciones', 'reservacion'],
            ['eventosUsers', 'evento'],
          ]

  let lastError
  for (const [collectionName, resourceType] of collections) {
    try {
      return normalizeDivision(
        await fetchFirestoreDocument(collectionName, context.id),
        context.id,
        resourceType,
      )
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}

function buildDeepLink(base, params) {
  const url = new URL(base)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value)
    }
  })
  return url.toString()
}

function isMobileBrowser() {
  return /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent)
}

function getDeepLinkBase(kind) {
  if (kind === 'event') return EVENT_DEEP_LINK_BASE
  return kind === 'division' ? DIVISION_DEEP_LINK_BASE : APP_DEEP_LINK_BASE
}

function attemptOpenApp(invite, source = 'auto') {
  if (!invite.id) return

  const deepLink = buildDeepLink(getDeepLinkBase(invite.kind), {
    planId: invite.kind === 'plan' ? invite.id : undefined,
    divisionId: invite.kind === 'division' ? invite.id : undefined,
    eventId: invite.kind === 'event' ? invite.id : undefined,
    id: invite.kind === 'event' ? invite.id : undefined,
    type: invite.kind === 'division' ? invite.resourceType : undefined,
    source,
  })

  window.location.href = deepLink
}

function formatInviteDate(invite) {
  const date = [invite.date, invite.time].filter(Boolean).join(' · ')
  const end = [invite.endDate, invite.endTime].filter(Boolean).join(' · ')
  if (date && end) return `${date} a ${end}`
  return date || 'Fecha por confirmar'
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(amount)
}

function validateRegisterForm(form) {
  const errors = {}
  if (form.nombre.trim().length < 2) errors.nombre = 'Escribe tu nombre.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = 'Usa un email válido.'
  }
  if (form.telefono.replace(/\D/g, '').length < 10) {
    errors.telefono = 'Incluye un teléfono de 10 dígitos.'
  }
  if (form.password.length < 6) {
    errors.password = 'La contraseña debe tener al menos 6 caracteres.'
  }
  return errors
}

function validateLoginForm(form) {
  const errors = {}
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = 'Usa un email válido.'
  }
  if (form.password.length < 6) {
    errors.password = 'Ingresa tu contraseña.'
  }
  return errors
}

function validateGuestForm(form) {
  const errors = {}
  if (form.nombre.trim().length < 2) errors.nombre = 'Escribe tu nombre.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = 'Usa un email válido para enviar tu boleto.'
  }
  if (form.telefono && form.telefono.replace(/\D/g, '').length < 10) {
    errors.telefono = 'Incluye un teléfono válido o deja el campo vacío.'
  }
  return errors
}

async function postJson(endpoint, payload) {
  if (!endpoint) return null

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`)
  }

  return response.json()
}

function App() {
  const [context] = useState(getInviteContext)
  const [invite, setInvite] = useState(() => fallbackInvite(context))
  const [inviteStatus, setInviteStatus] = useState(context.id ? 'loading' : 'missing')
  const [view, setView] = useState('landing')
  const [registerForm, setRegisterForm] = useState(initialForm)
  const [loginForm, setLoginForm] = useState(initialLoginForm)
  const [guestForm, setGuestForm] = useState(initialGuestForm)
  const [selectedItemId, setSelectedItemId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [errors, setErrors] = useState({})
  const [authUser, setAuthUser] = useState(() => {
    const cached = sessionStorage.getItem('pulExpressUser')
    return cached ? JSON.parse(cached) : null
  })
  const [flowStatus, setFlowStatus] = useState(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('payment') !== 'success') return 'idle'
    return context.kind === 'event' ? 'event-paid' : 'paid'
  })
  const [appPrompt, setAppPrompt] = useState(() =>
    context.id && isMobileBrowser() ? 'opening' : 'fallback',
  )

  useEffect(() => {
    if (!context.id) return

    let ignore = false
    fetchInvite(context)
      .then((data) => {
        if (ignore) return
        setInvite(data)
        setInviteStatus('ready')
      })
      .catch(() => {
        if (ignore) return
        setInvite(fallbackInvite(context))
        setInviteStatus('fallback')
      })

    return () => {
      ignore = true
    }
  }, [context])

  useEffect(() => {
    if (!context.id || !isMobileBrowser()) return

    const timeoutId = window.setTimeout(() => {
      attemptOpenApp(invite)
    }, 450)

    const fallbackId = window.setTimeout(() => {
      if (!document.hidden) setAppPrompt('fallback')
    }, 1800)

    const onVisibilityChange = () => {
      if (document.hidden) setAppPrompt('opened')
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.clearTimeout(timeoutId)
      window.clearTimeout(fallbackId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [context.id, invite])

  const isDivision = invite.kind === 'division'
  const isEvent = invite.kind === 'event'
  const purchasableItems = isEvent ? [...invite.tickets, ...invite.tables] : []
  const selectedItem =
    purchasableItems.find((item) => item.id === selectedItemId) || purchasableItems[0]
  const guestTotal = selectedItem ? selectedItem.price * quantity : 0
  const spotsLeft =
    invite.capacity > 0 ? Math.max(invite.capacity - invite.members, 0) : null
  const heroImage = invite.image || invite.hostImage

  const onRegisterFieldChange = (event) => {
    const { name, value } = event.target
    setRegisterForm((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  const onLoginFieldChange = (event) => {
    const { name, value } = event.target
    setLoginForm((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  const onGuestFieldChange = (event) => {
    const { name, value } = event.target
    setGuestForm((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  const completeAuth = (user) => {
    sessionStorage.setItem('pulExpressUser', JSON.stringify(user))
    setAuthUser(user)
    setFlowStatus('authenticated')
    setView(isDivision ? 'payment' : isEvent ? 'event-checkout' : 'landing')
  }

  const onRegisterSubmit = (event) => {
    event.preventDefault()
    const nextErrors = validateRegisterForm(registerForm)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    completeAuth({
      nombre: registerForm.nombre.trim(),
      email: registerForm.email.trim(),
      telefono: registerForm.telefono.trim(),
      method: 'express-register',
      createdAt: new Date().toISOString(),
    })
  }

  const onLoginSubmit = (event) => {
    event.preventDefault()
    const nextErrors = validateLoginForm(loginForm)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    completeAuth({
      nombre: loginForm.email.split('@')[0],
      email: loginForm.email.trim(),
      method: 'web-login',
      createdAt: new Date().toISOString(),
    })
  }

  const openLoginInApp = () => {
    if (!invite.id) return
    window.location.href = buildDeepLink(LOGIN_DEEP_LINK_BASE, {
      planId: invite.kind === 'plan' ? invite.id : undefined,
      divisionId: invite.kind === 'division' ? invite.id : undefined,
      eventId: invite.kind === 'event' ? invite.id : undefined,
      type: invite.kind === 'division' ? invite.resourceType : undefined,
      source: 'express-login',
    })
  }

  const sendTicketEmail = async (purchase) => {
    await postJson(EMAIL_CONFIRMATION_ENDPOINT, {
      to: purchase.buyer.email,
      template: 'event-ticket-confirmation',
      purchase,
    })
  }

  const completeGuestPurchase = async (buyer) => {
    if (!selectedItem) {
      setFlowStatus('purchase-error')
      return
    }

    setFlowStatus('purchasing')
    const purchaseId = `web-${invite.id}-${selectedItem.id}-${buyer.email}`.replace(/[^a-zA-Z0-9_-]/g, '-')
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
    }

    try {
      const result = await postJson(EVENT_CHECKOUT_ENDPOINT || STRIPE_CHECKOUT_ENDPOINT, purchase)
      if (result?.url) {
        window.location.assign(result.url)
        return
      }

      await sendTicketEmail(purchase)
      sessionStorage.setItem(`pulEventPurchase:${invite.id}`, JSON.stringify(purchase))
      setFlowStatus('event-paid')
    } catch {
      if (!EVENT_CHECKOUT_ENDPOINT && !STRIPE_CHECKOUT_ENDPOINT && !EMAIL_CONFIRMATION_ENDPOINT) {
        await new Promise((resolve) => window.setTimeout(resolve, 900))
        sessionStorage.setItem(`pulEventPurchase:${invite.id}`, JSON.stringify(purchase))
        setFlowStatus('event-paid')
        return
      }
      setFlowStatus('purchase-error')
    }
  }

  const buyAsGuest = async (event) => {
    event.preventDefault()
    const nextErrors = validateGuestForm(guestForm)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    await completeGuestPurchase({
      nombre: guestForm.nombre.trim(),
      email: guestForm.email.trim(),
      telefono: guestForm.telefono.trim(),
      method: 'guest',
    })
  }

  const buyAsUser = async () => {
    if (!authUser) {
      setView('register')
      return
    }

    await completeGuestPurchase({
      ...authUser,
      method: authUser.method || 'authenticated-web',
    })
  }

  const acceptAndPay = async () => {
    if (!authUser || !isDivision) {
      setView('register')
      return
    }

    setFlowStatus('paying')
    try {
      const result = await postJson(STRIPE_CHECKOUT_ENDPOINT, {
        divisionId: invite.id,
        type: invite.resourceType,
        amount: invite.amount,
        user: authUser,
        successUrl: `${window.location.origin}${window.location.pathname}?divisionId=${invite.id}&type=${invite.resourceType}&payment=success`,
        cancelUrl: window.location.href,
      })

      if (result?.url) {
        window.location.href = result.url
        return
      }

      await new Promise((resolve) => window.setTimeout(resolve, 900))
      sessionStorage.setItem(
        `pulDivisionPayment:${invite.id}`,
        JSON.stringify({ paidAt: new Date().toISOString(), user: authUser }),
      )
      setFlowStatus('paid')
    } catch {
      setFlowStatus('payment-error')
    }
  }

  const rejectInvitation = async () => {
    setFlowStatus('rejecting')
    try {
      await postJson(DIVISION_RESPONSE_ENDPOINT, {
        divisionId: invite.id,
        type: invite.resourceType,
        action: 'reject',
        user: authUser,
      })
      sessionStorage.setItem(
        `pulDivisionRejected:${invite.id}`,
        JSON.stringify({ rejectedAt: new Date().toISOString(), user: authUser }),
      )
      setFlowStatus('rejected')
    } catch {
      setFlowStatus('reject-error')
    }
  }

  return (
    <main className="express-shell">
      <section className="hero-panel">
        <nav className="topbar" aria-label="Pul">
          <img src={logo} alt="Pul" className="brand-logo" />
          <button
            className="ghost-button compact"
            type="button"
            onClick={() => attemptOpenApp(invite, 'manual-open')}
            disabled={!invite.id}
          >
            Abrir app
          </button>
        </nav>

        <div className="hero-grid">
          <article className="plan-summary" aria-live="polite">
            <p className="eyebrow">
              {isEvent ? 'Evento compartido' : isDivision ? 'División de cuenta' : 'Registro Express'}
            </p>
            <h1>{invite.title}</h1>
            <p className="lead">{invite.description}</p>

            <div className="meta-grid">
              <div>
                <span>Cuándo</span>
                <strong>{formatInviteDate(invite)}</strong>
              </div>
              <div>
                <span>Dónde</span>
                <strong>{invite.address || 'Ubicación por confirmar'}</strong>
              </div>
              <div>
                <span>{isDivision ? 'Invita' : 'Anfitrión'}</span>
                <strong>{invite.host}</strong>
              </div>
              <div>
                <span>{isEvent ? 'Asistentes' : isDivision ? 'Tu parte' : 'Lugares'}</span>
                <strong>
                  {isEvent
                    ? `${invite.members || 0}${invite.capacity ? ` / ${invite.capacity}` : ''}`
                    : isDivision
                    ? invite.amount > 0
                      ? formatCurrency(invite.amount)
                      : 'Monto por confirmar'
                    : spotsLeft === null
                      ? 'Por confirmar'
                      : spotsLeft > 0
                        ? `${spotsLeft} disponibles`
                        : 'Lista llena'}
                </strong>
              </div>
            </div>

            {isDivision && (
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
                  <strong>{invite.participants || 'Por confirmar'}</strong>
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

            {invite.tags.length > 0 && (
              <div className="tag-row" aria-label="Etiquetas">
                {invite.tags.slice(0, 4).map((tag) => (
                  <span key={tag}>{String(tag).replace(/^#/, '#')}</span>
                ))}
              </div>
            )}

            <div className="cta-row">
              {isEvent ? (
                <>
                  <button className="primary-button" type="button" onClick={() => setView('guest-checkout')}>
                    Comprar boletos o mesas
                  </button>
                  <button className="secondary-button" type="button" onClick={() => setView('login')}>
                    Iniciar sesión
                  </button>
                </>
              ) : isDivision ? (
                <>
                  <button className="primary-button" type="button" onClick={acceptAndPay}>
                    {authUser ? 'Aceptar y pagar' : 'Registrarme para pagar'}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => (authUser ? rejectInvitation() : setView('login'))}
                  >
                    Rechazar invitación
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => setView('register')}
                  >
                    Registrarse
                  </button>
                  <button className="secondary-button" type="button" onClick={openLoginInApp}>
                    Iniciar sesión
                  </button>
                </>
              )}
            </div>

            {appPrompt === 'opening' && (
              <p className="status-note">Intentando abrir Pul automáticamente...</p>
            )}
            {inviteStatus === 'fallback' && (
              <p className="status-note">
                No pudimos cargar el detalle completo, pero el enlace está listo.
              </p>
            )}
            {inviteStatus === 'missing' && (
              <p className="status-note">Este enlace no incluye un identificador válido.</p>
            )}
          </article>

          <aside className="visual-panel" aria-label="Vista previa">
            {heroImage ? (
              <img src={heroImage} alt="" className="plan-image" />
            ) : (
              <div className="plan-monogram">PUL</div>
            )}
            <div className="floating-ticket">
              <span>{isEvent ? 'Evento ID' : isDivision ? 'División ID' : 'Plan ID'}</span>
              <strong>{invite.id || 'sin-id'}</strong>
            </div>
          </aside>
        </div>
      </section>

      <section className="action-panel">
        <div className="section-copy">
          <p className="eyebrow">{isEvent ? 'Compra web' : isDivision ? 'Pago seguro' : 'Fallback web'}</p>
          <h2>
            {flowStatus === 'event-paid'
              ? 'Compra confirmada'
              : flowStatus === 'paid'
                ? 'Participación confirmada'
              : view === 'register'
                ? 'Crea tu cuenta en segundos'
                : view === 'login'
                  ? 'Entra a tu cuenta'
                  : view === 'guest-checkout' || view === 'event-checkout'
                    ? 'Selecciona tu compra'
                  : isDivision
                    ? 'Acepta, paga o rechaza'
                    : isEvent
                      ? 'Compra como invitado'
                    : 'Continúa como prefieras'}
          </h2>
          <p>
            {isEvent
              ? 'Puedes comprar boletos o mesas sin iniciar sesión. Al finalizar, recibirás tu confirmación y QR por correo electrónico.'
              : isDivision
              ? 'Si la app no se abre, puedes autenticarte aquí y completar tu parte de la cuenta con Stripe.'
              : 'Si la app no se abre, puedes iniciar sesión o dejar tu registro express para continuar el flujo asociado a este plan.'}
          </p>
        </div>

        {flowStatus === 'event-paid' ? (
          <div className="confirmation-panel">
            <strong>Compra exitosa</strong>
            <p>
              Enviamos la confirmación al correo indicado con el detalle de la compra
              y el código QR del boleto. Descarga Pul para gestionar tus eventos.
            </p>
            <div className="store-row">
              <a href={APP_STORE_URL} target="_blank" rel="noreferrer">App Store</a>
              <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer">Google Play</a>
            </div>
          </div>
        ) : flowStatus === 'paid' ? (
          <div className="confirmation-panel">
            <strong>Pago exitoso</strong>
            <p>
              Ya estás marcado como participante de esta división. Descarga Pul
              para ver el seguimiento, detalles del consumo y futuras invitaciones.
            </p>
            <div className="store-row">
              <a href={APP_STORE_URL} target="_blank" rel="noreferrer">App Store</a>
              <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer">Google Play</a>
            </div>
          </div>
        ) : flowStatus === 'rejected' ? (
          <div className="confirmation-panel muted">
            <strong>Invitación rechazada</strong>
            <p>Registramos tu respuesta para esta división de cuenta.</p>
          </div>
        ) : isEvent && (view === 'guest-checkout' || view === 'event-checkout') ? (
          <form className="event-checkout" onSubmit={buyAsGuest} noValidate>
            <div className="ticket-list" aria-label="Boletos y mesas disponibles">
              {purchasableItems.length > 0 ? (
                purchasableItems.map((item) => (
                  <label
                    className={`ticket-option ${selectedItem?.id === item.id ? 'selected' : ''}`}
                    key={`${item.type}-${item.id}`}
                  >
                    <input
                      type="radio"
                      name="purchaseItem"
                      value={item.id}
                      checked={selectedItem?.id === item.id}
                      onChange={() => setSelectedItemId(item.id)}
                    />
                    <span>{item.type === 'table' ? 'Mesa' : 'Boleto'}</span>
                    <strong>{item.name}</strong>
                    {item.description && <p>{item.description}</p>}
                    <em>{formatCurrency(item.price)}</em>
                    <small>
                      {item.available > 0 ? `${item.available} disponibles` : 'Disponibilidad por confirmar'}
                    </small>
                  </label>
                ))
              ) : (
                <div className="empty-purchase">
                  <strong>Venta por confirmar</strong>
                  <p>Este evento todavía no tiene boletos o mesas visibles para compra web.</p>
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
                    onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                  >
                    -
                  </button>
                  <strong>{quantity}</strong>
                  <button
                    className="stepper-button"
                    type="button"
                    onClick={() => setQuantity((current) => Math.min(10, current + 1))}
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
                disabled={!selectedItem || flowStatus === 'purchasing'}
              >
                {flowStatus === 'purchasing' ? 'Procesando compra...' : 'Comprar como invitado'}
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={buyAsUser}
                disabled={!selectedItem || flowStatus === 'purchasing'}
              >
                Comprar con mi cuenta
              </button>
              {flowStatus === 'purchase-error' && (
                <p className="status-note">No se pudo completar la compra. Intenta de nuevo.</p>
              )}
            </div>
          </form>
        ) : view === 'register' ? (
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

            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={!invite.id}>
                {isEvent ? 'Continuar a compra' : isDivision ? 'Continuar al pago' : 'Unirme al plan'}
              </button>
              <button className="ghost-button" type="button" onClick={() => setView('landing')}>
                Volver
              </button>
            </div>
          </form>
        ) : view === 'login' ? (
          <form className="express-form login-form" onSubmit={onLoginSubmit} noValidate>
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
            <div className="form-actions">
              <button className="primary-button" type="submit">Continuar</button>
              <button className="ghost-button" type="button" onClick={openLoginInApp}>
                Abrir en app
              </button>
            </div>
          </form>
        ) : isDivision && authUser ? (
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
              <strong>{invite.amount > 0 ? formatCurrency(invite.amount) : 'Por confirmar'}</strong>
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={acceptAndPay}
              disabled={flowStatus === 'paying'}
            >
              {flowStatus === 'paying' ? 'Conectando con Stripe...' : 'Pagar con Stripe'}
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={rejectInvitation}
              disabled={flowStatus === 'rejecting'}
            >
              Rechazar invitación
            </button>
            {flowStatus === 'payment-error' && (
              <p className="status-note">No se pudo iniciar el pago. Intenta de nuevo.</p>
            )}
            {flowStatus === 'reject-error' && (
              <p className="status-note">No se pudo registrar el rechazo. Intenta de nuevo.</p>
            )}
          </div>
        ) : (
          <div className="choice-grid">
            <button className="choice-card" type="button" onClick={() => setView('login')}>
              <span>Ya tengo cuenta</span>
              <strong>Iniciar sesión</strong>
            </button>
            <button
              className="choice-card accent"
              type="button"
              onClick={() => setView(isEvent ? 'guest-checkout' : 'register')}
            >
              <span>{isEvent ? 'Sin cuenta' : 'Soy nuevo en Pul'}</span>
              <strong>{isEvent ? 'Comprar invitado' : 'Registrarme'}</strong>
            </button>
          </div>
        )}
      </section>
    </main>
  )
}

export default App
