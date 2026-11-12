# Excavadora IoT · Control y Monitoreo

Aplicación web responsiva (Mobile First) para **controlar** una excavadora IoT (joystick virtual, botones táctiles, paro de emergencia y DEMO) y **monitorear** en tiempo real sus últimos movimientos, consumiendo la API REST y el WebSocket (WSS) desplegados en AWS con Amazon RDS.

**Autor:** Víctor Manuel Herrera Tapia · TecNM Campus Pachuca · Implementación de Soluciones IoT · 2026

**Sitio publicado:** https://victormanuelherreratapia.github.io/control-iot-excavadora/
**Monitoreo directo:** https://victormanuelherreratapia.github.io/control-iot-excavadora/#monitoreo

## Tecnologías
HTML5 · CSS3 · Bootstrap 5 · JavaScript ES6+ (módulos nativos y POO) · Fetch API + async/await · WebSocket nativo · GitHub Pages

## Vistas
| Vista | Contenido |
|---|---|
| **CONTROL** (práctica 4.1) | Joystick, botones, mantener presionado, paro de emergencia con torreta y DEMO |
| **MONITOREO** (práctica 4.2) | Tarjeta del último movimiento con fecha y hora reales, y tabla de los últimos 10 movimientos individuales |

Ambas vistas están en la misma página y comparten **una sola conexión WSS**. Los 3 indicadores (WebSocket, API AWS y Amazon RDS) se ven en las dos.

## Funcionamiento del monitoreo (4.2)
- **Carga inicial por REST:** `GET /estado` (último movimiento) y `GET /historial` (10 movimientos).
- **Tiempo real por WSS:** un `MOVIMIENTO_INDIVIDUAL` actualiza la tarjeta al instante y pide de nuevo el historial a RDS (las ráfagas se agrupan en una sola consulta).
- **DEMO:** sus pasos (`DEMO_MOVIMIENTO`) se muestran en la tarjeta, pero **no** en la tabla, porque no se guardan como movimientos individuales.
- **Resincronización:** al reconectar el WSS, al volver a la vista MONITOREO, al regresar a la pestaña del navegador o con el botón *Actualizar*.
- **Reglas de datos:** solo el vehículo 1, sin duplicados (`id_historial`), del más nuevo al más antiguo, máximo 10; un dato más viejo nunca reemplaza a uno más nuevo.
- **Hora:** RDS guarda en UTC; la página la muestra en hora de México (America/Mexico_City).

## Estructura
```
control-iot-excavadora/
├── index.html
├── README.md
└── assets/
    ├── css/   styles, estop, movil, vertical, monitoreo
    ├── js/    clases de la aplicación (POO, módulos ES6)
    └── img/   favicon.svg
```

| Archivo | Responsabilidad |
|---|---|
| `index.html` | Página principal (pestañas CONTROL / MONITOREO) |
| `assets/css/styles.css` | Estilos base y diseño responsivo |
| `assets/css/estop.css` | Paro de emergencia y torreta |
| `assets/css/movil.css` · `assets/css/vertical.css` | Celular horizontal y vertical |
| `assets/css/monitoreo.css` | Pestañas, tarjeta y tabla de monitoreo |
| `assets/img/favicon.svg` | Favicon propio |
| `assets/js/app.js` | `AplicacionControl`: crea y coordina los objetos |
| `assets/js/config.js` | URL de la API, WSS y catálogo visual (sin secretos) |
| `assets/js/ClienteApi.js` | Cliente REST (Fetch, tiempo límite y errores) |
| `assets/js/ClienteWS.js` | WebSocket WSS único con reconexión |
| `assets/js/PanelEstado.js` | Indicadores WSS / API AWS / Amazon RDS |
| `assets/js/Interfaz.js` | Botones, avisos, etapas y registro |
| `assets/js/ServicioComandos.js` | Envío de comandos y prioridad de DETENER |
| `assets/js/ServicioDemo.js` | Cargar, iniciar y cancelar DEMO |
| `assets/js/ControlContinuo.js` | Mantener presionado |
| `assets/js/Joystick.js` | Joystick táctil, con mouse y con teclado |
| `assets/js/Torreta.js` · `assets/js/Efectos.js` | Baliza, sonidos y vibración |
| `assets/js/Navegacion.js` | Pestañas CONTROL / MONITOREO |
| `assets/js/ServicioMonitoreo.js` | Lógica del monitoreo (REST + WSS) |
| `assets/js/VistaMonitoreo.js` | Tarjeta y tabla en el DOM |
| `assets/js/FechaHora.js` | Conversión UTC → hora de México |

## Integración con la API (AWS)
| Uso | Método y ruta |
|---|---|
| Disponibilidad de la API | `GET /` |
| Vehículo | `GET /api/v1/vehiculos/{id}` |
| Comandos | `GET /api/v1/vehiculos/{id}/comandos` |
| Último movimiento / diagnóstico de RDS | `GET /api/v1/vehiculos/{id}/estado` |
| **Últimos 10 movimientos** | `GET /api/v1/vehiculos/{id}/historial` |
| DEMO | `GET /api/v1/vehiculos/{id}/demos` |
| Movimiento | `POST /api/v1/movimientos/individual` |
| Iniciar DEMO | `POST /api/v1/vehiculos/{id}/demos/{id_demo}/iniciar` |
| Cancelar DEMO | `POST /api/v1/vehiculos/{id}/demos/cancelar` |
| Eventos en tiempo real | `WSS /ws/vehiculo/{id}` |

Las rutas de control y las consultas son públicas; las rutas de administración siguen protegidas con `X-API-Key` en el backend.

## Ejecución local
Abrir la carpeta en VS Code y usar **Live Server** (`http://127.0.0.1:5500`). No abrir `index.html` con doble clic (`file://`).

## Seguridad
- Sin claves de AWS, credenciales de RDS ni API key en el repositorio.
- CORS del backend limitado a GitHub Pages y Live Server (CORS no es autenticación).
- Los datos de la API se muestran con `textContent` (sin inyección en el DOM).
- Un evento WebSocket confirma que AWS publicó la orden, no el movimiento físico.
