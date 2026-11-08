// =====================================================================
// Clase PanelEstado: tres indicadores independientes
// (WebSocket WSS, API AWS y Amazon RDS).
// =====================================================================
import { CONFIG } from "./config.js";

export class PanelEstado {
  static #TEXTOS = {
    "en-linea": "En línea",
    "conectando": "Conectando",
    "reconectando": "Reconectando",
    "desconectado": "Desconectado",
    "disponible": "Disponible",
    "comprobando": "Comprobando",
    "no-disponible": "No disponible",
    "sin-verificar": "Sin verificar",
  };

  #cliente;
  #comprobando = false;
  #comprobandoRds = false;
  #primera = true;

  /** @param {import("./ClienteApi.js").ClienteApi} cliente */
  constructor(cliente) {
    this.#cliente = cliente;
  }

  iniciar() {
    this.fijar("estadoRds", "comprobando", "Consultando RDS a través de la API…");
    this.comprobarApi();
    this.comprobarRds();
    setInterval(() => this.comprobarApi(), CONFIG.SALUD_INTERVALO_MS);
    setInterval(() => this.comprobarRds(), CONFIG.RDS_INTERVALO_MS);
    window.addEventListener("online", () => { this.comprobarApi(); this.comprobarRds(); });
    window.addEventListener("offline", () => this.fijar("estadoApi", "no-disponible", "Sin conexión a Internet"));
    document.addEventListener("visibilitychange", () => { if (!document.hidden) this.comprobarApi(); });
  }

  /** Estado del WebSocket del navegador (NO del vehículo físico). */
  fijarWebSocket(estado) {
    this.fijar("estadoWs", estado, CONFIG.WS_URL);
  }

  fijar(idChip, estado, detalle = "") {
    const chip = document.getElementById(idChip);
    if (!chip) return;
    chip.dataset.estado = estado === "reconectando" ? "conectando" : estado;
    chip.querySelector(".status-value").textContent = PanelEstado.#TEXTOS[estado] ?? estado;
    chip.title = detalle;
  }

  // API AWS: GET / documentado ("Root"). Indica disponibilidad del servicio,
  // no que las 21 operaciones se hayan ejecutado.
  async comprobarApi() {
    if (this.#comprobando) return;
    this.#comprobando = true;
    const chip = document.getElementById("estadoApi");
    if (this.#primera || chip.dataset.estado !== "disponible") {
      this.fijar("estadoApi", "comprobando", "Consultando GET / en AWS…");
    }
    try {
      const r = await this.#cliente.salud();
      const ok = r && typeof r === "object" && typeof r.mensaje === "string";
      this.fijar("estadoApi", ok ? "disponible" : "no-disponible",
        ok ? `GET / respondió: ${r.mensaje}` : "GET / devolvió una respuesta inesperada");
    } catch (e) {
      this.fijar("estadoApi", "no-disponible", e.message);
    } finally {
      this.#comprobando = false;
      this.#primera = false;
    }
  }

  // Amazon RDS: no hay una ruta de diagnóstico dedicada (se conservan las 21 APIs),
  // así que se usa una consulta EXISTENTE que obligatoriamente pasa por RDS:
  // GET /vehiculos/{id}/estado → sp_obtener_estado. El navegador nunca se
  // conecta a MySQL ni ve credenciales; quien consulta RDS es la API en EC2.
  //   200 con datos       → Disponible (RDS respondió)
  //   500 / 502 / 503     → No disponible (la API está viva pero RDS falló)
  //   sin red / timeout   → Sin verificar (no se puede culpar a RDS sin evidencia)
  async comprobarRds() {
    if (this.#comprobandoRds) return;
    this.#comprobandoRds = true;
    try {
      const r = await this.#cliente.estado();
      const ok = r !== null && typeof r === "object";
      this.fijar("estadoRds", ok ? "disponible" : "sin-verificar",
        ok ? "sp_obtener_estado respondió desde Amazon RDS (vía GET /vehiculos/1/estado)"
           : "Respuesta inesperada; no se puede confirmar RDS");
    } catch (e) {
      if ([500, 502, 503].includes(e.status)) {
        this.fijar("estadoRds", "no-disponible", `La API respondió ${e.status} al consultar RDS`);
      } else {
        this.fijar("estadoRds", "sin-verificar", "La API no respondió; no se puede comprobar RDS");
      }
    } finally {
      this.#comprobandoRds = false;
    }
  }
}
