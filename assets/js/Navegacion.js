// =====================================================================
// Clase Navegacion: pestañas CONTROL / MONITOREO / ADMINISTRACIÓN dentro
// de la misma página. No recarga el documento ni crea otra conexión WSS:
// solo cambia la vista visible. La vista queda en la dirección (#monitoreo)
// para poder recargar sin perderla.
// Las pestañas que el rol no puede usar se ocultan, pero la seguridad
// real está en FastAPI (ocultar un botón no protege una API).
// =====================================================================

const PANELES = { monitoreo: "vistaMonitoreo", administracion: "vistaAdmin" };

export class Navegacion {
  #botones;
  #alCambiar;
  #actual = null;

  constructor({ alCambiar }) {
    this.#alCambiar = alCambiar;
    this.#botones = [...document.querySelectorAll(".vista-tab")];
    this.#botones.forEach((b) => {
      b.addEventListener("click", () => this.ir(b.dataset.vista));
      b.addEventListener("keydown", (e) => this.#teclado(e));
    });
    window.addEventListener("hashchange", () => this.ir(this.#desdeHash(), false));
  }

  get actual() { return this.#actual; }

  #visibles() {
    return this.#botones.filter((b) => !b.hidden);
  }

  iniciar() {
    this.ir(this.#desdeHash(), false);
  }

  ir(vista, actualizarHash = true) {
    const disponibles = this.#visibles().map((b) => b.dataset.vista);
    if (!disponibles.includes(vista)) vista = disponibles[0] ?? "control";
    if (vista === this.#actual) return;
    this.#actual = vista;
    document.body.classList.toggle("vista-monitoreo", vista === "monitoreo");
    document.body.classList.toggle("vista-administracion", vista === "administracion");
    for (const [nombre, id] of Object.entries(PANELES)) {
      const panel = document.getElementById(id);
      if (panel) panel.hidden = vista !== nombre;
    }
    this.#botones.forEach((b) => {
      const activa = b.dataset.vista === vista;
      b.classList.toggle("activa", activa);
      b.setAttribute("aria-selected", String(activa));
      b.tabIndex = activa ? 0 : -1;
    });
    if (actualizarHash) history.replaceState(null, "", `#${vista}`);
    this.#alCambiar(vista);
  }

  #desdeHash() {
    const h = location.hash.replace("#", "");
    return ["control", "monitoreo", "administracion"].includes(h) ? h : "control";
  }

  // Flechas izquierda/derecha entre pestañas (patrón accesible de tablist)
  #teclado(e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const visibles = this.#visibles();
    const i = visibles.indexOf(e.currentTarget);
    const siguiente = visibles[(i + (e.key === "ArrowRight" ? 1 : -1) + visibles.length) % visibles.length];
    siguiente.focus();
    this.ir(siguiente.dataset.vista);
  }
}
