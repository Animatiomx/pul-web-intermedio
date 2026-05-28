import { ReservationsModule } from "../../modules/reservations/reservations.module";

/**
 * Rutas publicas asociadas al dominio de reservaciones y divisiones de cuenta.
 */
export const reservationRoutes = [
  {
    kind: "reserva",
    path: "/reserva/:reservaId",
    component: ReservationsModule,
  },
];
