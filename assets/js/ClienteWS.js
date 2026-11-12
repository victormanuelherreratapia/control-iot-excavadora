// =====================================================================
// Clase ClienteWS: conexión WSS del NAVEGADOR con AWS, con reconexión.
// "En línea" = este navegador está conectado; NO el vehículo físico.
// =====================================================================
import { CONFIG } from "./config.js";

export class ClienteWS {
  #url;
  #ws = null;
  #intentos = 0;
  #temporizador = null;
  #onEstado;
  #onMensaje;

  constructor(url, { onEstado, onMensaje }) {
    this.#url = url;
    this.#onEstado = onEstado;
    this.#onMensaje = onMensaje;
  }

  conectar() {
    clearTimeout(this.#temporizador);
    if (this.#ws && (this.#ws.readyState === WebSocket.OPEN || this.#ws.readyState === WebSocket.CONNECTING)) return;

    this.#onEstado(this.#intentos > 0 ? "reconectando" : "conectando");

    let ws;
    try {
      ws = new WebSocket(this.#url);
    } catch {
      this.#programarReconexion();
      return;
    }
    this.#ws = ws;

    ws.addEventListener("open", () => {
      this.#intentos = 0;
      this.#onEstado("en-linea");
    });

    ws.addEventListener("message", (ev) => {
      if (typeof ev.data !== "string") return;
      let datos;
      try { datos = JSON.parse(ev.data); } catch { return; }   // datos remotos no confiables
      if (datos && typeof datos === "object" && !Array.isArray(datos)) this.#onMensaje(datos);
    });

    ws.addEventListener("close", () => {
      if (this.#ws !== ws) return;
      this.#ws = null;
      this.#onEstado("desconectado");
      this.#programarReconexion();
    });

    ws.addEventListener("error", () => { /* "close" gestiona la reconexión */ });
  }

  forzarCierre() {
    if (this.#ws) this.#ws.close();
  }

  reconectarYa() {
    if (this.#ws) return;
    this.#intentos = Math.max(this.#intentos, 1);
    this.conectar();
  }

  #programarReconexion() {
    clearTimeout(this.#temporizador);
    this.#intentos += 1;
    const espera = Math.min(
      CONFIG.WS_RECONEXION_MAX_MS,
      CONFIG.WS_RECONEXION_MIN_MS * 2 ** Math.min(this.#intentos - 1, 4),
    );
    this.#temporizador = setTimeout(() => this.conectar(), espera);
  }
}
