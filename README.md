# Excavadora IoT · Control, Monitoreo y Administración

Plataforma web responsiva (Mobile First) para **controlar**, **monitorear** y **administrar comercialmente** vehículos IoT. Permite controlar una excavadora IoT (joystick virtual, botones táctiles, paro de emergencia y DEMO) y **monitorear** en tiempo real sus últimos movimientos, consumiendo la API REST y el WebSocket (WSS) desplegados en AWS con Amazon RDS.

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
| **ADMINISTRACIÓN** (práctica 4.3) | Dashboard, unidades, clientes, modelos, demos de fábrica, invitados y auditoría. Para el Usuario es **Mi cuenta**: Mis vehículos, soporte y demos privadas |

Las tres vistas están en la misma página y comparten **una sola conexión WSS**. Los 3 indicadores (WebSocket, API AWS y Amazon RDS) se ven en todas.

## Práctica 4.3 · Plataforma comercial

### Roles
| Rol | Quién es | Qué puede hacer |
|---|---|---|
| **ADMIN** | La empresa | Modelos, unidades, clientes, asignaciones, demos de fábrica, clave de dispositivo y auditoría. Opera unidades de la empresa (Disponible/Exhibición); una unidad **vendida** solo con soporte autorizado por el comprador |
| **USUARIO** | Comprador | Solo sus unidades: Control, Monitoreo, demos privadas y autorizar soporte |
| **INVITADO** | Cliente potencial | Catálogo público y prueba de **5 minutos** de una unidad de exhibición, con comandos reducidos y reserva exclusiva |

La seguridad real está en FastAPI: cada ruta REST y cada canal WSS comprueba **identidad + rol + permiso sobre la unidad concreta** (propiedad, reserva o soporte). Ocultar botones en la página no es la protección.

### Arquitectura
```
Navegador (GitHub Pages) ──HTTPS/REST + Bearer──▶ Caddy ─▶ FastAPI (EC2) ─▶ Amazon RDS MySQL
        ▲                                                   │
        └────────────── WSS ?token=… (por unidad) ◀─────────┤
ESP8266 (excavadora) ◀── WSS ?dispositivo=CLAVE ◀────────────┘
```
El navegador **nunca** se conecta a RDS. El ESP8266 se autentica con una clave de dispositivo; el servidor guarda solo su SHA-256.

### Base de datos (migración V001)
- **Se conservan:** `vehiculos` (ahora es la **unidad física**; su `id_vehiculo` sigue siendo el ID de Control), `comandos`, `estado_vehiculo`, `historial_comandos`, `demos`, `demo_movimientos` y los 21 procedimientos almacenados.
- **Se alteran:** `vehiculos` (+ modelo, número de serie único, estado comercial, propietario, soporte, clave del dispositivo), `comandos` (+ `permitido_invitado`), `demos` (+ tipo FÁBRICA/PRIVADA y propietario) e `historial_comandos` (índice para los 10 más recientes y `ON DELETE RESTRICT`, para que nunca se borre el historial).
- **Se crean:** `roles`, `usuarios`, `modelos`, `asignaciones`, `sesiones` y `auditoria`.

```
roles 1─* usuarios 1─* vehiculos(propietario) *─1 modelos
usuarios 1─* asignaciones *─1 vehiculos 1─* historial_comandos
vehiculos 1─* comandos     vehiculos 1─* demos 1─* demo_movimientos
usuarios 1─* sesiones *─1 vehiculos(reserva invitado)     usuarios 1─* auditoria
```
Las migraciones están en el repositorio del backend (`migraciones/`): `V001` (UP), `V001_DOWN` (reversión) y `migrar.py` (copia de prueba, aplicación, verificación y conteos antes/después). Se probaron primero en `vehiculo_iot_prueba` y después en RDS, con el snapshot `respaldo-antes-4-3`. En MySQL el DDL hace *commit* implícito, por eso no se confía en ROLLBACK.

### APIs nuevas (además de las 21 existentes)
| Función | Rutas |
|---|---|
| Sesión | `POST /auth/login` · `POST /auth/logout` · `GET /auth/yo` |
| Catálogo e invitado | `GET /catalogo` · `POST /invitado/sesiones` · `DELETE /invitado/sesiones/actual` |
| Comprador | `GET /mis-vehiculos` · `POST/DELETE /mis-vehiculos/{id}/soporte` |
| Demos (editor) | `GET /demos/{id}` · `POST /demos-editor` · `PUT/DELETE /demos-editor/{id}` |
| Administración | `/admin/dashboard` · `/admin/usuarios` · `/admin/modelos` · `/admin/unidades` · `/admin/unidades/{id}/asignar` · `/desasignar` · `/clave-dispositivo` · `/admin/asignaciones` · `/admin/auditoria` · `/admin/sesiones-invitado` |
| Salud | `GET /api/v1/salud` (diagnóstico de RDS hecho por el backend) |

Todas con prefijo `/api/v1`. Respuestas: **401** sin sesión, **403** sin permiso, **404** para no revelar unidades ajenas, **409** unidad ocupada o en conflicto, **422** datos no válidos, **429** exceso de peticiones. Documentación: https://vehiculoiot-victor.duckdns.org/docs

### Seguridad física
- Solo **una sesión** mueve una unidad a la vez; **DETENER** siempre tiene prioridad y cancela la DEMO.
- El invitado tiene 5 minutos; al vencer, cerrar o perder la conexión, el servidor envía **DETENER** y libera la unidad.
- Demos: máx. 20 pasos, 100–5000 ms por paso y 60 s en total, solo con comandos de la misma unidad.

### Variables de entorno del backend (solo nombres)
`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`, `API_KEY`, `SESION_HORAS`, `INVITADO_MINUTOS`, `INVITADO_GRACIA_SEG`, `BLOQUEO_CONTROL_SEG`, `MAX_COMANDOS_POR_SEG`, `WS_PERMITIR_SIN_CLAVE`

### Pruebas realizadas
| # | Prueba | Resultado |
|---|---|---|
| P01 | Login Admin (y contraseña incorrecta rechazada) | Correcto |
| P02 | Alta de unidad EXC-0002 | Correcto |
| P03 | Alta de cliente | Correcto |
| P04 | Asignación de EXC-0001 al cliente | Correcto |
| P05 | El comprador solo ve sus unidades (sin unidades no ve nada) | Correcto |
| P06 | Control de la excavadora real por el comprador | Correcto |
| P07 | Eventos WSS por unidad | Correcto |
| P08 | Historial de 10 en MONITOREO | Correcto |
| P09 | Demo privada guardada en RDS | Correcto |
| P10 | Ejecución y cancelación de demo | Correcto |
| P11 | Prueba de Invitado (5 min, comandos reducidos) | Correcto |
| P12 | Invitado intenta Administración → 403 | Correcto |
| P13 | Acceso a unidad ajena → 403/404 | Correcto |
| P14 | Exclusividad: segunda prueba rechazada (unidad ocupada) | Correcto |
| P15 | Reconexión WSS y resincronización | Correcto |
| P16 | Diseño responsive (celular y PC) | Correcto |
| P17 | Auditoría de logins, asignaciones y rechazos | Correcto |

### Limitaciones
- "En línea" del WebSocket indica la conexión del navegador; la conexión del ESP8266 se verifica aparte (columna Conectividad).
- La exclusividad de control y los límites de peticiones viven en la memoria del servidor: si la API se reinicia, se reinician también.
- El Learner Lab apaga EC2 y RDS; al encenderlos, RDS puede tardar unos minutos y el indicador lo marca como no disponible mientras tanto.

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
| `assets/css/admin.css` | Acceso, barra de sesión y vista de administración |
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
| `assets/js/Sesion.js` | Token de la sesión por pestaña (sessionStorage) |
| `assets/js/PantallaAcceso.js` | Login y catálogo «Prueba nuestros vehículos IoT» |
| `assets/js/BarraSesion.js` | Rol, Mis vehículos, reloj del invitado y salir |
| `assets/js/VistaAdministracion.js` | Dashboard, unidades, clientes, modelos, demos, invitados y auditoría |
| `assets/js/VistaCuenta.js` | Mi cuenta del comprador |
| `assets/js/EditorDemos.js` | Editor de demos con pasos ordenados |
| `assets/js/Dom.js` | Ayudantes de DOM seguros (textContent) |

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

Desde la 4.3 todas las rutas de vehículos requieren sesión (`Authorization: Bearer`) y permiso sobre la unidad.

## Ejecución local
Abrir la carpeta en VS Code y usar **Live Server** (`http://127.0.0.1:5500`). No abrir `index.html` con doble clic (`file://`).

## Seguridad
- Sin claves de AWS, credenciales de RDS ni API key en el repositorio.
- CORS del backend limitado a GitHub Pages y Live Server (CORS no es autenticación).
- Los datos de la API se muestran con `textContent` (sin inyección en el DOM).
- Un evento WebSocket confirma que AWS publicó la orden, no el movimiento físico.
