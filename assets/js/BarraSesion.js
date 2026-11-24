// =====================================================================
// Clase BarraSesion: quién está conectado, selector «Mis vehículos»,
// tiempo restante del Invitado y cierre de sesión.
// =====================================================================
import { ENDPOINTS, VEHICULO_ID } from "./config.js";
import { Sesion } from "./Sesion.js";
import { el, icono } from "./Dom.js";

const ROL = { ADMIN: "Administrador", USUARIO: "Usuario", INVITADO: "Invitado" };

export class BarraSesion {
  #api;
  #raiz = document.getElementById("barraSesion");
  #reloj = null;
  #alTerminar;

  constructor({ api, alTerminar }) {
    this.#api = api;
    this.#alTerminar = alTerminar;   // se llama cuando el tiempo del invitado llega a cero
  }

  /** @param {Array} vehiculos unidades que la sesión puede operar */
  dibujar(vehiculos) {
    const s = Sesion.actual();
    this.#raiz.hidden = false;
    this.#raiz.replaceChildren();

    const quien = el("div", { class: "sesion-quien" },
      el("span", { class: `rol-chip rol-${s.tipo.toLowerCase()}` }, ROL[s.tipo] ?? s.tipo),
      el("span", { class: "sesion-nombre" }, s.nombre ?? ""));

    let selector;
    if (vehiculos.length > 1) {
      selector = el("select", { class: "form-select form-select-sm sesion-vehiculo", "aria-label": "Mis vehículos" },
        vehiculos.map((v) => el("option", { value: v.id_vehiculo, selected: v.id_vehiculo === VEHICULO_ID },
          `${v.numero_serie} · ${v.modelo}`)));
      selector.addEventListener("change", () => {
        Sesion.fijarVehiculo(selector.value);   // cancela la suscripción anterior al recargar
        Sesion.recargar();
      });
    } else if (vehiculos.length === 1) {
      selector = el("span", { class: "sesion-unidad" }, icono("bi-truck-front"), ` ${vehiculos[0].numero_serie} · ${vehiculos[0].modelo}`);
    } else {
      selector = el("span", { class: "sesion-unidad text-warning" }, "Sin unidades asignadas");
    }

    const salir = el("button", { type: "button", class: "btn btn-sm btn-outline-light" },
      icono("bi-box-arrow-right"), s.tipo === "INVITADO" ? " Terminar prueba" : " Salir");
    salir.addEventListener("click", () => this.cerrarSesion());

    const partes = [quien, selector];
    if (s.tipo === "INVITADO") {
      const reloj = el("span", { class: "sesion-reloj", role: "timer", "aria-live": "off" }, "--:--");
      partes.push(reloj);
      this.#iniciarReloj(reloj, Date.parse(s.expira));
    }
    partes.push(salir);
    this.#raiz.append(...partes);
  }

  async cerrarSesion(aviso = "") {
    const tipo = Sesion.tipo();
    try {
      if (tipo === "INVITADO") await this.#api.borrar(ENDPOINTS.finInvitado());   // detiene y libera la unidad
      else await this.#api.post(ENDPOINTS.logout());
    } catch { /* aunque falle, la sesión local se borra */ }
    Sesion.cerrar(aviso || (tipo === "INVITADO" ? "Tu prueba terminó. La unidad se detuvo y quedó libre." : "Sesión cerrada."));
    Sesion.recargar();
  }

  #iniciarReloj(nodo, fin) {
    clearInterval(this.#reloj);
    const pintar = () => {
      const resta = Math.max(0, fin - Date.now());
      const m = Math.floor(resta / 60000);
      const sgs = Math.floor((resta % 60000) / 1000);
      nodo.textContent = `${String(m).padStart(2, "0")}:${String(sgs).padStart(2, "0")}`;
      nodo.classList.toggle("poco-tiempo", resta < 60000);
      if (resta === 0) {
        clearInterval(this.#reloj);
        this.#alTerminar?.();
      }
    };
    pintar();
    this.#reloj = setInterval(pintar, 1000);
  }
}
