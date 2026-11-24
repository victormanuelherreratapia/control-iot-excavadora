// =====================================================================
// Clase PantallaAcceso: inicio de sesión (Administrador / Usuario) y
// «Prueba nuestros vehículos IoT» para el Invitado (catálogo público).
// =====================================================================
import { Sesion } from "./Sesion.js";
import { el, icono, mensaje, conEspera } from "./Dom.js";

export class PantallaAcceso {
  #api;
  #raiz = document.getElementById("pantallaAcceso");

  constructor({ api }) {
    this.#api = api;
  }

  mostrar(aviso = "") {
    document.body.classList.add("sin-sesion");
    this.#raiz.hidden = false;
    if (aviso) mensaje(document.getElementById("accesoAviso"), aviso, "alerta");

    const form = document.getElementById("formLogin");
    form.addEventListener("submit", (e) => this.#login(e));
    document.getElementById("btnRecargarCatalogo").addEventListener("click", () => this.#cargarCatalogo());
    this.#cargarCatalogo();
  }

  async #login(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const salida = document.getElementById("loginMensaje");
    const correo = form.correo.value.trim();
    const password = form.password.value;
    if (!correo || !password) {
      mensaje(salida, "Escribe tu correo y contraseña.", "error");
      return;
    }
    await conEspera(form.querySelector("button[type=submit]"), async () => {
      mensaje(salida, "Verificando…", "info");
      try {
        const r = await this.#api.login(correo, password);
        Sesion.guardar({
          token: r.token, expira: r.expira, tipo: r.usuario.rol, nombre: r.usuario.nombre,
          correo: r.usuario.correo, id_usuario: r.usuario.id_usuario,
        });
        form.password.value = "";
        mensaje(salida, `Bienvenido, ${r.usuario.nombre}.`, "ok");
        Sesion.recargar();
      } catch (err) {
        form.password.value = "";
        mensaje(salida, err.message, "error");
      }
    });
  }

  async #cargarCatalogo() {
    const lista = document.getElementById("catalogoLista");
    const estado = document.getElementById("catalogoEstado");
    mensaje(estado, "Cargando catálogo…", "info");
    try {
      const r = await this.#api.catalogo();
      lista.replaceChildren();
      if (!r.modelos?.length) {
        mensaje(estado, "No hay modelos publicados en este momento.", "info");
        return;
      }
      mensaje(estado, `Prueba de ${r.minutos_prueba} minutos con comandos limitados. Solo una persona a la vez por unidad.`, "info");
      for (const m of r.modelos) lista.append(this.#tarjetaModelo(m));
    } catch (e) {
      mensaje(estado, `No se pudo cargar el catálogo: ${e.message}`, "error");
    }
  }

  #tarjetaModelo(m) {
    const unidades = m.exhibicion ?? [];
    const libres = unidades.filter((u) => u.estado === "LIBRE");
    const alias = el("input", { class: "form-control form-control-sm", maxlength: 60, placeholder: "Tu nombre (opcional)",
                                "aria-label": `Tu nombre para probar ${m.nombre}` });
    const salida = el("p", { class: "form-msg", role: "status", "aria-live": "polite" });
    const boton = el("button", { type: "button", class: "btn btn-warning btn-sm fw-semibold", disabled: !libres.length },
      icono("bi-play-fill"), " Probar ahora");
    boton.addEventListener("click", () => conEspera(boton, async () => {
      try {
        const r = await this.#api.iniciarInvitado(libres[0].id_vehiculo, alias.value.trim() || "Invitado");
        Sesion.guardar({ token: r.token, expira: r.expira, tipo: "INVITADO", nombre: alias.value.trim() || "Invitado",
                         id_vehiculo: r.id_vehiculo });
        Sesion.fijarVehiculo(r.id_vehiculo);
        Sesion.recargar();
      } catch (e) {
        mensaje(salida, e.message, "error");
        this.#cargarCatalogo();
      }
    }));

    return el("article", { class: "catalogo-item" },
      el("h3", { class: "catalogo-nombre" }, icono("bi-truck-front-fill"), " ", m.nombre),
      m.descripcion ? el("p", { class: "small mb-1" }, m.descripcion) : null,
      el("p", { class: "small text-secondary mb-1" }, `Microcontrolador: ${m.microcontrolador ?? "—"}`),
      el("p", { class: "small mb-1" }, el("strong", {}, "Puedes usar: "),
        (m.comandos_invitado ?? []).join(", ").replaceAll("_", " ").toLowerCase() || "—"),
      el("p", { class: "small mb-2" },
        unidades.length
          ? `Unidades de exhibición: ${libres.length} libre(s) de ${unidades.length}`
          : "Sin unidades de exhibición por ahora"),
      el("div", { class: "d-flex gap-2" }, alias, boton),
      salida,
    );
  }
}
