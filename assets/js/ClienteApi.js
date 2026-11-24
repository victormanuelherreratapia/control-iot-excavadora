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
  #token;
  #alNoAutorizado;

  /**
   * @param {{ baseUrl: string, idVehiculo: number, token?: () => string, alNoAutorizado?: (e: ApiError) => void }} op
   *   token: función que devuelve el token de la sesión (se envía como Authorization: Bearer)
   *   alNoAutorizado: se llama cuando la API responde 401 (sesión vencida o revocada)
   */
  constructor({ baseUrl, idVehiculo, token = () => "", alNoAutorizado = () => {} }) {
    this.#baseUrl = baseUrl;
    this.#idVehiculo = idVehiculo;
    this.#token = token;
    this.#alNoAutorizado = alNoAutorizado;
  }

  get idVehiculo() { return this.#idVehiculo; }

  // ---------------- Métodos genéricos (ADMINISTRACIÓN, cuenta, invitado) ----------------
  get(ruta, op = {})            { return this.#solicitar(ruta, op); }
  post(ruta, cuerpo, op = {})   { return this.#solicitar(ruta, { ...op, metodo: "POST", cuerpo }); }
  put(ruta, cuerpo, op = {})    { return this.#solicitar(ruta, { ...op, metodo: "PUT", cuerpo }); }
  patch(ruta, cuerpo, op = {})  { return this.#solicitar(ruta, { ...op, metodo: "PATCH", cuerpo }); }
  borrar(ruta, op = {})         { return this.#solicitar(ruta, { ...op, metodo: "DELETE" }); }

  login(correo, password) {
    return this.#solicitar(ENDPOINTS.login(), { metodo: "POST", cuerpo: { correo, password }, sinSesion: true });
  }
  iniciarInvitado(idVehiculo, alias) {
    return this.#solicitar(ENDPOINTS.invitado(), { metodo: "POST", cuerpo: { id_vehiculo: idVehiculo, alias }, sinSesion: true });
  }
  catalogo() { return this.#solicitar(ENDPOINTS.catalogo(), { sinSesion: true }); }
  saludRds() { return this.#solicitar(ENDPOINTS.saludRds(), { timeoutMs: CONFIG.TIMEOUT_SALUD_MS, sinSesion: true }); }

  // ---------------- Consultas (GET) ----------------
  salud()    { return this.#solicitar(ENDPOINTS.salud(), { timeoutMs: CONFIG.TIMEOUT_SALUD_MS, sinSesion: true }); }
  vehiculo() { return this.#solicitar(ENDPOINTS.vehiculo(this.#idVehiculo)); }
  comandos() { return this.#solicitar(ENDPOINTS.comandos(this.#idVehiculo)); }
  demos()    { return this.#solicitar(ENDPOINTS.demos(this.#idVehiculo)); }
  /** Últimos movimientos INDIVIDUALES persistidos en RDS (sp_obtener_historial, máx. 10). */
  historial() { return this.#solicitar(ENDPOINTS.historial(this.#idVehiculo)); }
  /** GET existente que ejecuta sp_obtener_estado en RDS (sirve como diagnóstico indirecto). */
  estado()   { return this.#solicitar(ENDPOINTS.estado(this.#idVehiculo), { timeoutMs: CONFIG.TIMEOUT_SALUD_MS }); }

  // ---------------- Acciones de control (POST públicos de la API) ----------------
  moverIndividual(idComando) {
    return this.#solicitar(ENDPOINTS.movimiento(), {
      metodo: "POST",
      cuerpo: { id_vehiculo: this.#idVehiculo, id_comando: idComando, origen: CONFIG.ORIGEN },
    });
  }

  iniciarDemo(idDemo) {
    return this.#solicitar(ENDPOINTS.iniciarDemo(this.#idVehiculo, idDemo), {
      metodo: "POST",
      cuerpo: { id_vehiculo: this.#idVehiculo, id_comando: 0, origen: CONFIG.ORIGEN },
    });
  }

  cancelarDemo() {
    return this.#solicitar(ENDPOINTS.cancelarDemo(this.#idVehiculo), { metodo: "POST" });
  }

  // ---------------- Núcleo HTTP ----------------
  async #solicitar(ruta, { metodo = "GET", cuerpo, timeoutMs = CONFIG.TIMEOUT_MS, sinSesion = false } = {}) {
    const headers = { Accept: "application/json" };
    if (cuerpo !== undefined) headers["Content-Type"] = "application/json";
    const token = sinSesion ? "" : this.#token();
    if (token) headers.Authorization = `Bearer ${token}`;

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
      const error = new ApiError(ClienteApi.#mensajeHttp(respuesta.status, datos), { status: respuesta.status, detalle: datos });
      if (respuesta.status === 401 && !sinSesion && token) this.#alNoAutorizado(error);
      throw error;
    }
    return datos;
  }

  static #mensajeHttp(status, datos) {
    const detalle = datos && typeof datos === "object" && typeof datos.detail === "string" ? datos.detail : "";
    if (status === 401) return detalle || "Sesión no válida o expirada (401).";
    if (status === 403) return detalle || "No tienes permiso para esta operación (403).";
    if (status === 404) return detalle || "Recurso no encontrado (404).";
    if (status === 409) return detalle || "Operación en conflicto (409).";
    if (status === 429) return detalle || "Demasiadas solicitudes (429). Espera un momento.";
    if (status === 422) {
      if (detalle) return detalle;
      const lista = datos && Array.isArray(datos.detail) ? datos.detail : [];
      return lista.length ? `Datos no válidos: ${lista.map((d) => d.msg).join("; ")}` : "La API no aceptó los datos enviados (422).";
    }
    if (status >= 500) return `Error interno del servidor (${status}).`;
    return detalle || `Error HTTP ${status}.`;
  }
}
