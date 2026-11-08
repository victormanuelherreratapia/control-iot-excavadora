// =====================================================================
// Configuración pública de la aplicación (NO contiene secretos)
// =====================================================================

export const VEHICULO_ID = 1;

export const CONFIG = Object.freeze({
  API_BASE_URL: "https://vehiculoiot-victor.duckdns.org",
  WS_URL: `wss://vehiculoiot-victor.duckdns.org/ws/vehiculo/${VEHICULO_ID}`,
  VEHICULO_ID,
  ORIGEN: "WebControl_Excavadora",   // valor del campo "origen" en los POST
  TIMEOUT_MS: 8000,                   // tiempo máximo de una solicitud REST
  TIMEOUT_SALUD_MS: 5000,             // tiempo máximo de la comprobación GET /
  SALUD_INTERVALO_MS: 15000,          // cada cuánto se comprueba la API
  RDS_INTERVALO_MS: 30000,            // cada cuánto se comprueba RDS a través de la API
  EVENTO_ESPERA_MS: 6000,             // espera del evento WSS tras un POST aceptado
  DEMO_SIN_EVENTOS_MS: 30000,         // libera el control si una DEMO deja de emitir eventos
  WS_RECONEXION_MIN_MS: 1000,
  WS_RECONEXION_MAX_MS: 15000,
  REPETIR_MANTENIDO_MS: 500,          // repetición mientras se mantiene presionado (el firmware suelta a los 800 ms)
});

// Rutas reales documentadas en Swagger (no se inventa ninguna)
export const ENDPOINTS = Object.freeze({
  salud:        () => "/",
  vehiculo:     (id) => `/api/v1/vehiculos/${id}`,
  comandos:     (id) => `/api/v1/vehiculos/${id}/comandos`,
  estado:       (id) => `/api/v1/vehiculos/${id}/estado`,   // SP: sp_obtener_estado (consulta RDS)
  demos:        (id) => `/api/v1/vehiculos/${id}/demos`,
  movimiento:   () => "/api/v1/movimientos/individual",
  iniciarDemo:  (id, idDemo) => `/api/v1/vehiculos/${id}/demos/${idDemo}/iniciar`,
  cancelarDemo: (id) => `/api/v1/vehiculos/${id}/demos/cancelar`,
});

// Comandos que controla el joystick (deben existir en el catálogo de la API)
export const COMANDOS_JOYSTICK = Object.freeze(["AVANZAR", "RETROCEDER", "GIRAR_IZQUIERDA", "GIRAR_DERECHA"]);
export const COMANDO_DETENER = "DETENER";

// Botones de encender/apagar: un solo pulso por clic (no se mantienen)
export const COMANDOS_PULSO = Object.freeze(["SONIDO", "LED", "DEMO_CONTROL"]);

// Presentación personalizada: nombre visible e icono por comando de la API.
// Los nombres y códigos reales siempre vienen de GET /comandos.
export const CATALOGO_UI = Object.freeze({
  AVANZAR:         { etiqueta: "Avanzar",          icono: "bi-arrow-up-circle-fill" },
  RETROCEDER:      { etiqueta: "Retroceder",       icono: "bi-arrow-down-circle-fill" },
  GIRAR_IZQUIERDA: { etiqueta: "Girar izquierda",  icono: "bi-arrow-left-circle-fill" },
  GIRAR_DERECHA:   { etiqueta: "Girar derecha",    icono: "bi-arrow-right-circle-fill" },
  SUBIR_BRAZO:     { etiqueta: "Subir pala",       icono: "bi-arrow-bar-up" },
  BAJAR_BRAZO:     { etiqueta: "Bajar pala",       icono: "bi-arrow-bar-down" },
  ABRIR_PALA:      { etiqueta: "Giro pala izq.",   icono: "bi-arrow-counterclockwise" },
  CERRAR_PALA:     { etiqueta: "Giro pala der.",   icono: "bi-arrow-clockwise" },
  SONIDO:          { etiqueta: "Sonido",           icono: "bi-volume-up-fill" },
  LED:             { etiqueta: "Luz LED",          icono: "bi-lightbulb-fill" },
  DEMO_CONTROL:    { etiqueta: "Demo del control", icono: "bi-controller" },
  DETENER:         { etiqueta: "Detener",          icono: "bi-sign-stop-fill" },
});

export function etiquetaComando(nombre) {
  return CATALOGO_UI[nombre]?.etiqueta ?? String(nombre ?? "").replaceAll("_", " ").toLowerCase();
}
