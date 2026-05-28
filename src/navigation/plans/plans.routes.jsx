/**
 * Rutas publicas asociadas al dominio de planes.
 */
export const planRoutes = [
  {
    kind: "plan",
    path: "/plan/:planId",
    loadComponent: () =>
      import("../../modules/plans/plans.module").then((module) => ({
        default: module.PlansModule,
      })),
  },
];
