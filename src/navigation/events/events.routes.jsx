/**
 * Rutas publicas asociadas al dominio de eventos.
 */
export const eventRoutes = [
  {
    kind: "event",
    path: "/evento/:eventId",
    loadComponent: () =>
      import("../../modules/events/events.module").then((module) => ({
        default: module.EventsModule,
      })),
  },
  {
    kind: "eventDetail",
    path: "/detalle-evento/:eventDetailId",
    loadComponent: () =>
      import("../../modules/events/events.module").then((module) => ({
        default: module.EventsModule,
      })),
  },
];
