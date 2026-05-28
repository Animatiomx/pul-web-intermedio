import { PlansModule } from "../../modules/plans/plans.module";

/**
 * Rutas publicas asociadas al dominio de planes.
 */
export const planRoutes = [
  {
    kind: "plan",
    path: "/plan/:planId",
    component: PlansModule,
  },
];
