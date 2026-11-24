// =====================================================================
// Punto de entrada: clase AplicacionControl (coordina CONTROL y MONITOREO)
//
//   AplicacionControl
//     ├─ Navegacion         (pestañas CONTROL / MONITOREO)
//     ├─ ClienteApi         (REST: Fetch + async/await)
//     ├─ ClienteWS          (WebSocket WSS del navegador)
//     ├─ PanelEstado        (indicadores WSS / API AWS / RDS)
//     ├─ Interfaz           (DOM: botones, avisos, etapas, registro)
//     ├─ ServicioComandos   (envío único, prioridad de DETENER)
//     ├─ ServicioDemo       (cargar / iniciar / cancelar DEMO)
//     ├─ ControlContinuo    (mantener presionado)
//     ├─ Joystick           (táctil, mouse y teclado)
//     ├─ Torreta            (baliza de advertencia)
//     ├─ Efectos            (pitidos, alarma y vibración)
//     ├─ ServicioMonitoreo  (último movimiento + 10 movimientos: REST + WSS)
//     └─ VistaMonitoreo     (tarjeta y tabla)
//
//     ├─ Sesion / PantallaAcceso / BarraSesion (4.3: login, invitado, Mis vehículos)
//     └─ VistaAdministracion (ADMIN) · VistaCuenta (USUARIO)
//
//   Una SOLA conexión WSS (ClienteWS) alimenta todas las vistas; lleva el
//   token de la sesión y solo recibe eventos de la unidad autorizada.
// =====================================================================
import { CONFIG, ENDPOINTS, COMANDOS_JOYSTICK, COMANDO_DETENER, COMANDOS_PULSO } from "./config.js";
import { Sesion } from "./Sesion.js";
import { PantallaAcceso } from "./PantallaAcceso.js";
import { BarraSesion } from "./BarraSesion.js";
import { VistaAdministracion } from "./VistaAdministracion.js";
import { VistaCuenta } from "./VistaCuenta.js";
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
import { Navegacion } from "./Navegacion.js";
import { VistaMonitoreo } from "./VistaMonitoreo.js";
import { ServicioMonitoreo } from "./ServicioMonitoreo.js";

class AplicacionControl {
  #ui = new Interfaz();
  #api = new ClienteApi({
    baseUrl: CONFIG.API_BASE_URL,
    idVehiculo: CONFIG.VEHICULO_ID,
    token: () => Sesion.token(),
    alNoAutorizado: () => this.#salir("Tu sesión expiró o fue revocada. Inicia sesión de nuevo."),
  });
  #panel = new PanelEstado(this.#api);
  #comandos = new ServicioComandos({ api: this.#api, ui: this.#ui });
  #demo = new ServicioDemo({ api: this.#api, ui: this.#ui });
  #mando = new ControlContinuo({
    solicitar: (nombre, fuente) => this.#comandos.solicitar(nombre, fuente),
    detener: (fuente) => this.#comandos.solicitar(COMANDO_DETENER, fuente),
    intervaloMs: CONFIG.REPETIR_MANTENIDO_MS,
  });
  #torreta = new Torreta(document.getElementById("torreta"), document.getElementById("torretaTexto"));
  #efectos = new Efectos();
  #monitoreo = new ServicioMonitoreo({ api: this.#api, vista: new VistaMonitoreo() });
  #navegacion;
  #ws;
  #joystick;
  #catalogoListo = false;
  #wsEnLinea = false;
  #wsHaEstadoEnLinea = false;
  #barra;
  #vistaGestion = null;   // VistaAdministracion (ADMIN) o VistaCuenta (USUARIO)
  #saliendo = false;

  async iniciar() {
    this.#panel.iniciar();
    const aviso = Sesion.tomarAviso();
    const sesion = Sesion.actual();
    if (!sesion) {
      this.#panel.fijarWebSocket("desconectado");
      new PantallaAcceso({ api: this.#api }).mostrar(aviso ?? "");
      return;
    }

    // Unidades que ESTA sesión puede operar (lo decide FastAPI, no el navegador)
    let vehiculos;
    try {
      vehiculos = await this.#api.get(ENDPOINTS.misVehiculos());
    } catch (e) {
      if (e.status !== 401) this.#ui.aviso(`No se pudieron cargar tus vehículos: ${e.message}`, "error", 8000);
      return;
    }
    const valido = vehiculos.some((v) => v.id_vehiculo === CONFIG.VEHICULO_ID);
    if (!valido && vehiculos.length && Sesion.vehiculoGuardado() !== vehiculos[0].id_vehiculo) {
      Sesion.fijarVehiculo(vehiculos[0].id_vehiculo);   // primera unidad permitida
      Sesion.recargar();
      return;
    }

    document.body.classList.add(`rol-${sesion.tipo.toLowerCase()}`);
    this.#barra = new BarraSesion({
      api: this.#api,
      alTerminar: () => this.#salir("Se terminó el tiempo de tu prueba. La unidad se detuvo y quedó libre."),
    });
    this.#barra.dibujar(vehiculos);
    if (aviso) this.#ui.aviso(aviso, "info", 6000);
    this.#prepararGestion(sesion.tipo);

    if (!valido) {
      // Sesión válida pero sin unidades: no se abre WSS ni se piden datos de ningún vehículo
      document.body.classList.add("sin-unidad");
      this.#panel.fijarWebSocket("desconectado");
      this.#configurarNavegacion();
      return;
    }

    this.#conectarWebSocket();
    this.#crearJoystick();
    this.#configurarServicios();
    this.#conectarControles();
    this.#configurarEfectos();
    this.#ui.configurarPantallaCompleta();
    this.#configurarMonitoreo();
    this.#cargarDatos();
  }

  // ---------------- Sesión, roles y vista de gestión ----------------
  #prepararGestion(tipo) {
    const tab = document.getElementById("tabAdmin");
    const recargarDemos = () => { if (this.#catalogoListo) this.#demo.cargar().then(() => this.#actualizarHabilitacion()); };
    if (tipo === "ADMIN") {
      this.#vistaGestion = new VistaAdministracion({ api: this.#api, alCambiarDemos: recargarDemos });
    } else if (tipo === "USUARIO") {
      this.#vistaGestion = new VistaCuenta({ api: this.#api, alCambiarDemos: recargarDemos });
      tab.querySelector("span").textContent = "Mi cuenta";
    }
    tab.hidden = !this.#vistaGestion;     // el Invitado no tiene esta pestaña (y la API lo rechaza con 403)
    this.#vistaGestion?.iniciar();
  }

  /** Cierra la sesión local (sin pedir nada a la API) y vuelve a la pantalla de acceso. */
  #salir(aviso) {
    if (this.#saliendo) return;
    this.#saliendo = true;
    this.#ws?.detener();
    this.#mando.cancelar();
    Sesion.cerrar(aviso);
    this.#ui.aviso(aviso, "alerta", 4000);
    setTimeout(() => Sesion.recargar(), 1500);
  }

  #configurarNavegacion() {
    this.#navegacion = new Navegacion({
      alCambiar: (vista) => {
        if (vista !== "control") this.#soltarTodo("cambio de vista");   // nada queda presionado al salir de CONTROL
        if (vista === "monitoreo" && !document.body.classList.contains("sin-unidad")) {
          this.#monitoreo.sincronizar("volver a MONITOREO");
        }
        if (vista === "administracion") this.#vistaGestion?.mostrar();
      },
    });
    this.#navegacion.iniciar();
  }

  // ---------------- Navegación y MONITOREO ----------------
  #configurarMonitoreo() {
    this.#monitoreo.iniciar();                         // carga inicial REST (estado + 10 movimientos)
    document.getElementById("btnHistorialActualizar")
      .addEventListener("click", () => this.#monitoreo.sincronizar("botón actualizar"));

    this.#configurarNavegacion();

    // Al volver a la pestaña del navegador también se resincroniza
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.#monitoreo.sincronizar("pestaña visible de nuevo");
    });
  }

  // ---------------- WebSocket ----------------
  #conectarWebSocket() {
    // El token viaja en la URL porque el navegador no permite cabeceras en WebSocket.
    // FastAPI lo valida y comprueba el permiso sobre ESTA unidad antes de aceptar.
    this.#ws = new ClienteWS(() => `${CONFIG.WS_URL}?token=${encodeURIComponent(Sesion.token())}`, {
      onEstado: (estado) => {
        this.#panel.fijarWebSocket(estado);
        const antes = this.#wsEnLinea;
        this.#wsEnLinea = estado === "en-linea";
        this.#actualizarBaseTorreta();
        // Tras una RECONEXIÓN se recupera por REST lo que pudo perderse
        if (this.#wsEnLinea && !antes && this.#wsHaEstadoEnLinea) this.#monitoreo.sincronizar("reconexión WSS");
        if (this.#wsEnLinea) this.#wsHaEstadoEnLinea = true;
        if (!this.#wsEnLinea && antes) this.#monitoreo.sinConexion();
      },
      onMensaje: (evt) => this.#manejarEvento(evt),
      // El servidor rechazó o cerró el canal: se revisa si la sesión sigue vigente
      onRechazo: async () => {
        try {
          await this.#api.get(ENDPOINTS.yo());          // si da 401, #salir() se encarga
          this.#ui.aviso("El servidor no autorizó el canal WSS de esta unidad.", "error", 8000);
        } catch { /* 401 ya manejado */ }
      },
    });
    this.#ws.conectar();
    window.addEventListener("offline", () => this.#ws.forzarCierre());
    window.addEventListener("online", () => this.#ws.reconectarYa());
  }

  // Solo se procesan eventos del vehículo propio
  #manejarEvento(evt) {
    if (evt.id_vehiculo !== undefined && Number(evt.id_vehiculo) !== CONFIG.VEHICULO_ID) return;
    if (evt.evento === "PRUEBA_INVITADO_FIN" && Sesion.tipo() === "INVITADO") {
      this.#salir("Tu prueba terminó. La unidad se detuvo y quedó libre.");
      return;
    }
    if (evt.evento === "ACCESO_REVOCADO") {
      if (Sesion.tipo() === "INVITADO") this.#salir("Tu prueba terminó. La unidad se detuvo y quedó libre.");
      else {
        this.#ui.aviso(`Acceso a esta unidad revocado: ${evt.motivo ?? ""}`, "alerta", 6000);
        Sesion.fijarVehiculo("");
        setTimeout(() => Sesion.recargar(), 2500);
      }
      return;
    }
    this.#ui.registrarEvento(evt);
    this.#comandos.recibirEvento(evt);
    this.#demo.recibirEvento(evt);
    this.#monitoreo.recibirEvento(evt);
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
          this.#demo.activa ? "Control bloqueado mientras se ejecuta una DEMO." : "Cargando catálogo de comandos…",
          "alerta"),
      },
    );
  }

  // ---------------- Servicios ----------------
  #configurarServicios() {
    this.#comandos.configurar({
      estaDemoActiva: () => this.#demo.activa,
      cancelarDemo: () => this.#demo.cancelar(),
      alRechazo: () => this.#ordenRechazada(),
    });
    this.#demo.configurar({
      alCambiarEstado: () => this.#actualizarHabilitacion(),
      alRechazo: () => this.#ordenRechazada(),
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

  // La API rechazó una orden de control (403 sin permiso, 409 otra sesión controla, 429 exceso)
  #ordenRechazada() {
    this.#mando.cancelar();
    this.#efectos.detenerReversa();
    this.#torreta.volver();
  }

  #actualizarHabilitacion() {
    const libre = this.#catalogoListo && !this.#demo.activa;
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
