import "../App.css";
import { AppRouter } from "../navigation";

/**
 * Punto de entrada visual de la aplicacion.
 * Mantiene App libre de reglas de negocio y delega la navegacion al router.
 */
export default function App() {
  return <AppRouter />;
}
