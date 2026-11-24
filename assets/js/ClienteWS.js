// =====================================================================
// Clase ClienteWS: conexión WSS del NAVEGADOR con AWS, con reconexión.
// "En línea" = este navegador está conectado; NO el vehículo físico.
//
// 4.3: la URL lleva el token de la sesión (?token=...). El servidor
// valida identidad y permiso sobre la unidad ANTES de aceptar el canal.
// Si rechaza la conexión, se avisa a la aplicación para que revise la
// sesión en lugar de reintentar sin fin.
// =====================================================================
import { CONFIG } from "./config.js";

export class ClienteWS {
  #url;
  #ws = null;
  #intentos = 0;
  #fallosSinAbrir = 0;
  #temporizador = null;
  #detenido = false;
  #onEstado;
  #onMensaje;
  #onRechazo;

  /** @param {string | (() => string)} url */
  constructor(url, { onEstado, onMensaje, onRechazo = () => {} }) {
    this.#url = url;
    this.#onEstado = onEstado;
    this.#onMensaje = onMensaje;
    this.#onRechazo = onRechazo;
  }

  conectar() {
    clearTimeout(this.#temporizador);
    if (this.#detenido) return;
    if (this.#ws && (this.#ws.readyState === WebSocket.OPEN || this.#ws.readyState === WebSocket.CONNECTING)) return;

    this.#onEstado(this.#intentos > 0 ? "reconectando" : "conectando");

    let ws;
    try {
      ws = new WebSocket(typeof this.#url === "function" ? this.#url() : this.#url);
    } catch {
      this.#programarReconexion();
      return;
    }
    this.#ws = ws;
    let abierto = false;

    ws.addEventListener("open", () => {
      abierto = true;
      this.#intentos = 0;
      this.#fallosSinAbrir = 0;
      this.#onEstado("en-linea");
    });

    ws.addEventListener("message", (ev) => {
      if (typeof ev.data !== "string") return;
      let datos;
      try { datos = JSON.parse(ev.data); } catch { return; }   // datos remotos no confiables
      if (datos && typeof datos === "object" && !Array.isArray(datos)) this.#onMensaje(datos);
    });

    ws.addEventListener("close", (ev) => {
      if (this.#ws !== ws) return;
      this.#ws = null;
      this.#onEstado("desconectado");
      // 4403 = acceso revocado por el servidor (cambio de dueño, logout, fin de prueba)
      if (ev.code === 4403 || ev.code === 1008) {
        this.#detenido = true;
        this.#onRechazo(ev.code);
        return;
      }
      // El servidor rechaza el handshake (sin permiso) y el navegador solo ve 1006
      if (!abierto && ++this.#fallosSinAbrir === 3) this.#onRechazo(ev.code);
      this.#programarReconexion();
    });

    ws.addEventListener("error", () => { /* "close" gestiona la reconexión */ });
  }

  /** Cierra y no vuelve a conectar (cerrar sesión o cambiar de unidad). */
  detener() {
    this.#detenido = true;
    clearTimeout(this.#temporizador);
    if (this.#ws) this.#ws.close(1000);
  }

  forzarCierre() {
    if (this.#ws) this.#ws.close();
  }

  reconectarYa() {
    if (this.#ws || this.#detenido) return;
    this.#intentos = Math.max(this.#intentos, 1);
    this.conectar();
  }

  #programarReconexion() {
    clearTimeout(this.#temporizador);
    if (this.#detenido) return;
    this.#intentos += 1;
    const espera = Math.min(
      CONFIG.WS_RECONEXION_MAX_MS,
      CONFIG.WS_RECONEXION_MIN_MS * 2 ** Math.min(this.#intentos - 1, 4),
    );
    this.#temporizador = setTimeout(() => this.conectar(), espera);
  }
}
