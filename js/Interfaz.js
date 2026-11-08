// =====================================================================
// Clase Interfaz: avisos, botones, etapas de la acción, registro,
// formulario de clave y pantalla completa.
// Todo texto remoto se inserta con textContent (sin inyección en el DOM).
// =====================================================================
import { CATALOGO_UI, etiquetaComando } from "./config.js";

export class Interfaz {
  #$ = (id) => document.getElementById(id);

  // ---------------- Avisos ----------------
  aviso(texto, tipo = "info", ms = 3500) {
    const zona = this.#$("toastZona");
    const div = document.createElement("div");
    div.className = `aviso ${tipo}`;
    div.textContent = texto;
    zona.append(div);
    while (zona.children.length > 3) zona.firstElementChild.remove();
    setTimeout(() => div.remove(), ms);
  }

  // ---------------- Vehículo ----------------
  mostrarVehiculo(v) {
    const destino = this.#$("vehiculoNombre");
    if (!v || typeof v !== "object") {
      destino.textContent = "Vehículo no disponible";
      return;
    }
    const partes = [v.nombre, v.modelo, v.microcontrolador].filter((p) => typeof p === "string" && p);
    destino.textContent = partes.join(" · ") || "Vehículo";
    this.#$("vehiculoId").textContent = String(v.id_vehiculo ?? "");
  }

  // ---------------- Botones de comandos ----------------
  // esPulso(nombre): true para botones de un solo clic (sonido, LED, demo)
  dibujarBotones(lista, { esPulso, alPulsar, alPresionar, alSoltar }) {
    const cont = this.#$("botonesComandos");
    cont.replaceChildren();
    if (!lista.length) {
      const p = document.createElement("p");
      p.className = "text-secondary small mb-0";
      p.textContent = "El vehículo no tiene comandos adicionales.";
      cont.append(p);
      return;
    }
    for (const c of lista) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn-comando";
      b.dataset.comando = c.nombre;
      b.disabled = true;
      b.setAttribute("aria-label", `${etiquetaComando(c.nombre)} (comando ${c.nombre}, código ${c.codigo})`);

      const i = document.createElement("i");
      i.className = `bi ${CATALOGO_UI[c.nombre]?.icono ?? "bi-gear-fill"}`;
      i.setAttribute("aria-hidden", "true");
      const s = document.createElement("span");
      s.textContent = etiquetaComando(c.nombre);
      const sm = document.createElement("small");
      sm.textContent = `${c.nombre} · ${c.codigo}`;
      b.append(i, s, sm);

      if (esPulso(c.nombre)) b.addEventListener("click", () => alPulsar(c.nombre));
      else this.#conectarMantener(b, c.nombre, alPresionar, alSoltar);
      cont.append(b);
    }
  }

  mostrarErrorComandos() {
    const p = document.createElement("p");
    p.className = "text-danger small mb-0";
    p.textContent = "No se pudo cargar el catálogo de comandos desde la API.";
    this.#$("botonesComandos").replaceChildren(p);
  }

  habilitarBotones(ok) {
    document.querySelectorAll(".btn-comando").forEach((b) => { b.disabled = !ok; });
  }

  marcarBoton(nombre, clase) {
    const b = document.querySelector(`.btn-comando[data-comando="${CSS.escape(nombre)}"]`);
    if (!b) return;
    b.classList.remove("is-enviando", "is-aceptado", "is-error");
    b.classList.add(clase);
    if (clase !== "is-enviando") setTimeout(() => b.classList.remove(clase), 1400);
  }

  // ---------------- Etapas: solicitado → aceptado por API → evento WSS ----------------
  fijarEtapa(etapa, estado) {
    const li = document.querySelector(`#etapas [data-etapa="${etapa}"]`);
    if (!li) return;
    li.classList.remove("is-pendiente", "is-ok", "is-error");
    if (estado) li.classList.add(`is-${estado}`);
  }

  iniciarAccion(texto) {
    this.#$("accionNombre").textContent = texto;
    this.fijarEtapa("solicitado", "ok");
    this.fijarEtapa("api", "pendiente");
    this.fijarEtapa("evento", null);
  }

  // ---------------- Registro de eventos WSS ----------------
  registrarEvento(evt) {
    const lista = this.#$("registroEventos");
    const li = document.createElement("li");

    const hora = typeof evt.timestamp === "string" && evt.timestamp.length >= 19
      ? evt.timestamp.slice(11, 19)
      : new Date().toLocaleTimeString("es-MX", { hour12: false });

    const titulo = document.createElement("strong");
    titulo.textContent = `${hora} ${evt.evento ?? "EVENTO"}`;

    let detalle;
    switch (evt.evento) {
      case "CONEXION_ESTABLECIDA":
        detalle = `último estado: ${evt.estado_inicial?.comando ?? "—"}`; break;
      case "MOVIMIENTO_INDIVIDUAL":
        detalle = `${evt.comando ?? "?"} · cód. ${evt.codigo_comando ?? "?"}`; break;
      case "DEMO_MOVIMIENTO":
        detalle = `paso ${evt.orden ?? "?"} · ${evt.comando ?? "?"} · cód. ${evt.codigo_comando ?? "?"}`; break;
      case "DEMO_FIN":
        detalle = `${evt.movimientos_ejecutados ?? "?"} movimientos ejecutados`; break;
      default:
        detalle = JSON.stringify(evt).slice(0, 110);
    }

    li.append(titulo, document.createTextNode(` · veh ${evt.id_vehiculo ?? "?"} · ${detalle}`));
    lista.prepend(li);
    while (lista.children.length > 12) lista.lastElementChild.remove();
  }

  // ---------------- Clave de operación ----------------
  configurarFormularioClave(alUsar) {
    const input = this.#$("claveInput");
    const ver = this.#$("btnVerClave");

    ver.addEventListener("click", () => {
      const mostrar = input.type === "password";
      input.type = mostrar ? "text" : "password";
      ver.setAttribute("aria-pressed", String(mostrar));
      ver.setAttribute("aria-label", mostrar ? "Ocultar clave" : "Mostrar clave");
      ver.querySelector("i").className = mostrar ? "bi bi-eye-slash" : "bi bi-eye";
    });

    this.#$("formClave").addEventListener("submit", (e) => {
      e.preventDefault();
      alUsar(input.value);
      input.value = "";
      input.type = "password";
      ver.querySelector("i").className = "bi bi-eye";
      ver.setAttribute("aria-pressed", "false");
    });
  }

  mostrarEstadoClave(hay) {
    const p = this.#$("claveEstado");
    p.replaceChildren();
    const i = document.createElement("i");
    i.setAttribute("aria-hidden", "true");
    if (hay) {
      i.className = "bi bi-unlock-fill text-success";
      p.append(i, document.createTextNode(" Clave cargada en esta pestaña. Para quitarla, envía el campo vacío."));
    } else {
      i.className = "bi bi-lock-fill";
      p.append(i, document.createTextNode(" Sin clave: los comandos están bloqueados."));
    }
  }

  // ---------------- DEMO ----------------
  textoDemo(t) { this.#$("demoEstado").textContent = t; }

  progresoDemo(pct) {
    const valor = Math.max(0, Math.min(100, Math.round(pct ?? 0)));
    this.#$("demoBarra").style.width = `${valor}%`;
    this.#$("demoProgreso").setAttribute("aria-valuenow", String(valor));
  }

  // ---------------- Pantalla completa ----------------
  configurarPantallaCompleta() {
    const btn = this.#$("btnPantallaCompleta");
    const icono = btn.querySelector("i");
    if (!document.fullscreenEnabled) {
      btn.hidden = true;   // p. ej. iPhone no lo permite para páginas web
      return;
    }
    btn.addEventListener("click", async () => {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen({ navigationUI: "hide" });
          try { await screen.orientation?.lock?.("landscape"); } catch { /* opcional */ }
        } else {
          await document.exitFullscreen();
        }
      } catch {
        this.aviso("El navegador no permitió la pantalla completa.", "alerta");
      }
    });
    document.addEventListener("fullscreenchange", () => {
      const activa = Boolean(document.fullscreenElement);
      icono.className = activa ? "bi bi-fullscreen-exit" : "bi bi-arrows-fullscreen";
      btn.setAttribute("aria-label", activa ? "Salir de pantalla completa" : "Pantalla completa");
    });
  }

  // Mantener presionado con dedo, mouse o teclado (Enter / Espacio)
  #conectarMantener(boton, nombre, alPresionar, alSoltar) {
    let presionado = false;
    const iniciar = () => {
      if (presionado || boton.disabled) return;
      presionado = true;
      boton.classList.add("is-presionado");
      alPresionar(nombre);
    };
    const terminar = () => {
      if (!presionado) return;
      presionado = false;
      boton.classList.remove("is-presionado");
      alSoltar(nombre);
    };
    boton.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      try { boton.setPointerCapture(e.pointerId); } catch { /* opcional */ }
      iniciar();
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((t) => boton.addEventListener(t, terminar));
    boton.addEventListener("contextmenu", (e) => e.preventDefault());
    boton.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); iniciar(); }
    });
    boton.addEventListener("keyup", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); terminar(); }
    });
    boton.addEventListener("blur", terminar);
  }
}
