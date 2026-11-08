// =====================================================================
// Punto de entrada: clase AplicacionControl (coordina todos los objetos)
//
//   AplicacionControl
//     ├─ SesionOperador     (clave de operación en la pestaña)
//     ├─ ClienteApi         (REST: Fetch + async/await)
//     ├─ ClienteWS          (WebSocket WSS del navegador)
//     ├─ PanelEstado        (indicadores WSS / API AWS / RDS)
//     ├─ Interfaz           (DOM: botones, avisos, etapas, registro)
//     ├─ ServicioComandos   (envío único, prioridad de DETENER)
//     ├─ ServicioDemo       (cargar / iniciar / cancelar DEMO)
//     ├─ ControlContinuo    (mantener presionado)
//     ├─ Joystick           (táctil, mouse y teclado)
//     ├─ Torreta            (baliza de advertencia)
//     └─ Efectos            (pitidos, alarma y vibración)
// =====================================================================
import { CONFIG, COMANDOS_JOYSTICK, COMANDO_DETENER, COMANDOS_PULSO } from "./config.js";
import { SesionOperador } from "./SesionOperador.js";
import { ClienteApi } from "./ClienteApi.js";
import { ClienteWS } from "./ClienteWS.js";
import { PanelEstado } from "./PanelEstado.js";
import { Interfaz } from "./Interfaz.js";
import { ServicioComandos } from "./ServicioComandos.js";
import { ServicioDemo } from "./ServicioDemo.js";
import { ControlContinuo } from "./ControlContinuo.js";
import { Joystick } from "./Joystick.js";
import { Torreta } from "./Torreta.js";
import { Efectos } from "./Efectos.js";

class AplicacionControl {
  #sesion = new SesionOperador();
  #ui = new Interfaz();
  #api = new ClienteApi({ baseUrl: CONFIG.API_BASE_URL, idVehiculo: CONFIG.VEHICULO_ID, sesion: this.#sesion });
  #panel = new PanelEstado(this.#api);
  #comandos = new ServicioComandos({ api: this.#api, sesion: this.#sesion, ui: this.#ui });
  #demo = new ServicioDemo({ api: this.#api, sesion: this.#sesion, ui: this.#ui });
  #mando = new ControlContinuo({
    solicitar: (nombre, fuente) => this.#comandos.solicitar(nombre, fuente),
    detener: (fuente) => this.#comandos.solicitar(COMANDO_DETENER, fuente),
    intervaloMs: CONFIG.REPETIR_MANTENIDO_MS,
  });
  #torreta = new Torreta(document.getElementById("torreta"), document.getElementById("torretaTexto"));
  #efectos = new Efectos();
  #ws;
  #joystick;
  #catalogoListo = false;
  #wsEnLinea = false;

  iniciar() {
    this.#panel.iniciar();
    this.#conectarWebSocket();
    this.#crearJoystick();
    this.#configurarServicios();
    this.#conectarControles();
    this.#configurarClave();
    this.#configurarEfectos();
    this.#ui.configurarPantallaCompleta();
    this.#cargarDatos();
  }

  // ---------------- WebSocket ----------------
  #conectarWebSocket() {
    this.#ws = new ClienteWS(CONFIG.WS_URL, {
      onEstado: (estado) => {
        this.#panel.fijarWebSocket(estado);
        this.#wsEnLinea = estado === "en-linea";
        this.#actualizarBaseTorreta();
      },
      onMensaje: (evt) => this.#manejarEvento(evt),
    });
    this.#ws.conectar();
    window.addEventListener("offline", () => this.#ws.forzarCierre());
    window.addEventListener("online", () => this.#ws.reconectarYa());
  }

  // Solo se procesan eventos del vehículo propio
  #manejarEvento(evt) {
    if (evt.id_vehiculo !== undefined && Number(evt.id_vehiculo) !== CONFIG.VEHICULO_ID) return;
    this.#ui.registrarEvento(evt);
    this.#comandos.recibirEvento(evt);
    this.#demo.recibirEvento(evt);
  }

  // ---------------- Joystick ----------------
  #crearJoystick() {
    this.#joystick = new Joystick(
      document.getElementById("joystick"),
      document.getElementById("joystickKnob"),
      document.getElementById("joystickDireccion"),
      {
        onCambio: (dir) => {
          if (dir === "NEUTRAL") this.#terminarMovimiento("joystick");
          else this.#iniciarMovimiento(dir, "joystick");
        },
        onDetener: () => this.#detenerTodo("teclado"),
        onBloqueado: () => this.#ui.aviso(
          !this.#sesion.tieneClave ? "Escribe la clave de operación para usar el joystick."
            : this.#demo.activa ? "Control bloqueado mientras se ejecuta una DEMO."
            : "Cargando catálogo de comandos…",
          "alerta"),
      },
    );
  }

  // ---------------- Servicios ----------------
  #configurarServicios() {
    this.#comandos.configurar({
      estaDemoActiva: () => this.#demo.activa,
      cancelarDemo: () => this.#demo.cancelar(),
      alClaveInvalida: () => this.#claveInvalida(),
    });
    this.#demo.configurar({
      alCambiarEstado: () => this.#actualizarHabilitacion(),
      alClaveInvalida: () => this.#claveInvalida(),
    });
  }

  // ---------------- DETENER, DEMO y seguridad ----------------
  #conectarControles() {
    document.getElementById("btnDetener").addEventListener("click", () => this.#detenerTodo("botón DETENER"));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") this.#detenerTodo("tecla Esc"); });

    document.getElementById("btnIniciarDemo").addEventListener("click", () => {
      this.#mando.cancelar();
      this.#efectos.detenerReversa();
      this.#demo.iniciar();
    });
    document.getElementById("btnCancelarDemo").addEventListener("click", () => { this.#demo.cancelar().catch(() => {}); });
    document.getElementById("demoSelect").addEventListener("change", () => this.#demo.actualizarBotones());

    // Si la pestaña pierde el foco, se suelta lo que esté presionado
    window.addEventListener("blur", () => this.#soltarTodo("pérdida de foco"));
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.#soltarTodo("pestaña oculta"); });
  }

  // Movimiento sostenido (joystick o botón): torreta ámbar, clic y, en reversa, pitido
  #iniciarMovimiento(nombre, fuente) {
    if (!this.#mando.mantener(nombre, fuente)) return;   // otro control ya está presionado
    this.#torreta.mostrar("movimiento");
    this.#efectos.clic();
    this.#efectos.vibrar(15);
    if (nombre === "RETROCEDER") this.#efectos.iniciarReversa();
    else this.#efectos.detenerReversa();
  }

  #terminarMovimiento(fuente) {
    if (!this.#mando.soltar(fuente)) return;   // no era quien estaba presionando
    this.#efectos.detenerReversa();
    this.#torreta.volver();
  }

  #soltarTodo(motivo) {
    this.#efectos.detenerReversa();
    if (this.#mando.soltarTodo(motivo)) this.#torreta.volver();
  }

  // Paro de emergencia: corta todo, alarma y torreta roja
  #detenerTodo(fuente) {
    this.#mando.cancelar();
    this.#efectos.detenerReversa();
    this.#comandos.solicitar(COMANDO_DETENER, fuente);
    this.#torreta.mostrar("paro", 1800);
    this.#efectos.alarmaParo();
    this.#efectos.vibrar([90, 50, 90]);
  }

  #actualizarBaseTorreta() {
    this.#torreta.fijarBase(!this.#wsEnLinea ? "sin-conexion" : this.#demo.activa ? "demo" : "reposo");
  }

  // ---------------- Efectos (sonido y vibración) ----------------
  #configurarEfectos() {
    const btn = document.getElementById("btnEfectos");
    const pintar = () => {
      const on = this.#efectos.activo;
      btn.setAttribute("aria-pressed", String(on));
      btn.setAttribute("aria-label", on ? "Silenciar efectos" : "Activar efectos");
      btn.title = on ? "Efectos activados" : "Efectos silenciados";
      btn.querySelector("i").className = on ? "bi bi-volume-up-fill" : "bi bi-volume-mute-fill";
    };
    btn.addEventListener("click", () => {
      this.#efectos.alternar();
      pintar();
      this.#efectos.clic();
    });
    pintar();
  }

  // ---------------- Clave de operación ----------------
  #configurarClave() {
    this.#ui.configurarFormularioClave((valor) => this.#sesion.establecer(valor));
    this.#sesion.alCambiar((hay) => {
      this.#ui.mostrarEstadoClave(hay);
      document.body.classList.toggle("con-clave", hay);
      if (hay) this.#ui.aviso("Clave cargada. Se valida con el primer comando.", "ok");
      this.#actualizarHabilitacion();
    });
    this.#ui.mostrarEstadoClave(this.#sesion.tieneClave);
    document.body.classList.toggle("con-clave", this.#sesion.tieneClave);
  }

  #claveInvalida() {
    this.#mando.cancelar();
    this.#sesion.borrar();
    this.#ui.aviso("La API rechazó la clave (401). Escríbela de nuevo.", "error", 5000);
  }

  #actualizarHabilitacion() {
    const libre = this.#catalogoListo && this.#sesion.tieneClave && !this.#demo.activa;
    if (!libre) {
      this.#mando.cancelar();
      this.#efectos.detenerReversa();
      this.#torreta.volver();
    }
    this.#actualizarBaseTorreta();
    this.#joystick.habilitar(libre);
    this.#ui.habilitarBotones(libre);
    this.#demo.actualizarBotones();
  }

  // ---------------- Carga inicial ----------------
  async #cargarDatos() {
    const [rVehiculo, rComandos] = await Promise.allSettled([this.#api.vehiculo(), this.#api.comandos()]);

    this.#ui.mostrarVehiculo(rVehiculo.status === "fulfilled" ? rVehiculo.value : null);

    if (rComandos.status === "fulfilled" && Array.isArray(rComandos.value)) {
      this.#comandos.cargarCatalogo(rComandos.value);
      const adicionales = rComandos.value
        .filter((c) => c && (Number(c.activo) === 1 || c.activo === true))
        .filter((c) => !COMANDOS_JOYSTICK.includes(c.nombre) && c.nombre !== COMANDO_DETENER)
        .sort((a, b) => Number(a.codigo) - Number(b.codigo));

      this.#ui.dibujarBotones(adicionales, {
        esPulso: (nombre) => COMANDOS_PULSO.includes(nombre),
        alPulsar: (nombre) => {
          this.#comandos.solicitar(nombre, "botón");
          this.#torreta.mostrar("movimiento", 600);
          this.#efectos.clic();
          this.#efectos.vibrar(15);
        },
        alPresionar: (nombre) => this.#iniciarMovimiento(nombre, `botón ${nombre}`),
        alSoltar: (nombre) => this.#terminarMovimiento(`botón ${nombre}`),
      });

      const faltan = [...COMANDOS_JOYSTICK, COMANDO_DETENER].filter((n) => !this.#comandos.existe(n));
      if (faltan.length) this.#ui.aviso(`Faltan en el catálogo: ${faltan.join(", ")}`, "alerta", 6000);
      this.#catalogoListo = true;
    } else {
      this.#ui.mostrarErrorComandos();
      this.#ui.aviso("No se pudo cargar el catálogo de comandos.", "error");
    }

    await this.#demo.cargar();
    this.#actualizarHabilitacion();
  }
}

new AplicacionControl().iniciar();
