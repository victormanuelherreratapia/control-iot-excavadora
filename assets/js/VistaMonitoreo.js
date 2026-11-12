// =====================================================================
// Clase VistaMonitoreo: dibuja la tarjeta del último movimiento y la
// tabla de los 10 movimientos. Solo se encarga del DOM; los datos le
// llegan de ServicioMonitoreo. Todo texto remoto se inserta con
// textContent (sin inyección en el DOM).
// =====================================================================
import { CATALOGO_UI, etiquetaComando } from "./config.js";
import { FechaHora } from "./FechaHora.js";

export class VistaMonitoreo {
  #$ = (id) => document.getElementById(id);
  #idsMostrados = new Set();
  #firmaTabla = "";

  // ---------------- Tarjeta del último movimiento ----------------
  /**
   * @param {object} d
   * @param {string} d.comando          nombre real del comando (p. ej. "AVANZAR")
   * @param {number|null} d.codigo      código real, si existe
   * @param {string|null} d.marca       fecha/hora del backend tal como llegó
   * @param {"rds"|"wss"|"demo"} d.origen de dónde viene el dato
   * @param {string} [d.detalle]        texto adicional (p. ej. paso de DEMO)
   */
  mostrarUltimo({ comando, codigo, marca, origen, detalle = "" }) {
    const tarjeta = this.#$("ultimoTarjeta");
    tarjeta.dataset.origen = origen;
    tarjeta.classList.remove("sin-datos");

    this.#$("ultimoIcono").className = `bi ${CATALOGO_UI[comando]?.icono ?? "bi-activity"}`;
    this.#$("ultimoNombre").textContent = etiquetaComando(comando);
    this.#$("ultimoComando").textContent = codigo !== null && codigo !== undefined ? `${comando} · código ${codigo}` : comando;

    const fh = FechaHora.formatear(marca);
    this.#$("ultimoFecha").textContent = fh ? fh.fecha : "Sin fecha del servidor";
    this.#$("ultimoHora").textContent = fh ? fh.hora : "—";

    const ORIGEN = {
      rds:  "Estado guardado en Amazon RDS (GET /estado)",
      wss:  "Evento en vivo por WebSocket",
      demo: "Paso de DEMO por WebSocket · no se guarda en el historial",
    };
    this.#$("ultimoOrigen").textContent = ORIGEN[origen] ?? origen;
    this.#$("ultimoDetalle").textContent = detalle;
    this.#animar(tarjeta);
  }

  ultimoSinDatos(texto) {
    const tarjeta = this.#$("ultimoTarjeta");
    tarjeta.classList.add("sin-datos");
    tarjeta.dataset.origen = "";
    this.#$("ultimoIcono").className = "bi bi-dash-circle";
    this.#$("ultimoNombre").textContent = texto;
    this.#$("ultimoComando").textContent = "";
    this.#$("ultimoFecha").textContent = "—";
    this.#$("ultimoHora").textContent = "—";
    this.#$("ultimoOrigen").textContent = "";
    this.#$("ultimoDetalle").textContent = "";
  }

  /** Aviso bajo la tarjeta, p. ej. "Último valor conocido (sin conexión)". */
  avisoUltimo(texto) {
    this.#$("ultimoAviso").textContent = texto;
  }

  // ---------------- Tabla de historial ----------------
  /** Dibuja hasta 10 registros persistidos. Solo toca el DOM si cambió algo. */
  mostrarHistorial(registros) {
    const firma = registros.map((r) => r.id_historial).join(",");
    if (firma === this.#firmaTabla) return false;          // sin cambios: no se redibuja
    const anteriores = this.#idsMostrados;
    const primeraVez = this.#firmaTabla === "";
    this.#firmaTabla = firma;
    this.#idsMostrados = new Set(registros.map((r) => r.id_historial));

    const cuerpo = this.#$("historialCuerpo");
    cuerpo.replaceChildren();

    if (!registros.length) {
      this.#filaMensaje("Sin movimientos registrados para este vehículo.");
      return true;
    }

    registros.forEach((r, i) => {
      const tr = document.createElement("tr");
      if (!primeraVez && !anteriores.has(r.id_historial)) tr.classList.add("fila-nueva");

      const fh = FechaHora.formatear(r.fecha_hora);
      const celdas = [
        String(i + 1),
        null,                                   // movimiento (con código debajo)
        fh ? fh.fecha : "Sin fecha",
        fh ? fh.hora : "—",
        String(r.id_historial),
      ];
      celdas.forEach((texto, c) => {
        const td = document.createElement(c === 1 ? "th" : "td");
        if (c === 1) {
          td.scope = "row";
          const nombre = document.createElement("span");
          nombre.className = "mov-nombre";
          nombre.textContent = etiquetaComando(r.comando);
          const codigo = document.createElement("small");
          codigo.textContent = `${r.comando} · ${r.codigo ?? "?"}`;
          td.append(nombre, codigo);
        } else {
          td.textContent = texto;
        }
        if (c === 0) td.className = "col-num";
        if (c === 4) td.className = "col-id";
        tr.append(td);
      });
      cuerpo.append(tr);
    });
    return true;
  }

  historialCargando() {
    if (this.#firmaTabla === "") this.#filaMensaje("Cargando movimientos desde la API…");
  }

  historialError(texto) {
    if (this.#firmaTabla === "") this.#filaMensaje(texto);
  }

  /** Estado de la sincronización (texto + color) bajo el título de la tabla. */
  estadoSincronizacion(texto, tipo = "ok") {
    const p = this.#$("historialEstado");
    p.textContent = texto;
    p.dataset.tipo = tipo;
  }

  #filaMensaje(texto) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "fila-mensaje";
    td.textContent = texto;
    tr.append(td);
    this.#$("historialCuerpo").replaceChildren(tr);
  }

  #animar(el) {
    el.classList.remove("destello");
    void el.offsetWidth;            // reinicia la animación
    el.classList.add("destello");
  }
}
