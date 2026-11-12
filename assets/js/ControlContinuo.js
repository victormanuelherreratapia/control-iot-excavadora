// =====================================================================
// Clase ControlContinuo: "mantener presionado" como en un control real.
// Mientras se sostiene el joystick o un botón de movimiento, repite la
// orden a un intervalo controlado; al soltar envía DETENER una sola vez.
//
// Regla de "un solo dueño": si ya hay algo presionado (p. ej. el joystick),
// un toque accidental en otro control se IGNORA. Solo el control que
// empezó el movimiento puede cambiar de dirección o soltarlo.
// =====================================================================

export class ControlContinuo {
  #solicitar;
  #detener;
  #intervaloMs;
  #nombre = null;
  #duenio = null;          // quién está presionando ("joystick", "botón:SUBIR_BRAZO", …)
  #temporizador = null;

  constructor({ solicitar, detener, intervaloMs }) {
    this.#solicitar = solicitar;
    this.#detener = detener;
    this.#intervaloMs = intervaloMs;
  }

  get activo() { return this.#nombre; }
  get duenio() { return this.#duenio; }

  /**
   * Empieza o cambia el movimiento sostenido.
   * @returns {boolean} false si otro control ya lo tiene tomado (toque ignorado)
   */
  mantener(nombre, duenio) {
    if (this.#duenio && this.#duenio !== duenio) return false;   // otro control ya lo tiene
    if (this.#nombre === nombre) return true;                    // misma dirección: no se duplica
    this.#detenerRepeticion();
    this.#nombre = nombre;
    this.#duenio = duenio;
    this.#solicitar(nombre, duenio);
    this.#temporizador = setInterval(() => {
      if (this.#nombre) this.#solicitar(this.#nombre, `${this.#duenio} (mantenido)`);
    }, this.#intervaloMs);
    return true;
  }

  /**
   * El control que presionó lo suelta: deja de repetir y envía DETENER.
   * @returns {boolean} true si realmente se soltó
   */
  soltar(duenio) {
    if (!this.#nombre || this.#duenio !== duenio) return false;
    this.#liberar();
    this.#detener(duenio);
    return true;
  }

  /** Suelta sin importar quién lo tenga (pérdida de foco, pestaña oculta). */
  soltarTodo(motivo) {
    if (!this.#nombre) return false;
    this.#liberar();
    this.#detener(motivo);
    return true;
  }

  /** Deja de repetir SIN enviar nada (DETENER ya enviado o inicia una DEMO). */
  cancelar() {
    this.#liberar();
  }

  #liberar() {
    this.#detenerRepeticion();
    this.#nombre = null;
    this.#duenio = null;
  }

  #detenerRepeticion() {
    clearInterval(this.#temporizador);
    this.#temporizador = null;
  }
}
