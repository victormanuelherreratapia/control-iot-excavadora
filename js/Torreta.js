// =====================================================================
// Clase Torreta: baliza de advertencia como la de la maquinaria real.
//   reposo        → verde fijo
//   movimiento    → ámbar girando
//   demo          → azul girando
//   paro          → rojo parpadeando
//   sin-conexion  → gris (WebSocket del navegador caído)
// Refleja lo que ESTA página ordenó; no confirma el movimiento físico.
// =====================================================================

export class Torreta {
  static #TEXTOS = {
    "reposo": "En reposo",
    "movimiento": "En movimiento",
    "demo": "DEMO en curso",
    "paro": "Paro activado",
    "sin-conexion": "Sin conexión",
  };

  #el;
  #texto;
  #base = "reposo";        // estado de fondo (reposo, demo o sin-conexion)
  #temporal = null;        // estado que se superpone (movimiento o paro)
  #temporizador = null;

  constructor(elemento, texto) {
    this.#el = elemento;
    this.#texto = texto;
    this.#pintar();
  }

  /** Estado de fondo: reposo, demo o sin-conexion. */
  fijarBase(estado) {
    this.#base = estado;
    this.#pintar();
  }

  /** Estado temporal. Si se indica ms, regresa solo al estado de fondo. */
  mostrar(estado, ms = 0) {
    clearTimeout(this.#temporizador);
    this.#temporal = estado;
    this.#pintar();
    if (ms > 0) this.#temporizador = setTimeout(() => this.volver(), ms);
  }

  /** Quita el estado temporal y vuelve al de fondo. */
  volver() {
    clearTimeout(this.#temporizador);
    this.#temporal = null;
    this.#pintar();
  }

  #pintar() {
    const estado = this.#temporal ?? this.#base;
    this.#el.dataset.estado = estado;
    this.#texto.textContent = Torreta.#TEXTOS[estado] ?? estado;
  }
}
