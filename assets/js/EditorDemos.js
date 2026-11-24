// =====================================================================
// Clase EditorDemos: crear y editar demos con pasos ordenados.
//   - Usuario: demos PRIVADAS de sus unidades.
//   - Administrador: demos de FÁBRICA de las unidades de la empresa.
// Los límites se validan aquí para avisar rápido, pero quien decide es
// FastAPI (mismos límites en el servidor).
// =====================================================================
import { etiquetaComando } from "./config.js";
import { el, icono, mensaje, conEspera } from "./Dom.js";

const LIMITES = { pasos: 20, minMs: 100, maxMs: 5000, maxPausa: 3000, total: 60000 };
const COD_DEMO_CONTROL = 12;

export class EditorDemos {
  #api;
  #raiz;
  #idVehiculo;
  #tipo;             // "PRIVADA" | "FABRICA"
  #alGuardar;
  #comandos = [];
  #demos = [];
  #pasos = [];
  #idEditando = null;
  #n = {};           // nodos del formulario

  constructor({ api, raiz, idVehiculo, tipo, alGuardar = () => {} }) {
    this.#api = api;
    this.#raiz = raiz;
    this.#idVehiculo = idVehiculo;
    this.#tipo = tipo;
    this.#alGuardar = alGuardar;
  }

  async iniciar() {
    this.#raiz.replaceChildren(el("p", { class: "small text-secondary" }, "Cargando comandos y demos…"));
    try {
      const [comandos, demos] = await Promise.all([
        this.#api.get(`/api/v1/vehiculos/${this.#idVehiculo}/comandos`),
        this.#api.get(`/api/v1/vehiculos/${this.#idVehiculo}/demos`),
      ]);
      this.#comandos = comandos.filter((c) => c.activo && Number(c.codigo) !== COD_DEMO_CONTROL);
      this.#demos = demos.filter((d) => d.tipo === this.#tipo);
      this.#dibujar();
      this.#nueva();
    } catch (e) {
      this.#raiz.replaceChildren(el("p", { class: "form-msg", dataset: { tipo: "error" } }, `No se pudo cargar: ${e.message}`));
    }
  }

  // ---------------- Interfaz ----------------
  #dibujar() {
    const n = this.#n;
    n.lista = el("select", { class: "form-select form-select-sm", id: `demoLista${this.#tipo}`, "aria-label": "Demo a editar" });
    n.lista.addEventListener("change", () => (n.lista.value ? this.#abrir(Number(n.lista.value)) : this.#nueva()));
    n.nombre = el("input", { class: "form-control", id: `demoNombre${this.#tipo}`, maxlength: 80, required: true, placeholder: "Ej. Rutina de carga" });
    n.descripcion = el("input", { class: "form-control", id: `demoDesc${this.#tipo}`, maxlength: 255, placeholder: "Opcional" });
    n.pasos = el("ol", { class: "pasos-demo", "aria-label": "Pasos de la demo" });
    n.total = el("p", { class: "small mb-2", "aria-live": "polite" });
    n.msg = el("p", { class: "form-msg", role: "status", "aria-live": "polite" });
    n.guardar = el("button", { type: "submit", class: "btn btn-warning fw-semibold" }, icono("bi-save"), " Guardar");
    n.cancelar = el("button", { type: "button", class: "btn btn-outline-light", onclick: () => this.#idEditando ? this.#abrir(this.#idEditando) : this.#nueva() },
      icono("bi-arrow-counterclockwise"), " Cancelar");
    n.desactivar = el("button", { type: "button", class: "btn btn-outline-danger ms-auto", hidden: true, onclick: () => this.#desactivar() },
      icono("bi-trash"), " Desactivar");
    const agregar = el("button", { type: "button", class: "btn btn-sm btn-outline-warning", onclick: () => this.#agregarPaso() },
      icono("bi-plus-lg"), " Agregar paso");

    const form = el("form", { class: "editor-demos", novalidate: true },
      el("div", { class: "row g-2 mb-2" },
        el("div", { class: "col-12 col-md-4" },
          el("label", { class: "form-label small", for: n.lista.id }, "Demo"), n.lista),
        el("div", { class: "col-12 col-md-4" },
          el("label", { class: "form-label small", for: n.nombre.id }, "Nombre *"), n.nombre),
        el("div", { class: "col-12 col-md-4" },
          el("label", { class: "form-label small", for: n.descripcion.id }, "Descripción"), n.descripcion)),
      el("div", { class: "d-flex align-items-center justify-content-between mb-1" },
        el("h4", { class: "h6 mb-0" }, "Pasos (en orden)"), agregar),
      el("p", { class: "small text-secondary mb-1" },
        `Duración por paso ${LIMITES.minMs}–${LIMITES.maxMs} ms · pausa 0–${LIMITES.maxPausa} ms · máx. ${LIMITES.pasos} pasos y ${LIMITES.total / 1000} s en total.`),
      n.pasos, n.total,
      el("div", { class: "d-flex flex-wrap gap-2" }, n.guardar, n.cancelar, n.desactivar),
      n.msg);
    form.addEventListener("submit", (e) => { e.preventDefault(); this.#guardar(); });
    this.#raiz.replaceChildren(form);
    this.#llenarLista();
  }

  #llenarLista() {
    this.#n.lista.replaceChildren(
      el("option", { value: "" }, "➕ Nueva demo"),
      ...this.#demos.map((d) => el("option", { value: d.id_demo }, `${d.nombre} (ID ${d.id_demo})`)));
    this.#n.lista.value = this.#idEditando ?? "";
  }

  #nueva() {
    this.#idEditando = null;
    this.#n.nombre.value = "";
    this.#n.descripcion.value = "";
    this.#n.desactivar.hidden = true;
    this.#pasos = [];
    this.#agregarPaso();
    this.#n.lista.value = "";
    mensaje(this.#n.msg, "", "info");
  }

  async #abrir(idDemo) {
    try {
      const d = await this.#api.get(`/api/v1/demos/${idDemo}`);
      this.#idEditando = idDemo;
      this.#n.nombre.value = d.nombre;
      this.#n.descripcion.value = d.descripcion ?? "";
      this.#n.desactivar.hidden = !d.editable;
      this.#pasos = d.pasos.map((p) => ({ id_comando: p.id_comando, duracion_ms: p.duracion_ms, pausa_ms: p.pausa_ms }));
      this.#pintarPasos();
      mensaje(this.#n.msg, d.editable ? "" : "Solo lectura: esta demo no es tuya.", d.editable ? "info" : "alerta");
    } catch (e) {
      mensaje(this.#n.msg, e.message, "error");
    }
  }

  #agregarPaso() {
    if (this.#pasos.length >= LIMITES.pasos) {
      mensaje(this.#n.msg, `Máximo ${LIMITES.pasos} pasos.`, "alerta");
      return;
    }
    this.#pasos.push({ id_comando: this.#comandos[0]?.id_comando ?? 0, duracion_ms: 1000, pausa_ms: 300 });
    this.#pintarPasos();
  }

  #pintarPasos() {
    const lista = this.#n.pasos;
    lista.replaceChildren();
    this.#pasos.forEach((p, i) => {
      const sel = el("select", { class: "form-select form-select-sm", "aria-label": `Comando del paso ${i + 1}` },
        this.#comandos.map((c) => el("option", { value: c.id_comando, selected: c.id_comando === p.id_comando },
          `${etiquetaComando(c.nombre)} (${c.codigo})`)));
      sel.addEventListener("change", () => { p.id_comando = Number(sel.value); });
      const dur = el("input", { type: "number", class: "form-control form-control-sm", min: LIMITES.minMs, max: LIMITES.maxMs,
                                step: 100, value: p.duracion_ms, "aria-label": `Duración del paso ${i + 1} en milisegundos` });
      dur.addEventListener("input", () => { p.duracion_ms = Number(dur.value); this.#pintarTotal(); });
      const pausa = el("input", { type: "number", class: "form-control form-control-sm", min: 0, max: LIMITES.maxPausa,
                                  step: 100, value: p.pausa_ms, "aria-label": `Pausa después del paso ${i + 1} en milisegundos` });
      pausa.addEventListener("input", () => { p.pausa_ms = Number(pausa.value); this.#pintarTotal(); });

      const mover = (d) => {
        const j = i + d;
        if (j < 0 || j >= this.#pasos.length) return;
        [this.#pasos[i], this.#pasos[j]] = [this.#pasos[j], this.#pasos[i]];
        this.#pintarPasos();
      };
      lista.append(el("li", { class: "paso-demo" },
        el("span", { class: "paso-num" }, String(i + 1)),
        el("div", { class: "paso-campos" },
          sel,
          el("div", { class: "paso-tiempos" },
            el("label", { class: "small" }, "ms", dur),
            el("label", { class: "small" }, "pausa", pausa))),
        el("div", { class: "paso-acciones" },
          el("button", { type: "button", class: "btn-icono btn-mini", "aria-label": `Subir paso ${i + 1}`, disabled: i === 0, onclick: () => mover(-1) }, icono("bi-arrow-up")),
          el("button", { type: "button", class: "btn-icono btn-mini", "aria-label": `Bajar paso ${i + 1}`, disabled: i === this.#pasos.length - 1, onclick: () => mover(1) }, icono("bi-arrow-down")),
          el("button", { type: "button", class: "btn-icono btn-mini peligro", "aria-label": `Quitar paso ${i + 1}`,
                         onclick: () => { this.#pasos.splice(i, 1); this.#pintarPasos(); } }, icono("bi-x-lg")))));
    });
    this.#pintarTotal();
  }

  #pintarTotal() {
    const total = this.#pasos.reduce((s, p) => s + (Number(p.duracion_ms) || 0) + (Number(p.pausa_ms) || 0), 0);
    this.#n.total.textContent = `Duración total: ${(total / 1000).toFixed(1)} s de ${LIMITES.total / 1000} s · ${this.#pasos.length} paso(s)`;
    this.#n.total.classList.toggle("text-danger", total > LIMITES.total);
  }

  #validar() {
    if (this.#n.nombre.value.trim().length < 3) return "El nombre debe tener al menos 3 caracteres.";
    if (!this.#pasos.length) return "Agrega al menos un paso.";
    let total = 0;
    for (const [i, p] of this.#pasos.entries()) {
      if (!(p.duracion_ms >= LIMITES.minMs && p.duracion_ms <= LIMITES.maxMs)) return `Paso ${i + 1}: duración fuera de límites.`;
      if (!(p.pausa_ms >= 0 && p.pausa_ms <= LIMITES.maxPausa)) return `Paso ${i + 1}: pausa fuera de límites.`;
      total += p.duracion_ms + p.pausa_ms;
    }
    if (total > LIMITES.total) return "La demo supera la duración máxima.";
    return "";
  }

  async #guardar() {
    const error = this.#validar();
    if (error) { mensaje(this.#n.msg, error, "error"); return; }
    const cuerpo = {
      id_vehiculo: this.#idVehiculo,
      nombre: this.#n.nombre.value.trim(),
      descripcion: this.#n.descripcion.value.trim() || null,
      pasos: this.#pasos.map((p) => ({ id_comando: p.id_comando, duracion_ms: p.duracion_ms, pausa_ms: p.pausa_ms })),
    };
    await conEspera(this.#n.guardar, async () => {
      try {
        const r = this.#idEditando
          ? await this.#api.put(`/api/v1/demos-editor/${this.#idEditando}`, cuerpo)
          : await this.#api.post("/api/v1/demos-editor", cuerpo);
        this.#idEditando = r.id_demo;
        mensaje(this.#n.msg, `Guardada en Amazon RDS (ID ${r.id_demo}). Ya aparece en CONTROL → Secuencias DEMO.`, "ok");
        await this.#recargarDemos();
        this.#alGuardar();
      } catch (e) {
        mensaje(this.#n.msg, e.message, "error");
      }
    });
  }

  async #desactivar() {
    if (!this.#idEditando) return;
    await conEspera(this.#n.desactivar, async () => {
      try {
        await this.#api.borrar(`/api/v1/demos-editor/${this.#idEditando}`);
        mensaje(this.#n.msg, "Demo desactivada (baja lógica).", "ok");
        this.#idEditando = null;
        await this.#recargarDemos();
        this.#nueva();
        this.#alGuardar();
      } catch (e) {
        mensaje(this.#n.msg, e.message, "error");
      }
    });
  }

  async #recargarDemos() {
    const demos = await this.#api.get(`/api/v1/vehiculos/${this.#idVehiculo}/demos`);
    this.#demos = demos.filter((d) => d.tipo === this.#tipo);
    this.#llenarLista();
  }
}
