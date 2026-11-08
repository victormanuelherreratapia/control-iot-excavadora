// =====================================================================
// Clase SesionOperador: guarda la clave de operación (X-API-Key)
// SOLO en esta pestaña (sessionStorage). Nunca va en el código.
// =====================================================================

export class SesionOperador {
  static #LLAVE = "excavadora_clave_operacion";
  #clave = "";
  #oyentes = new Set();

  constructor() {
    try { this.#clave = sessionStorage.getItem(SesionOperador.#LLAVE) || ""; } catch { this.#clave = ""; }
  }

  get clave() { return this.#clave; }
  get tieneClave() { return this.#clave.length > 0; }

  establecer(valor) {
    this.#clave = String(valor ?? "").trim();
    try {
      if (this.#clave) sessionStorage.setItem(SesionOperador.#LLAVE, this.#clave);
      else sessionStorage.removeItem(SesionOperador.#LLAVE);
    } catch { /* sin almacenamiento: la clave queda solo en memoria */ }
    this.#oyentes.forEach((fn) => fn(this.tieneClave));
  }

  borrar() { this.establecer(""); }

  alCambiar(fn) { this.#oyentes.add(fn); }
}
