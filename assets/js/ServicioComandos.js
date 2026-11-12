// =====================================================================
// Clase ServicioComandos: servicio ÚNICO de envío (joystick y botones)
// - Valida contra el catálogo real de la API
// - Una solicitud a la vez; en ráfagas solo se envía la más reciente
// - DETENER tiene prioridad: salta la cola y cancela la DEMO si existe
// - Respuestas tardías de órdenes anteriores se ignoran (secuencia)
// - Correlaciona la respuesta HTTP con el evento WSS
// =====================================================================
import { CONFIG, COMANDO_DETENER, etiquetaComando } from "./config.js";

export class ServicioComandos {
  #api;
  #ui;
  #catalogo = new Map();
  #recientes = [];        // últimos eventos MOVIMIENTO_INDIVIDUAL recibidos
  #secuencia = 0;
  #enVuelo = false;
  #pendiente = null;
  #espera = null;

  #demoActiva = () => false;
  #cancelarDemo = async () => {};
  #alRechazo = () => {};

  constructor({ api, ui }) {
    this.#api = api;
    this.#ui = ui;
  }

  configurar({ estaDemoActiva, cancelarDemo, alRechazo }) {
    this.#demoActiva = estaDemoActiva;
    this.#cancelarDemo = cancelarDemo;
    this.#alRechazo = alRechazo;
  }

  cargarCatalogo(lista) {
    this.#catalogo.clear();
    for (const c of lista) {
      if (c && (Number(c.activo) === 1 || c.activo === true) && typeof c.nombre === "string") {
        this.#catalogo.set(c.nombre, c);
      }
    }
  }

  existe(nombre) { return this.#catalogo.has(nombre); }

  async solicitar(nombre, fuente = "botón") {
    if (!this.#catalogo.has(nombre)) {
      this.#ui.aviso(`El comando ${nombre} no está en el catálogo del vehículo.`, "error");
      return;
    }
    if (nombre === COMANDO_DETENER) {
      await this.#detener(fuente);
      return;
    }
    if (this.#demoActiva()) {
      this.#ui.aviso("Hay una DEMO en ejecución: cancélala o pulsa DETENER.", "alerta");
      return;
    }
    if (this.#enVuelo) {          // evita ráfagas: se conserva solo la orden más reciente
      this.#pendiente = { nombre, fuente };
      return;
    }
    this.#enVuelo = true;
    try {
      await this.#enviar(nombre, fuente);
      while (this.#pendiente && !this.#demoActiva()) {
        const p = this.#pendiente;
        this.#pendiente = null;
        await this.#enviar(p.nombre, p.fuente);
      }
    } finally {
      this.#enVuelo = false;
      this.#pendiente = null;
    }
  }

  /** Recibe eventos WSS para confirmar la última orden. */
  recibirEvento(evt) {
    if (evt.evento !== "MOVIMIENTO_INDIVIDUAL") return;
    const copia = { ...evt, _recibido: Date.now() };
    this.#recientes.push(copia);
    if (this.#recientes.length > 10) this.#recientes.shift();
    if (this.#espera && ServicioComandos.#coincide(copia, this.#espera)) this.#confirmarEvento();
  }

  // ---------------- Envío ----------------
  async #enviar(nombre, fuente) {
    const cmd = this.#catalogo.get(nombre);
    const miSecuencia = ++this.#secuencia;
    const desde = Date.now();
    this.#cancelarEspera();
    this.#ui.iniciarAccion(`${etiquetaComando(nombre)} · código ${cmd.codigo} · ${fuente}`);
    this.#ui.marcarBoton(nombre, "is-enviando");
    try {
      const r = await this.#api.moverIndividual(cmd.id_comando);
      if (miSecuencia !== this.#secuencia) {         // otra orden (o DETENER) la reemplazó
        this.#ui.limpiarBoton(nombre);
        return;
      }
      this.#ui.fijarEtapa("api", "ok");
      this.#ui.marcarBoton(nombre, "is-aceptado");
      this.#esperarEvento(miSecuencia, cmd, r?.evento?.timestamp, desde);
    } catch (e) {
      if (miSecuencia !== this.#secuencia) {
        this.#ui.limpiarBoton(nombre);
        return;
      }
      this.#manejarError(e, nombre);
    }
  }

  async #detener(fuente) {
    this.#pendiente = null;
    const miSecuencia = ++this.#secuencia;           // invalida respuestas tardías
    const desde = Date.now();
    this.#cancelarEspera();
    const cmd = this.#catalogo.get(COMANDO_DETENER);
    this.#ui.iniciarAccion(`DETENER · código ${cmd.codigo} · ${fuente}`);

    const habiaDemo = this.#demoActiva();
    if (habiaDemo) {
      try { await this.#cancelarDemo(); } catch { /* se intenta detener de todos modos */ }
    }

    try {
      let r;
      try {
        r = await this.#api.moverIndividual(cmd.id_comando);
      } catch (e) {
        if (e.status === 409 && habiaDemo) {       // la DEMO aún se estaba cerrando
          await new Promise((ok) => setTimeout(ok, 700));
          r = await this.#api.moverIndividual(cmd.id_comando);
        } else {
          throw e;
        }
      }
      if (miSecuencia !== this.#secuencia) return;
      this.#ui.fijarEtapa("api", "ok");
      this.#esperarEvento(miSecuencia, cmd, r?.evento?.timestamp, desde);
    } catch (e) {
      if (miSecuencia !== this.#secuencia) return;
      this.#manejarError(e, COMANDO_DETENER);
    }
  }

  #manejarError(e, nombre) {
    this.#ui.fijarEtapa("api", "error");
    this.#ui.marcarBoton(nombre, "is-error");
    this.#ui.aviso(e.message, "error");
    if (e.status === 401) this.#alRechazo();
  }

  // ---------------- Correlación con el evento WSS ----------------
  static #coincide(evt, esp) {
    if (Number(evt.id_comando) !== Number(esp.idComando)) return false;
    if (esp.timestamp && evt.timestamp) return evt.timestamp === esp.timestamp;
    return evt._recibido >= esp.desde;
  }

  #esperarEvento(miSecuencia, cmd, timestamp, desde) {
    this.#ui.fijarEtapa("evento", "pendiente");
    this.#espera = { secuencia: miSecuencia, idComando: cmd.id_comando, timestamp: timestamp ?? null, desde, temporizador: null };

    // El evento WSS pudo llegar antes que la respuesta HTTP
    if (this.#recientes.some((evt) => ServicioComandos.#coincide(evt, this.#espera))) {
      this.#confirmarEvento();
      return;
    }
    this.#espera.temporizador = setTimeout(() => {
      if (this.#espera?.secuencia !== miSecuencia) return;
      this.#espera = null;
      this.#ui.fijarEtapa("evento", "error");
      this.#ui.aviso("La API aceptó la orden, pero no llegó el evento WSS a este navegador.", "alerta");
    }, CONFIG.EVENTO_ESPERA_MS);
  }

  #confirmarEvento() {
    if (this.#espera?.temporizador) clearTimeout(this.#espera.temporizador);
    this.#espera = null;
    this.#ui.fijarEtapa("evento", "ok");
  }

  #cancelarEspera() {
    if (this.#espera?.temporizador) clearTimeout(this.#espera.temporizador);
    this.#espera = null;
  }
}
