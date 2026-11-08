// =====================================================================
// Clase ControlContinuo: "mantener presionado" como en un control real.
// Mientras se sostiene el joystick o un botón de movimiento, repite la
// orden a un intervalo controlado; al soltar envía DETENER una sola vez.
// =====================================================================

export class ControlContinuo {
  #solicitar;
  #detener;
  #intervaloMs;
  #nombre = null;
  #fuente = "";
  #temporizador = null;

  constructor({ solicitar, detener, intervaloMs }) {
    this.#solicitar = solicitar;
    this.#detener = detener;
    this.#intervaloMs = intervaloMs;
  }

  get activo() { return this.#nombre; }

  mantener(nombre, fuente) {
    if (this.#nombre === nombre) return;
    this.#detenerRepeticion();
    this.#nombre = nombre;
    this.#fuente = fuente;
    this.#solicitar(nombre, fuente);
    this.#temporizador = setInterval(() => {
      if (this.#nombre) this.#solicitar(this.#nombre, `${this.#fuente} (mantenido)`);
    }, this.#intervaloMs);
  }

  soltar(fuente) {
    if (!this.#nombre) return;
    this.#detenerRepeticion();
    this.#nombre = null;
    this.#detener(fuente);
  }

  cancelar() {
    this.#detenerRepeticion();
    this.#nombre = null;
  }

  #detenerRepeticion() {
    clearInterval(this.#temporizador);
    this.#temporizador = null;
  }
}
