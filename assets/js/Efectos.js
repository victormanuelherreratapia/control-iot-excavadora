// =====================================================================
// Clase Efectos: sonidos generados con Web Audio (sin archivos) y
// vibración del celular. Se pueden silenciar; la preferencia se recuerda
// solo en este navegador.
// =====================================================================

export class Efectos {
  static #LLAVE = "excavadora_efectos";
  #activo = true;
  #audio = null;
  #reversa = null;

  constructor() {
    try { this.#activo = localStorage.getItem(Efectos.#LLAVE) !== "off"; } catch { this.#activo = true; }
  }

  get activo() { return this.#activo; }

  alternar() {
    this.#activo = !this.#activo;
    try { localStorage.setItem(Efectos.#LLAVE, this.#activo ? "on" : "off"); } catch { /* opcional */ }
    if (!this.#activo) this.detenerReversa();
    return this.#activo;
  }

  vibrar(patron) {
    if (!this.#activo) return;
    try { navigator.vibrate?.(patron); } catch { /* no soportado */ }
  }

  /** Clic corto al iniciar un movimiento o pulsar un botón. */
  clic() { this.#tono(1400, 0.035, 0.08); }

  /** Alarma de paro: dos tonos descendentes. */
  alarmaParo() {
    this.#tono(950, 0.16, 0.22);
    setTimeout(() => this.#tono(620, 0.22, 0.22), 170);
  }

  /** "Bip… bip…" de reversa mientras se retrocede. */
  iniciarReversa() {
    if (!this.#activo || this.#reversa) return;
    const bip = () => this.#tono(1050, 0.28, 0.14, "square");
    bip();
    this.#reversa = setInterval(bip, 560);
  }

  detenerReversa() {
    clearInterval(this.#reversa);
    this.#reversa = null;
  }

  #tono(frecuencia, duracion, volumen, tipo = "sine") {
    if (!this.#activo) return;
    try {
      this.#audio ??= new (window.AudioContext || window.webkitAudioContext)();
      if (this.#audio.state === "suspended") this.#audio.resume();
      const t = this.#audio.currentTime;
      const osc = this.#audio.createOscillator();
      const gan = this.#audio.createGain();
      osc.type = tipo;
      osc.frequency.value = frecuencia;
      gan.gain.setValueAtTime(0.0001, t);
      gan.gain.exponentialRampToValueAtTime(volumen, t + 0.01);
      gan.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
      osc.connect(gan).connect(this.#audio.destination);
      osc.start(t);
      osc.stop(t + duracion + 0.02);
    } catch { /* audio no disponible */ }
  }
}
