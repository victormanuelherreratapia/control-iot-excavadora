// =====================================================================
// Clases ApiError y ClienteApi: Fetch + async/await, tiempo límite
// y manejo de errores HTTP contra la API real en AWS.
// =====================================================================
import { CONFIG, ENDPOINTS } from "./config.js";

export class ApiError extends Error {
  constructor(mensaje, { status = 0, tipo = "http", detalle = null } = {}) {
    super(mensaje);
    this.name = "ApiError";
    this.status = status;
    this.tipo = tipo;
    this.detalle = detalle;
  }
}

export class ClienteApi {
  #baseUrl;
  #idVehiculo;
  #sesion;

  /** @param {{ baseUrl: string, idVehiculo: number, sesion: import("./SesionOperador.js").SesionOperador }} op */
  constructor({ baseUrl, idVehiculo, sesion }) {
    this.#baseUrl = baseUrl;
    this.#idVehiculo = idVehiculo;
    this.#sesion = sesion;
  }

  // ---------------- Consultas (GET) ----------------
  salud()    { return this.#solicitar(ENDPOINTS.salud(), { timeoutMs: CONFIG.TIMEOUT_SALUD_MS }); }
  vehiculo() { return this.#solicitar(ENDPOINTS.vehiculo(this.#idVehiculo)); }
  comandos() { return this.#solicitar(ENDPOINTS.comandos(this.#idVehiculo)); }
  demos()    { return this.#solicitar(ENDPOINTS.demos(this.#idVehiculo)); }
  /** GET existente que ejecuta sp_obtener_estado en RDS (sirve como diagnóstico indirecto). */
  estado()   { return this.#solicitar(ENDPOINTS.estado(this.#idVehiculo), { timeoutMs: CONFIG.TIMEOUT_SALUD_MS }); }

  // ---------------- Acciones (POST con X-API-Key) ----------------
  moverIndividual(idComando) {
    return this.#solicitar(ENDPOINTS.movimiento(), {
      metodo: "POST", conClave: true,
      cuerpo: { id_vehiculo: this.#idVehiculo, id_comando: idComando, origen: CONFIG.ORIGEN },
    });
  }

  iniciarDemo(idDemo) {
    return this.#solicitar(ENDPOINTS.iniciarDemo(this.#idVehiculo, idDemo), {
      metodo: "POST", conClave: true,
      cuerpo: { id_vehiculo: this.#idVehiculo, id_comando: 0, origen: CONFIG.ORIGEN },
    });
  }

  cancelarDemo() {
    return this.#solicitar(ENDPOINTS.cancelarDemo(this.#idVehiculo), { metodo: "POST", conClave: true });
  }

  // ---------------- Núcleo HTTP ----------------
  async #solicitar(ruta, { metodo = "GET", cuerpo, conClave = false, timeoutMs = CONFIG.TIMEOUT_MS } = {}) {
    const headers = { Accept: "application/json" };
    if (cuerpo !== undefined) headers["Content-Type"] = "application/json";
    if (conClave) {
      if (!this.#sesion.tieneClave) {
        throw new ApiError("Escribe la clave de operación para enviar comandos.", { tipo: "sin-clave" });
      }
      headers["X-API-Key"] = this.#sesion.clave;
    }

    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), timeoutMs);

    let respuesta;
    try {
      respuesta = await fetch(this.#baseUrl + ruta, {
        method: metodo,
        headers,
        body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
        signal: controlador.signal,
        mode: "cors",
        cache: "no-store",
      });
    } catch {
      clearTimeout(temporizador);
      if (controlador.signal.aborted) throw new ApiError("La API no respondió a tiempo.", { tipo: "timeout" });
      throw new ApiError("No se pudo contactar la API (red o CORS).", { tipo: "red" });
    }
    clearTimeout(temporizador);

    let datos = null;
    try {
      const texto = await respuesta.text();
      if (texto) {
        try { datos = JSON.parse(texto); } catch { datos = texto; }
      }
    } catch { datos = null; }

    if (!respuesta.ok) {
      throw new ApiError(ClienteApi.#mensajeHttp(respuesta.status, datos), { status: respuesta.status, detalle: datos });
    }
    return datos;
  }

  static #mensajeHttp(status, datos) {
    const detalle = datos && typeof datos === "object" && typeof datos.detail === "string" ? datos.detail : "";
    if (status === 401) return "La API rechazó la clave de operación (401).";
    if (status === 404) return detalle || "Recurso no encontrado (404).";
    if (status === 409) return detalle || "Operación en conflicto (409).";
    if (status === 422) return "La API no aceptó los datos enviados (422).";
    if (status >= 500) return `Error interno del servidor (${status}).`;
    return detalle || `Error HTTP ${status}.`;
  }
}
