/**
 * Rutas publicas asociadas al dominio de reservaciones y divisiones de cuenta.
 */
export const reservationRoutes = [
  {
    kind: "reserva",
    path: "/reserva/:reservaId",
    loadComponent: () =>
      import("../../modules/reservations/reservations.module").then(
        (module) => ({
          default: module.ReservationsModule,
        }),
      ),
  },
];
