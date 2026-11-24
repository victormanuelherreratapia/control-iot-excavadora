// =====================================================================
// Clase VistaCuenta (rol USUARIO / comprador): «Mis vehículos», permiso
// de soporte para el Administrador y editor de demos PRIVADAS.
// =====================================================================
import { VEHICULO_ID } from "./config.js";
import { Sesion } from "./Sesion.js";
import { EditorDemos } from "./EditorDemos.js";
import { el, icono, fechaHora, mensaje, conEspera } from "./Dom.js";

export class VistaCuenta {
  #api;
  #raiz = document.getElementById("vistaAdmin");
  #alCambiarDemos;
  #iniciada = false;

  constructor({ api, alCambiarDemos }) {
    this.#api = api;
    this.#alCambiarDemos = alCambiarDemos;
  }

  iniciar() {
    this.#raiz.replaceChildren(el("h2", { class: "panel-title" }, icono("bi-person-gear"), " Mi cuenta"),
      el("div", { id: "cuentaVehiculos" }), el("div", { id: "cuentaDemos" }));
  }

  mostrar() {
    if (this.#iniciada) return;
    this.#iniciada = true;
    this.#misVehiculos();
    this.#demos();
  }

  async #misVehiculos() {
    const zona = document.getElementById("cuentaVehiculos");
    const salida = el("p", { class: "form-msg", role: "status", "aria-live": "polite" });
    try {
      const vehiculos = await this.#api.get("/api/v1/mis-vehiculos");
      const filas = vehiculos.map((v) => {
        const soporteVigente = v.soporte_hasta && Date.parse(`${v.soporte_hasta}Z`) > Date.now();
        const usar = el("button", { type: "button", class: "btn btn-sm btn-warning", disabled: v.id_vehiculo === VEHICULO_ID },
          v.id_vehiculo === VEHICULO_ID ? "En uso" : "Usar en Control");
        usar.addEventListener("click", () => { Sesion.fijarVehiculo(v.id_vehiculo); location.hash = "#control"; Sesion.recargar(); });
        const soporte = el("button", { type: "button", class: `btn btn-sm ${soporteVigente ? "btn-outline-danger" : "btn-outline-light"}` },
          soporteVigente ? "Revocar soporte" : "Autorizar soporte 30 min");
        soporte.addEventListener("click", () => conEspera(soporte, async () => {
          try {
            if (soporteVigente) await this.#api.borrar(`/api/v1/mis-vehiculos/${v.id_vehiculo}/soporte`);
            else await this.#api.post(`/api/v1/mis-vehiculos/${v.id_vehiculo}/soporte`, { minutos: 30 });
            mensaje(salida, soporteVigente ? "Soporte revocado." : "El Administrador puede dar soporte a esta unidad durante 30 minutos.", "ok");
            setTimeout(() => this.#misVehiculos(), 900);
          } catch (e) { mensaje(salida, e.message, "error"); }
        }));
        return el("tr", {},
          el("td", {}, v.numero_serie, el("small", { class: "d-block text-secondary" }, v.nombre)),
          el("td", {}, v.modelo),
          el("td", {}, soporteVigente ? `Hasta ${fechaHora(v.soporte_hasta)}` : "No autorizado"),
          el("td", {}, el("div", { class: "acciones-fila" }, usar, soporte)));
      });
      zona.replaceChildren(
        el("h3", { class: "h6" }, icono("bi-truck-front"), " Mis vehículos"),
        el("div", { class: "tabla-envoltura admin-tabla" },
          el("table", { class: "tabla-historial" },
            el("caption", { class: "visually-hidden" }, "Mis vehículos"),
            el("thead", {}, el("tr", {}, ["Serie", "Modelo", "Soporte del Administrador", "Acciones"].map((h) => el("th", { scope: "col" }, h)))),
            el("tbody", {}, filas.length ? filas : el("tr", {}, el("td", { colspan: 4, class: "fila-mensaje" }, "Aún no tienes unidades asignadas."))))),
        salida,
        el("p", { class: "small text-secondary" },
          "Solo tú puedes operar y monitorear tus unidades. El Administrador solo puede entrar si autorizas soporte."));
    } catch (e) {
      zona.replaceChildren(el("p", { class: "form-msg", dataset: { tipo: "error" } }, e.message));
    }
  }

  #demos() {
    const zona = document.getElementById("cuentaDemos");
    const editor = el("div");
    zona.replaceChildren(el("h3", { class: "h6 mt-3" }, icono("bi-collection-play"), " Mis demos (privadas)"),
      el("p", { class: "small text-secondary" }, "Se guardan en Amazon RDS y solo tú las ves. Se ejecutan desde CONTROL → Secuencias DEMO."),
      editor);
    new EditorDemos({ api: this.#api, raiz: editor, idVehiculo: VEHICULO_ID, tipo: "PRIVADA", alGuardar: this.#alCambiarDemos }).iniciar();
  }
}
