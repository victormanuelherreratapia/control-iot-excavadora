// =====================================================================
// Clase Navegacion: pestañas CONTROL / MONITOREO dentro de la misma página.
// No recarga el documento ni crea otra conexión: solo cambia la vista
// visible. Recuerda la vista en la dirección (#monitoreo) para poder
// compartir el enlace o recargar sin perderla.
// =====================================================================

export class Navegacion {
  static #VISTAS = ["control", "monitoreo"];
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

  iniciar() {
    this.ir(this.#desdeHash(), false);
  }

  ir(vista, actualizarHash = true) {
    if (!Navegacion.#VISTAS.includes(vista) || vista === this.#actual) return;
    this.#actual = vista;
    document.body.classList.toggle("vista-monitoreo", vista === "monitoreo");
    document.getElementById("vistaMonitoreo").hidden = vista !== "monitoreo";
    this.#botones.forEach((b) => {
      const activa = b.dataset.vista === vista;
      b.classList.toggle("activa", activa);
      b.setAttribute("aria-selected", String(activa));
      b.tabIndex = activa ? 0 : -1;
    });
    if (actualizarHash) history.replaceState(null, "", vista === "monitoreo" ? "#monitoreo" : "#control");
    this.#alCambiar(vista);
  }

  #desdeHash() {
    return location.hash === "#monitoreo" ? "monitoreo" : "control";
  }

  // Flechas izquierda/derecha entre pestañas (patrón accesible de tablist)
  #teclado(e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = this.#botones.indexOf(e.currentTarget);
    const siguiente = this.#botones[(i + (e.key === "ArrowRight" ? 1 : -1) + this.#botones.length) % this.#botones.length];
    siguiente.focus();
    this.ir(siguiente.dataset.vista);
  }
}
