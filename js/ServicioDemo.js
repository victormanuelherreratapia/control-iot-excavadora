// =====================================================================
// Clase ServicioDemo: consultar, iniciar y cancelar las DEMO de RDS.
// La secuencia la ejecuta el backend; aquí solo se refleja su avance con
// los eventos WSS (DEMO_INICIO, DEMO_MOVIMIENTO, DEMO_FIN, DEMO_CANCELADA).
// =====================================================================
import { CONFIG, etiquetaComando } from "./config.js";

export class ServicioDemo {
  #api;
  #sesion;
  #ui;
  #enCurso = false;
  #iniciando = false;
  #cancelando = false;
  #total = null;
  #vigilante = null;
  #alCambiar = () => {};
  #alClaveInvalida = () => {};

  constructor({ api, sesion, ui }) {
    this.#api = api;
    this.#sesion = sesion;
    this.#ui = ui;
  }

  configurar({ alCambiarEstado, alClaveInvalida }) {
    this.#alCambiar = alCambiarEstado;
    this.#alClaveInvalida = alClaveInvalida;
  }

  get activa() { return this.#enCurso || this.#iniciando; }

  actualizarBotones() {
    const sel = document.getElementById("demoSelect");
    document.getElementById("btnIniciarDemo").disabled =
      this.activa || !this.#sesion.tieneClave || !sel.value || sel.disabled;
    document.getElementById("btnCancelarDemo").disabled =
      !this.activa || !this.#sesion.tieneClave || this.#cancelando;
  }

  async cargar() {
    const sel = document.getElementById("demoSelect");
    try {
      const lista = await this.#api.demos();
      const activas = Array.isArray(lista)
        ? lista.filter((d) => d && (Number(d.activo) === 1 || d.activo === true))
        : [];
      sel.replaceChildren();
      if (!activas.length) {
        sel.append(new Option("No hay DEMO registradas", ""));
        sel.disabled = true;
      } else {
        for (const d of activas) {
          const op = new Option(`${d.nombre} (ID ${d.id_demo})`, String(d.id_demo));
          if (typeof d.descripcion === "string") op.title = d.descripcion;
          sel.append(op);
        }
        sel.disabled = false;
      }
    } catch (e) {
      sel.replaceChildren(new Option("No se pudieron cargar las DEMO", ""));
      sel.disabled = true;
      this.#ui.aviso(e.message, "error");
    }
    this.actualizarBotones();
  }

  async iniciar() {
    if (this.activa) { this.#ui.aviso("Ya hay una DEMO en ejecución.", "alerta"); return; }
    if (!this.#sesion.tieneClave) { this.#ui.aviso("Escribe la clave de operación.", "alerta"); return; }
    const sel = document.getElementById("demoSelect");
    const idDemo = Number(sel.value);
    if (!idDemo) { this.#ui.aviso("Selecciona una DEMO.", "alerta"); return; }

    this.#iniciando = true;
    this.#total = null;
    this.#ui.progresoDemo(0);
    this.#ui.textoDemo("Solicitando inicio de la DEMO…");
    this.#ui.iniciarAccion(`DEMO · ${sel.selectedOptions[0]?.textContent ?? idDemo}`);
    this.#notificar();

    try {
      const r = await this.#api.iniciarDemo(idDemo);
      this.#ui.fijarEtapa("api", "ok");
      this.#ui.fijarEtapa("evento", "pendiente");
      this.#total = Number(r?.total_movimientos) || null;
      this.#enCurso = true;
      this.#ui.textoDemo(`DEMO iniciada${this.#total ? ` (${this.#total} movimientos)` : ""}. Esperando eventos WSS…`);
      this.#vigilar();
    } catch (e) {
      this.#ui.fijarEtapa("api", "error");
      if (e.status === 409) {
        this.#enCurso = true;     // ya hay una DEMO en el servidor: se permite cancelarla
        this.#ui.textoDemo("Ya hay una DEMO en ejecución en el servidor. Puedes cancelarla.");
        this.#vigilar();
        this.#ui.aviso(e.message, "alerta");
      } else {
        this.#ui.textoDemo("No se pudo iniciar la DEMO.");
        this.#ui.aviso(e.message, "error");
        if (e.status === 401) this.#alClaveInvalida();
      }
    } finally {
      this.#iniciando = false;
      this.#notificar();
    }
  }

  async cancelar() {
    if (!this.#sesion.tieneClave) { this.#ui.aviso("Escribe la clave de operación.", "alerta"); return; }
    this.#cancelando = true;
    this.actualizarBotones();
    try {
      await this.#api.cancelarDemo();
      this.#ui.textoDemo("Cancelación solicitada; esperando confirmación por WSS…");
      this.#ui.aviso("Cancelación enviada.", "ok");
    } catch (e) {
      this.#ui.aviso(e.message, "error");
      if (e.status === 401) this.#alClaveInvalida();
      if (e.status === 404 || e.status === 409) this.#terminar("No había una DEMO en ejecución en el servidor.", 0);
      throw e;
    } finally {
      this.#cancelando = false;
      this.actualizarBotones();
    }
  }

  recibirEvento(evt) {
    switch (evt.evento) {
      case "DEMO_INICIO":
        this.#enCurso = true;
        if (Number(evt.total_movimientos)) this.#total = Number(evt.total_movimientos);
        this.#ui.textoDemo("DEMO en ejecución…");
        this.#ui.fijarEtapa("evento", "ok");
        this.#vigilar();
        this.#notificar();
        break;

      case "DEMO_MOVIMIENTO": {
        this.#enCurso = true;
        const orden = Number(evt.orden) || 0;
        const t = this.#total;
        this.#ui.textoDemo(`Paso ${orden}${t ? `/${t}` : ""}: ${etiquetaComando(evt.comando)} · ${evt.duracion_ms ?? "?"} ms + pausa ${evt.pausa_ms ?? "?"} ms`);
        if (t) this.#ui.progresoDemo((orden / t) * 100);
        this.#ui.fijarEtapa("evento", "ok");
        this.#vigilar();
        this.#notificar();
        break;
      }

      case "DEMO_FIN":
        this.#terminar(`DEMO finalizada: ${evt.movimientos_ejecutados ?? "?"} movimientos ejecutados.`, 100);
        this.#ui.aviso("DEMO finalizada.", "ok");
        break;

      case "DEMO_CANCELADA":
        this.#terminar("DEMO cancelada.", 0);
        this.#ui.aviso("DEMO cancelada.", "alerta");
        break;

      default:
        break;
    }
  }

  #notificar() {
    this.actualizarBotones();
    this.#alCambiar();
  }

  #vigilar() {
    clearTimeout(this.#vigilante);
    this.#vigilante = setTimeout(() => {
      if (!this.#enCurso) return;
      this.#terminar("No llegaron eventos de la DEMO en 30 s; se liberó el control.", 0);
      this.#ui.aviso("La DEMO dejó de enviar eventos.", "alerta");
    }, CONFIG.DEMO_SIN_EVENTOS_MS);
  }

  #terminar(mensaje, pct) {
    this.#enCurso = false;
    this.#iniciando = false;
    this.#cancelando = false;
    clearTimeout(this.#vigilante);
    this.#ui.textoDemo(mensaje);
    this.#ui.progresoDemo(pct);
    this.#notificar();
  }
}
