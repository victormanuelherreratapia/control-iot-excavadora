# Excavadora IoT · Aplicación de Control

Aplicación web responsiva (Mobile First) para controlar una excavadora IoT mediante joystick virtual, botones táctiles, paro de emergencia y secuencias DEMO, consumiendo la API REST y el WebSocket (WSS) desplegados en AWS.

**Autor:** Víctor Manuel Herrera Tapia · TecNM Campus Pachuca · Implementación de Soluciones IoT · 2026

**Sitio publicado:** https://victormanuelherreratapia.github.io/control-iot-excavadora/

## Tecnologías
HTML5 · CSS3 · Bootstrap 5 · JavaScript ES6+ (módulos nativos y POO) · Fetch API + async/await · WebSocket nativo · GitHub Pages

## Estructura

| Archivo | Responsabilidad |
|---|---|
| `index.html` | Página principal |
| `css/styles.css` | Estilos y diseño responsivo |
| `css/estop.css` | Paro de emergencia y torreta |
| `assets/favicon.svg` | Favicon propio |
| `js/app.js` | `AplicacionControl`: crea y coordina los objetos |
| `js/config.js` | URL de la API, WSS y catálogo visual (sin secretos) |
| `js/SesionOperador.js` | Clave de operación (solo en la pestaña) |
| `js/ClienteApi.js` | Cliente REST (Fetch, tiempo límite y errores) |
| `js/ClienteWS.js` | WebSocket WSS con reconexión |
| `js/PanelEstado.js` | Indicadores WSS / API AWS / Amazon RDS |
| `js/Interfaz.js` | Botones, avisos, etapas y registro |
| `js/ServicioComandos.js` | Envío único de comandos y prioridad de DETENER |
| `js/ServicioDemo.js` | Cargar, iniciar y cancelar DEMO |
| `js/ControlContinuo.js` | Mantener presionado |
| `js/Joystick.js` | Joystick táctil, con mouse y con teclado |
| `js/Torreta.js` | Baliza de estado |
| `js/Efectos.js` | Pitido de reversa, alarma y vibración |

## Integración con la API (AWS)

| Uso | Método y ruta |
|---|---|
| Disponibilidad de la API | `GET /` |
| Vehículo | `GET /api/v1/vehiculos/{id}` |
| Comandos | `GET /api/v1/vehiculos/{id}/comandos` |
| Diagnóstico indirecto de RDS | `GET /api/v1/vehiculos/{id}/estado` |
| DEMO | `GET /api/v1/vehiculos/{id}/demos` |
| Movimiento | `POST /api/v1/movimientos/individual` |
| Iniciar DEMO | `POST /api/v1/vehiculos/{id}/demos/{id_demo}/iniciar` |
| Cancelar DEMO | `POST /api/v1/vehiculos/{id}/demos/cancelar` |
| Eventos en tiempo real | `WSS /ws/vehiculo/{id}` |

Los POST requieren la cabecera `X-API-Key`. La clave **no** está en el código: el operador la escribe en la página y se guarda solo en la pestaña (sessionStorage).

## Ejecución local
Abrir la carpeta en VS Code y usar **Live Server** (`http://127.0.0.1:5500`). No abrir `index.html` con doble clic (`file://`).

## Seguridad
- Sin claves de AWS, credenciales de RDS ni API key en el repositorio.
- CORS del backend limitado a GitHub Pages y Live Server (CORS no es autenticación).
- Los datos de la API se muestran con `textContent` (sin inyección en el DOM).
- Un evento WebSocket confirma que AWS publicó la orden, no el movimiento físico.
