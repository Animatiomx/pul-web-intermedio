import { EventsModule } from "../../modules/events/events.module";

/**
 * Rutas publicas asociadas al dominio de eventos.
 */
export const eventRoutes = [
  {
    kind: "event",
    path: "/evento/:eventId",
    component: EventsModule,
  },
  {
    kind: "eventDetail",
    path: "/detalle-evento/:eventDetailId",
    component: EventsModule,
  },
];
