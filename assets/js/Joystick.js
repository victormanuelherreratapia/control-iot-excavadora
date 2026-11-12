// =====================================================================
// Clase Joystick: táctil, mouse (Pointer Events) y teclado.
// Notifica solo cuando cambia la dirección efectiva (no por cada píxel).
// Al soltar, cancelar el gesto o perder el puntero vuelve a "NEUTRAL".
// =====================================================================

export class Joystick {
  static #TEXTOS = {
    NEUTRAL: "Neutral",
    AVANZAR: "Avanzar",
    RETROCEDER: "Retroceder",
    GIRAR_IZQUIERDA: "Girar izquierda",
    GIRAR_DERECHA: "Girar derecha",
  };
  static #TECLAS = {
    ArrowUp: "AVANZAR",
    ArrowDown: "RETROCEDER",
    ArrowLeft: "GIRAR_IZQUIERDA",
    ArrowRight: "GIRAR_DERECHA",
  };
  static #VECTOR = {
    AVANZAR: [0, -1],
    RETROCEDER: [0, 1],
    GIRAR_IZQUIERDA: [-1, 0],
    GIRAR_DERECHA: [1, 0],
  };
  static #ZONA_NEUTRAL = 0.3;   // fracción del radio sin acción
  static #RECORRIDO = 0.42;     // desplazamiento máximo de la perilla

  #base;
  #perilla;
  #etiqueta;
  #flechas;
  #onCambio;
  #onDetener;
  #onBloqueado;
  #habilitado = false;
  #pointerId = null;
  #teclaActiva = null;
  #direccion = "NEUTRAL";

  constructor(base, perilla, etiqueta, { onCambio, onDetener, onBloqueado }) {
    this.#base = base;
    this.#perilla = perilla;
    this.#etiqueta = etiqueta;
    this.#flechas = base.querySelectorAll(".joy-arrow");
    this.#onCambio = onCambio;
    this.#onDetener = onDetener;
    this.#onBloqueado = onBloqueado;
    this.#conectarPuntero();
    this.#conectarTeclado();
  }

  habilitar(ok) {
    this.#habilitado = ok;
    this.#base.classList.toggle("deshabilitado", !ok);
    this.#base.setAttribute("aria-disabled", String(!ok));
    if (!ok) this.#soltar(false);   // se bloquea sin enviar órdenes
  }

  // ---------------- Táctil y mouse ----------------
  #conectarPuntero() {
    const b = this.#base;
    b.addEventListener("pointerdown", (e) => {
      if (!this.#habilitado) { this.#onBloqueado?.(); return; }
      if (this.#pointerId !== null) return;
      this.#pointerId = e.pointerId;
      try { b.setPointerCapture(e.pointerId); } catch { /* opcional */ }
      b.classList.add("arrastrando");
      e.preventDefault();
      this.#procesar(e);
    });
    b.addEventListener("pointermove", (e) => {
      if (e.pointerId === this.#pointerId) this.#procesar(e);
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((tipo) => {
      b.addEventListener(tipo, (e) => { if (e.pointerId === this.#pointerId) this.#soltar(); });
    });
    b.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("blur", () => this.#soltar());
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.#soltar(); });
  }

  // ---------------- Teclado ----------------
  #conectarTeclado() {
    const b = this.#base;
    b.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        this.#soltar(false);
        this.#onDetener?.();
        return;
      }
      const dir = Joystick.#TECLAS[e.key];
      if (!dir) return;
      e.preventDefault();
      if (e.repeat) return;
      if (!this.#habilitado) { this.#onBloqueado?.(); return; }
      this.#teclaActiva = e.key;
      const maximo = (b.getBoundingClientRect().width / 2) * Joystick.#RECORRIDO;
      const [x, y] = Joystick.#VECTOR[dir];
      this.#moverPerilla(x * maximo, y * maximo);
      this.#fijarDireccion(dir);
    });
    b.addEventListener("keyup", (e) => { if (e.key === this.#teclaActiva) this.#soltar(); });
    b.addEventListener("blur", () => { if (this.#teclaActiva) this.#soltar(); });
  }

  #procesar(e) {
    const r = this.#base.getBoundingClientRect();
    const radio = r.width / 2;
    const dx = e.clientX - (r.left + radio);
    const dy = e.clientY - (r.top + radio);
    const distancia = Math.hypot(dx, dy);
    const maximo = radio * Joystick.#RECORRIDO;
    const k = distancia > maximo ? maximo / distancia : 1;
    this.#moverPerilla(dx * k, dy * k);

    if (distancia / radio < Joystick.#ZONA_NEUTRAL) {
      this.#fijarDireccion("NEUTRAL");
    } else if (Math.abs(dx) > Math.abs(dy)) {
      this.#fijarDireccion(dx > 0 ? "GIRAR_DERECHA" : "GIRAR_IZQUIERDA");
    } else {
      this.#fijarDireccion(dy < 0 ? "AVANZAR" : "RETROCEDER");
    }
  }

  #soltar(notificar = true) {
    if (this.#pointerId === null && this.#teclaActiva === null) return;
    this.#pointerId = null;
    this.#teclaActiva = null;
    this.#base.classList.remove("arrastrando");
    this.#perilla.style.transform = "";
    this.#fijarDireccion("NEUTRAL", notificar);
  }

  #fijarDireccion(nueva, notificar = true) {
    if (nueva === this.#direccion) return;
    this.#direccion = nueva;
    this.#flechas.forEach((f) => f.classList.toggle("activa", f.dataset.dir === nueva));
    this.#etiqueta.textContent = Joystick.#TEXTOS[nueva] ?? nueva;
    if (notificar) this.#onCambio(nueva);
  }

  #moverPerilla(dx, dy) {
    this.#perilla.style.transform = `translate(${dx}px, ${dy}px)`;
  }
}
