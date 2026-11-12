// =====================================================================
// Clase FechaHora: interpreta las marcas de tiempo REALES del backend y
// las muestra en la zona horaria local. Nunca fabrica una fecha.
//
//  RDS devuelve "2026-11-11T18:31:06" (sin zona) y guarda en UTC.
//  Los eventos WSS traen "2026-10-30T18:17:11.844212" (microsegundos).
// =====================================================================
import { CONFIG } from "./config.js";

export class FechaHora {
  static #fecha = new Intl.DateTimeFormat("es-MX", {
    timeZone: CONFIG.ZONA_LOCAL, day: "2-digit", month: "2-digit", year: "numeric",
  });
  static #hora = new Intl.DateTimeFormat("es-MX", {
    timeZone: CONFIG.ZONA_LOCAL, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });

  /**
   * Convierte el texto del backend a milisegundos (o null si no es válido).
   * Si no trae zona, se interpreta como CONFIG.ZONA_SERVIDOR (UTC).
   */
  static aMs(texto) {
    if (typeof texto !== "string") return null;
    const m = texto.trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/);
    if (!m) return null;
    const fraccion = m[3] ? m[3].slice(0, 4) : "";                 // JS solo admite milisegundos
    const zona = m[4] ?? (CONFIG.ZONA_SERVIDOR === "UTC" ? "Z" : "");
    const ms = Date.parse(`${m[1]}T${m[2]}${fraccion}${zona}`);
    return Number.isNaN(ms) ? null : ms;
  }

  /** { fecha: "11/11/2026", hora: "12:31:06" } o null si el dato no es válido. */
  static formatear(texto) {
    const ms = FechaHora.aMs(texto);
    if (ms === null) return null;
    const d = new Date(ms);
    return { fecha: FechaHora.#fecha.format(d), hora: FechaHora.#hora.format(d), ms };
  }
}
