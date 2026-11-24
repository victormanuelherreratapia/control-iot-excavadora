// =====================================================================
// Clase VistaAdministracion (rol ADMIN): Dashboard, Unidades, Clientes,
// Modelos, Demos de fábrica, Invitados y Auditoría. Todo con datos reales
// de AWS/RDS; si algo no se puede verificar se muestra «Sin datos».
// =====================================================================
import { VEHICULO_ID } from "./config.js";
import { EditorDemos } from "./EditorDemos.js";
import { el, icono, fechaHora, mensaje, conEspera, insigniaEstado } from "./Dom.js";

const SECCIONES = [
  ["dashboard", "Dashboard", "bi-speedometer2"],
  ["unidades", "Unidades", "bi-truck-front"],
  ["clientes", "Clientes", "bi-people"],
  ["modelos", "Modelos", "bi-boxes"],
  ["demos", "Demos de fábrica", "bi-collection-play"],
  ["invitados", "Invitados", "bi-person-badge"],
  ["auditoria", "Auditoría", "bi-journal-text"],
];

export class VistaAdministracion {
  #api;
  #raiz = document.getElementById("vistaAdmin");
  #contenido;
  #menu;
  #actual = null;
  #alCambiarDemos;

  constructor({ api, alCambiarDemos }) {
    this.#api = api;
    this.#alCambiarDemos = alCambiarDemos;
  }

  iniciar() {
    this.#menu = el("nav", { class: "admin-menu", "aria-label": "Secciones de administración" },
      SECCIONES.map(([id, texto, ico]) =>
        el("button", { type: "button", class: "admin-menu-btn", dataset: { seccion: id }, onclick: () => this.abrir(id) },
          icono(ico), el("span", {}, texto))));
    this.#contenido = el("div", { class: "admin-contenido", "aria-live": "polite" });
    this.#raiz.replaceChildren(
      el("h2", { class: "panel-title" }, icono("bi-gear-wide-connected"), " Administración"),
      el("div", { class: "admin-layout" }, this.#menu, this.#contenido));
  }

  /** Se llama al entrar a la vista (la primera vez abre el Dashboard). */
  mostrar() {
    this.abrir(this.#actual ?? "dashboard");
  }

  abrir(seccion) {
    this.#actual = seccion;
    this.#menu.querySelectorAll(".admin-menu-btn").forEach((b) => {
      const activo = b.dataset.seccion === seccion;
      b.classList.toggle("activa", activo);
      b.setAttribute("aria-current", activo ? "page" : "false");
    });
    this.#contenido.replaceChildren(el("p", { class: "small text-secondary" }, "Cargando…"));
    const accion = {
      dashboard: () => this.#dashboard(), unidades: () => this.#unidades(), clientes: () => this.#clientes(),
      modelos: () => this.#modelos(), demos: () => this.#demos(), invitados: () => this.#invitados(),
      auditoria: () => this.#auditoria(),
    }[seccion];
    accion().catch((e) => this.#contenido.replaceChildren(
      el("p", { class: "form-msg", dataset: { tipo: "error" } }, `No se pudo cargar: ${e.message}`)));
  }

  // ---------------- Dashboard ----------------
  async #dashboard() {
    const d = await this.#api.get("/api/v1/admin/dashboard");
    const tarjeta = (titulo, valor, ico, destino) => el("button", { type: "button", class: "metrica", onclick: destino ? () => this.abrir(destino) : null },
      icono(ico), el("span", { class: "metrica-valor" }, String(valor ?? "Sin datos")), el("span", { class: "metrica-titulo" }, titulo));
    const e = d.unidades_por_estado ?? {};
    this.#contenido.replaceChildren(
      el("div", { class: "metricas" },
        tarjeta("Modelos", d.modelos, "bi-boxes", "modelos"),
        tarjeta("Unidades", d.unidades_total, "bi-truck-front", "unidades"),
        tarjeta("Vendidas / asignadas", e.VENDIDO, "bi-bag-check", "unidades"),
        tarjeta("En exhibición", e.EXHIBICION, "bi-shop", "unidades"),
        tarjeta("Disponibles", e.DISPONIBLE, "bi-box-seam", "unidades"),
        tarjeta("Clientes", d.clientes, "bi-people", "clientes"),
        tarjeta("Demos de fábrica", d.demos_fabrica, "bi-collection-play", "demos"),
        tarjeta("Demos privadas", d.demos_privadas, "bi-person-video3"),
        tarjeta("Invitados activos", d.invitados_activos, "bi-person-badge", "invitados"),
        tarjeta("Dispositivos conectados", d.dispositivos_conectados, "bi-cpu"),
        tarjeta("Movimientos hoy (UTC)", d.movimientos_hoy, "bi-activity")),
      el("p", { class: "small text-secondary mt-2" },
        "«Dispositivos conectados» cuenta los ESP8266 conectados al WSS con su clave; ",
        "el WebSocket del navegador no prueba que la excavadora esté en línea."));
  }

  // ---------------- Unidades ----------------
  async #unidades() {
    const [unidades, modelos, clientes] = await Promise.all([
      this.#api.get("/api/v1/admin/unidades"),
      this.#api.get("/api/v1/admin/modelos"),
      this.#api.get("/api/v1/admin/usuarios?rol=USUARIO"),
    ]);
    const salida = el("p", { class: "form-msg", role: "status", "aria-live": "polite" });
    const clave = el("div", { class: "clave-dispositivo", hidden: true });

    const filas = unidades.map((u) => {
      const acciones = el("div", { class: "acciones-fila" });
      if (u.estado_comercial === "VENDIDO") {
        acciones.append(el("button", { type: "button", class: "btn btn-sm btn-outline-warning", onclick: (ev) =>
          conEspera(ev.currentTarget, () => this.#accion(salida, () =>
            this.#api.post(`/api/v1/admin/unidades/${u.id_vehiculo}/desasignar`, { nuevo_estado: "DISPONIBLE", motivo: "Retiro desde ADMINISTRACIÓN" }),
            "Asignación retirada: el comprador perdió el acceso.", () => this.abrir("unidades"))) }, "Retirar"));
      } else if (u.estado_comercial !== "INACTIVO") {
        const sel = el("select", { class: "form-select form-select-sm", "aria-label": `Cliente para ${u.numero_serie}` },
          el("option", { value: "" }, "Asignar a…"),
          clientes.filter((c) => c.activo).map((c) => el("option", { value: c.id_usuario }, `${c.nombre} (${c.correo})`)));
        sel.addEventListener("change", () => {
          if (!sel.value) return;
          this.#accion(salida, () => this.#api.post(`/api/v1/admin/unidades/${u.id_vehiculo}/asignar`,
            { id_usuario: Number(sel.value), motivo: "Venta registrada en ADMINISTRACIÓN" }),
            `Unidad ${u.numero_serie} asignada.`, () => this.abrir("unidades"));
        });
        acciones.append(sel);
      }
      if (u.estado_comercial !== "VENDIDO") {
        const estado = el("select", { class: "form-select form-select-sm", "aria-label": `Estado de ${u.numero_serie}` },
          ["DISPONIBLE", "EXHIBICION", "INACTIVO"].map((s) => el("option", { value: s, selected: s === u.estado_comercial }, s)));
        estado.addEventListener("change", () => this.#accion(salida,
          () => this.#api.patch(`/api/v1/admin/unidades/${u.id_vehiculo}`, { estado_comercial: estado.value }),
          `Estado de ${u.numero_serie}: ${estado.value}.`, () => this.abrir("unidades")));
        acciones.append(estado);
      }
      acciones.append(el("button", { type: "button", class: "btn btn-sm btn-outline-light", title: "Generar clave del ESP8266",
        onclick: (ev) => conEspera(ev.currentTarget, async () => {
          try {
            const r = await this.#api.post(`/api/v1/admin/unidades/${u.id_vehiculo}/clave-dispositivo`);
            clave.hidden = false;
            clave.replaceChildren(
              el("strong", {}, `Clave del dispositivo ${u.numero_serie} (cópiala al firmware; no se vuelve a mostrar):`),
              el("code", { class: "d-block user-select-all" }, r.clave_dispositivo),
              el("button", { type: "button", class: "btn btn-sm btn-outline-light mt-1", onclick: () => { clave.hidden = true; clave.replaceChildren(); } }, "Ocultar"));
          } catch (e) { mensaje(salida, e.message, "error"); }
        }) }, icono("bi-key")));

      return el("tr", {},
        el("td", {}, u.numero_serie, el("small", { class: "d-block text-secondary" }, `ID ${u.id_vehiculo}${u.id_vehiculo === VEHICULO_ID ? " · seleccionada" : ""}`)),
        el("td", {}, u.modelo),
        el("td", {}, insigniaEstado(u.estado_comercial)),
        el("td", {}, u.propietario ? `${u.propietario}` : "—", u.correo_propietario ? el("small", { class: "d-block text-secondary" }, u.correo_propietario) : null),
        el("td", {}, u.tiene_clave_dispositivo ? (u.conectado ? "En línea" : "Sin conexión") : "Sin verificar",
          u.en_uso ? el("small", { class: "d-block text-warning" }, "En uso") : null),
        el("td", {}, acciones));
    });

    const form = this.#formulario("Registrar unidad física", [
      ["id_modelo", "Modelo", "select", modelos.filter((m) => m.activo).map((m) => [m.id_modelo, m.nombre])],
      ["numero_serie", "Número de serie (único)", "text", { required: true, maxlength: 40, placeholder: "EXC-0002" }],
      ["nombre", "Nombre visible", "text", { maxlength: 80, placeholder: "Opcional" }],
      ["estado_comercial", "Estado inicial", "select", [["DISPONIBLE", "Disponible"], ["EXHIBICION", "Exhibición"]]],
    ], (datos) => this.#api.post("/api/v1/admin/unidades", { ...datos, id_modelo: Number(datos.id_modelo), nombre: datos.nombre || null }),
    "Unidad registrada (se copiaron los comandos de su modelo).", () => this.abrir("unidades"));

    this.#contenido.replaceChildren(
      this.#tabla(["Serie", "Modelo", "Estado", "Propietario", "Conectividad", "Acciones"], filas, "Inventario de unidades"),
      salida, clave,
      el("p", { class: "small text-secondary" },
        "Una unidad vendida solo la opera su comprador; el Administrador necesita que el comprador autorice soporte. ",
        "No se borran unidades: se usa el estado INACTIVO (baja lógica)."),
      form);
  }

  // ---------------- Clientes ----------------
  async #clientes() {
    const usuarios = await this.#api.get("/api/v1/admin/usuarios");
    const salida = el("p", { class: "form-msg", role: "status", "aria-live": "polite" });
    const filas = usuarios.map((u) => el("tr", {},
      el("td", {}, u.nombre, el("small", { class: "d-block text-secondary" }, u.correo)),
      el("td", {}, u.rol === "ADMIN" ? "Administrador" : "Comprador"),
      el("td", {}, String(u.unidades)),
      el("td", {}, u.activo ? "Activo" : "Inactivo"),
      el("td", {}, u.ultimo_acceso ? fechaHora(u.ultimo_acceso) : "—"),
      el("td", {}, el("button", { type: "button", class: `btn btn-sm ${u.activo ? "btn-outline-danger" : "btn-outline-success"}`,
        onclick: (ev) => conEspera(ev.currentTarget, () => this.#accion(salida,
          () => this.#api.patch(`/api/v1/admin/usuarios/${u.id_usuario}`, { activo: !u.activo }),
          u.activo ? "Cuenta desactivada: sus sesiones se cerraron." : "Cuenta activada.", () => this.abrir("clientes"))) },
        u.activo ? "Desactivar" : "Activar"))));

    const form = this.#formulario("Alta de cliente comprador", [
      ["nombre", "Nombre completo", "text", { required: true, minlength: 3, maxlength: 100 }],
      ["correo", "Correo (usuario)", "email", { required: true, maxlength: 120 }],
      ["telefono", "Teléfono", "tel", { maxlength: 20, placeholder: "Opcional" }],
      ["password", "Contraseña inicial (mín. 10)", "password", { required: true, minlength: 10, maxlength: 128, autocomplete: "new-password" }],
    ], (datos) => this.#api.post("/api/v1/admin/usuarios", { ...datos, telefono: datos.telefono || null, rol: "USUARIO" }),
    "Cliente registrado. Entrégale su correo y contraseña inicial.", () => this.abrir("clientes"));

    this.#contenido.replaceChildren(
      this.#tabla(["Cliente", "Rol", "Unidades", "Estado", "Último acceso", "Acciones"], filas, "Clientes y administradores"),
      salida, form);
  }

  // ---------------- Modelos ----------------
  async #modelos() {
    const modelos = await this.#api.get("/api/v1/admin/modelos");
    const salida = el("p", { class: "form-msg", role: "status", "aria-live": "polite" });
    const filas = modelos.map((m) => el("tr", {},
      el("td", {}, m.nombre, el("small", { class: "d-block text-secondary" }, m.descripcion ?? "")),
      el("td", {}, m.microcontrolador ?? "—"),
      el("td", {}, String(m.unidades)),
      el("td", {}, m.publicado ? "Sí" : "No"),
      el("td", {}, el("button", { type: "button", class: "btn btn-sm btn-outline-light",
        onclick: (ev) => conEspera(ev.currentTarget, () => this.#accion(salida,
          () => this.#api.patch(`/api/v1/admin/modelos/${m.id_modelo}`, { publicado: !m.publicado }),
          m.publicado ? "El modelo ya no aparece en el catálogo público." : "Modelo publicado en el catálogo.", () => this.abrir("modelos"))) },
        m.publicado ? "Ocultar del catálogo" : "Publicar"))));

    const form = this.#formulario("Nuevo modelo comercial", [
      ["nombre", "Nombre", "text", { required: true, minlength: 2, maxlength: 80, placeholder: "Vehículo Batman IoT" }],
      ["descripcion", "Descripción", "text", { maxlength: 255 }],
      ["microcontrolador", "Microcontrolador", "text", { maxlength: 50, placeholder: "ESP8266" }],
    ], (datos) => this.#api.post("/api/v1/admin/modelos", { ...datos, publicado: true }),
    "Modelo creado.", () => this.abrir("modelos"));

    this.#contenido.replaceChildren(
      this.#tabla(["Modelo", "Microcontrolador", "Unidades", "En catálogo", "Acciones"], filas, "Modelos comerciales"),
      salida, form);
  }

  // ---------------- Demos de fábrica ----------------
  async #demos() {
    const unidades = (await this.#api.get("/api/v1/mis-vehiculos"));
    if (!unidades.length) {
      this.#contenido.replaceChildren(el("p", {}, "No hay unidades de la empresa para crear demos."));
      return;
    }
    const sel = el("select", { class: "form-select form-select-sm mb-2", "aria-label": "Unidad de la demo" },
      unidades.map((u) => el("option", { value: u.id_vehiculo, selected: u.id_vehiculo === VEHICULO_ID }, `${u.numero_serie} · ${u.modelo}`)));
    const zona = el("div");
    const cargar = () => new EditorDemos({ api: this.#api, raiz: zona, idVehiculo: Number(sel.value), tipo: "FABRICA",
                                           alGuardar: this.#alCambiarDemos }).iniciar();
    sel.addEventListener("change", cargar);
    this.#contenido.replaceChildren(
      el("p", { class: "small text-secondary" }, "Demos de exhibición de la empresa. Las demos privadas de los compradores no se pueden editar aquí."),
      el("label", { class: "form-label small" }, "Unidad", sel), zona);
    cargar();
  }

  // ---------------- Invitados ----------------
  async #invitados() {
    const sesiones = await this.#api.get("/api/v1/admin/sesiones-invitado");
    const filas = sesiones.map((s) => el("tr", {},
      el("td", {}, s.alias ?? "Invitado"), el("td", {}, s.numero_serie), el("td", {}, fechaHora(s.creada)), el("td", {}, fechaHora(s.expira))));
    this.#contenido.replaceChildren(
      filas.length ? this.#tabla(["Invitado", "Unidad", "Inicio", "Expira"], filas, "Pruebas de invitado activas")
                   : el("p", {}, "No hay pruebas de invitado activas."),
      el("p", { class: "small text-secondary" }, "Al vencer, cerrar o perder la conexión, el servidor envía DETENER y libera la unidad."));
  }

  // ---------------- Auditoría ----------------
  async #auditoria(filtro = "") {
    const registros = await this.#api.get(`/api/v1/admin/auditoria?limite=60${filtro ? `&resultado=${filtro}` : ""}`);
    const sel = el("select", { class: "form-select form-select-sm w-auto", "aria-label": "Filtrar por resultado" },
      [["", "Todos"], ["EXITO", "Éxito"], ["RECHAZADO", "Rechazado"], ["ERROR", "Error"]].map(([v, t]) => el("option", { value: v, selected: v === filtro }, t)));
    sel.addEventListener("change", () => this.#auditoria(sel.value).catch(() => {}));
    const filas = registros.map((r) => el("tr", { class: r.resultado === "RECHAZADO" ? "fila-rechazo" : "" },
      el("td", {}, fechaHora(r.fecha)), el("td", {}, r.actor, el("small", { class: "d-block text-secondary" }, r.rol)),
      el("td", {}, r.accion), el("td", {}, `${r.recurso}${r.id_recurso ? ` #${r.id_recurso}` : ""}`),
      el("td", {}, r.resultado), el("td", {}, r.detalle ?? "")));
    this.#contenido.replaceChildren(
      el("div", { class: "d-flex align-items-center gap-2 mb-2" }, el("span", { class: "small" }, "Resultado:"), sel),
      this.#tabla(["Fecha", "Actor", "Acción", "Recurso", "Resultado", "Detalle"], filas, "Bitácora de auditoría"),
      el("p", { class: "small text-secondary" }, "La auditoría nunca guarda contraseñas ni tokens."));
  }

  // ---------------- Utilidades ----------------
  #tabla(encabezados, filas, titulo) {
    return el("div", { class: "tabla-envoltura admin-tabla" },
      el("table", { class: "tabla-historial" },
        el("caption", { class: "visually-hidden" }, titulo),
        el("thead", {}, el("tr", {}, encabezados.map((h) => el("th", { scope: "col" }, h)))),
        el("tbody", {}, filas.length ? filas : el("tr", {}, el("td", { colspan: encabezados.length, class: "fila-mensaje" }, "Sin datos")))));
  }

  /** campos: [nombre, etiqueta, tipo, atributos | opciones] */
  #formulario(titulo, campos, enviar, exito, despues) {
    const salida = el("p", { class: "form-msg", role: "status", "aria-live": "polite" });
    const boton = el("button", { type: "submit", class: "btn btn-warning fw-semibold" }, icono("bi-check2"), " Guardar");
    const form = el("form", { class: "admin-form", novalidate: true },
      el("h3", { class: "h6" }, titulo),
      el("div", { class: "row g-2" }, campos.map(([nombre, etiqueta, tipo, extra]) => {
        const id = `f_${titulo.length}_${nombre}`;
        const control = tipo === "select"
          ? el("select", { class: "form-select", id, name: nombre }, extra.map(([v, t]) => el("option", { value: v }, t)))
          : el("input", { class: "form-control", id, name: nombre, type: tipo, ...extra });
        return el("div", { class: "col-12 col-md-6" }, el("label", { class: "form-label small", for: id }, etiqueta), control);
      })),
      el("div", { class: "mt-2" }, boton), salida);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      const datos = Object.fromEntries(new FormData(form).entries());
      await conEspera(boton, () => this.#accion(salida, () => enviar(datos), exito, () => { form.reset(); despues?.(); }));
    });
    return form;
  }

  async #accion(salida, peticion, exito, despues) {
    mensaje(salida, "Guardando…", "info");
    try {
      await peticion();
      mensaje(salida, exito, "ok");
      if (despues) setTimeout(despues, 900);
    } catch (e) {
      mensaje(salida, e.message, "error");
    }
  }
}
