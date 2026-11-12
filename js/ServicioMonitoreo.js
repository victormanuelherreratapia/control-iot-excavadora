// =====================================================================
// Clase ServicioMonitoreo: último movimiento + 10 movimientos en tiempo real
//
//  REST  → carga inicial, resincronización al reconectar el WSS y al
//          volver a la vista, y confirmación del historial persistido.
//  WSS   → DISPARA la actualización inmediata (no hay polling del historial).
//
//  Reglas:
//  - Solo eventos del vehículo propio (lo filtra AplicacionControl).
//  - Una respuesta REST vieja nunca reemplaza un dato más nuevo
//    (número de solicitud + comparación de marcas de tiempo).
//  - Los pasos de DEMO actualizan la tarjeta, pero NO la tabla: la DEMO
//    no se guarda en el historial individual.
//  - La tabla se reconstruye solo con lo que devuelve GET /historial
//    (RDS): sin filas locales inventadas, sin duplicados (id_historial),
//    ordenada del más nuevo al más antiguo y con 10 filas como máximo.
// =====================================================================
import { CONFIG } from "./config.js";
import { FechaHora } from "./FechaHora.js";

export class ServicioMonitoreo {
  #api;
  #vista;
  #marcaUltimo = null;          // ms de la marca del último movimiento mostrado
  #solicitudEstado = 0;
  #solicitudHistorial = 0;
  #historialEnCurso = false;
  #historialPendiente = false;
  #esperaHistorial = null;
  #tieneDatos = false;

  constructor({ api, vista }) {
    this.#api = api;
    this.#vista = vista;
  }

  /** Carga inicial por REST (estado + historial). */
  iniciar() {
    this.#vista.ultimoSinDatos("Cargando…");
    this.#vista.historialCargando();
    this.sincronizar("carga inicial");
  }

  /** Vuelve a consultar estado e historial (reconexión, volver a la vista, botón). */
  sincronizar(motivo) {
    this.#cargarEstado(motivo);
    this.#cargarHistorial(motivo);
  }

  /** Se llamó al perder la conexión WSS: el último valor queda marcado como "conocido". */
  sinConexion() {
    if (this.#tieneDatos) this.#vista.avisoUltimo("Último valor conocido · sin datos actualizados mientras el WebSocket está desconectado.");
    this.#vista.estadoSincronizacion("WebSocket desconectado: la tabla puede no estar al día.", "alerta");
  }

  // ---------------- Eventos en vivo (WSS) ----------------
  recibirEvento(evt) {
    switch (evt.evento) {
      case "MOVIMIENTO_INDIVIDUAL":
        if (typeof evt.comando !== "string") return;
        this.#aplicarUltimo({
          comando: evt.comando,
          codigo: evt.codigo_comando ?? null,
          marca: evt.timestamp ?? null,
          origen: "wss",
        });
        // El evento confirma que AWS lo publicó; el registro se confirma consultando RDS.
        this.#vista.estadoSincronizacion("Evento recibido · confirmando historial en RDS…", "pendiente");
        this.#programarHistorial();
        break;

      case "DEMO_MOVIMIENTO":
        if (typeof evt.comando !== "string") return;
        this.#aplicarUltimo({
          comando: evt.comando,
          codigo: evt.codigo_comando ?? null,
          marca: evt.timestamp ?? null,
          origen: "demo",
          detalle: `Paso ${evt.orden ?? "?"} de la DEMO · ${evt.duracion_ms ?? "?"} ms`,
        });
        break;

      case "DEMO_INICIO":
        this.#vista.avisoUltimo("DEMO en ejecución: sus pasos se muestran aquí, pero no se agregan a la tabla.");
        break;

      case "DEMO_FIN":
      case "DEMO_CANCELADA":
        this.#vista.avisoUltimo(evt.evento === "DEMO_FIN" ? "DEMO finalizada." : "DEMO cancelada.");
        this.#programarHistorial();     // confirma que el historial no cambió con la DEMO
        break;

      default:
        break;
    }
  }

  // ---------------- Último movimiento ----------------
  #aplicarUltimo(datos) {
    const ms = FechaHora.aMs(datos.marca);
    // Un dato más viejo que el mostrado no lo reemplaza (eventos o respuestas atrasadas)
    if (ms !== null && this.#marcaUltimo !== null && ms < this.#marcaUltimo) return false;
    if (ms !== null) this.#marcaUltimo = ms;
    this.#tieneDatos = true;
    this.#vista.mostrarUltimo(datos);
    if (datos.origen !== "demo") this.#vista.avisoUltimo("");
    return true;
  }

  async #cargarEstado(motivo) {
    const miSolicitud = ++this.#solicitudEstado;
    try {
      const e = await this.#api.estado();
      if (miSolicitud !== this.#solicitudEstado) return;          // llegó otra más nueva
      if (!e || typeof e !== "object" || typeof e.comando !== "string") {
        if (!this.#tieneDatos) this.#vista.ultimoSinDatos("Sin movimientos");
        return;
      }
      if (Number(e.id_vehiculo) !== CONFIG.VEHICULO_ID) return;
      this.#aplicarUltimo({
        comando: e.comando,
        codigo: e.codigo ?? null,
        marca: e.fecha_actualizacion ?? null,
        origen: "rds",
      });
    } catch (err) {
      if (miSolicitud !== this.#solicitudEstado) return;
      if (!this.#tieneDatos) this.#vista.ultimoSinDatos("Sin datos actualizados");
      else this.#vista.avisoUltimo(`Último valor conocido · no se pudo actualizar (${err.message})`);
    }
  }

  // ---------------- Historial (10 movimientos persistidos) ----------------
  /** Agrupa ráfagas de eventos (p. ej. mantener presionado) en una sola consulta. */
  #programarHistorial() {
    clearTimeout(this.#esperaHistorial);
    this.#esperaHistorial = setTimeout(() => this.#cargarHistorial("evento WSS"), CONFIG.HISTORIAL_ESPERA_MS);
  }

  async #cargarHistorial(motivo) {
    // Nunca dos consultas a la vez: si hay una en curso, se repite al terminar
    if (this.#historialEnCurso) { this.#historialPendiente = true; return; }
    this.#historialEnCurso = true;
    const miSolicitud = ++this.#solicitudHistorial;
    try {
      const lista = await this.#api.historial();
      if (miSolicitud !== this.#solicitudHistorial) return;
      if (!Array.isArray(lista)) throw new Error("respuesta inesperada");

      // Solo registros válidos del vehículo propio, sin duplicados, del más nuevo al más antiguo
      const vistos = new Set();
      const registros = lista
        .filter((r) => r && Number(r.id_vehiculo) === CONFIG.VEHICULO_ID && Number.isFinite(Number(r.id_historial)))
        .filter((r) => !vistos.has(r.id_historial) && vistos.add(r.id_historial))
        .sort((a, b) => Number(b.id_historial) - Number(a.id_historial))
        .slice(0, CONFIG.HISTORIAL_MAX);

      this.#vista.mostrarHistorial(registros);
      const hora = new Date().toLocaleTimeString("es-MX", { hour12: false });
      this.#vista.estadoSincronizacion(`Sincronizado con RDS a las ${hora} (${motivo}) · ${registros.length} de ${CONFIG.HISTORIAL_MAX}`, "ok");
    } catch (err) {
      if (miSolicitud !== this.#solicitudHistorial) return;
      this.#vista.historialError("Error al consultar el historial.");
      this.#vista.estadoSincronizacion(`Error al sincronizar: ${err.message}`, "error");
    } finally {
      this.#historialEnCurso = false;
      if (this.#historialPendiente) {
        this.#historialPendiente = false;
        this.#cargarHistorial("evento WSS");
      }
    }
  }
}
