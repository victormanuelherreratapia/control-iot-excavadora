import hmac
import re

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse

from app.config import settings
from app.routers import vehiculos, websockets, control_demo

app = FastAPI(
    title="API Vehículo IoT - Entorno Dev",
    description="API REST con FastAPI, POO, RDS MySQL y WebSockets para el control de vehículos IoT.",
    version="1.0.0"
)

METODOS_SEGUROS = {"GET", "HEAD", "OPTIONS"}

# Operaciones de CONTROL que la aplicación web usa sin clave.
# El resto de los POST (crear, actualizar y eliminar vehículos, comandos y DEMO)
# siguen protegidos con X-API-Key para que nadie pueda modificar RDS.
RUTAS_CONTROL_PUBLICAS = [
    re.compile(r"^/api/v1/movimientos/individual$"),
    re.compile(r"^/api/v1/vehiculos/\d+/demos/\d+/iniciar$"),
    re.compile(r"^/api/v1/vehiculos/\d+/demos/cancelar$"),
]


def es_ruta_control_publica(ruta: str) -> bool:
    return any(patron.match(ruta) for patron in RUTAS_CONTROL_PUBLICAS)


# Orígenes autorizados para la aplicación web de CONTROL (práctica 4.1).
# CORS solo indica qué páginas pueden llamar a la API desde el navegador;
# NO es autenticación.
ORIGENES_PERMITIDOS = [
    "https://victormanuelherreratapia.github.io",  # GitHub Pages
    "http://127.0.0.1:5500",                        # Live Server (pruebas locales)
    "http://localhost:5500",
]


@app.middleware("http")
async def proteger_operaciones(request: Request, call_next):
    """Exige X-API-Key en los POST administrativos; las rutas de control son públicas."""
    if request.method not in METODOS_SEGUROS and not es_ruta_control_publica(request.url.path):
        clave = request.headers.get("x-api-key", "")
        esperada = settings.API_KEY
        if not esperada or not hmac.compare_digest(clave.encode(), esperada.encode()):
            return JSONResponse(
                status_code=401,
                content={"detail": "API key inválida o ausente"},
            )
    return await call_next(request)


# CORS se agrega después del middleware de la API key para que quede como la capa
# más externa: así también las respuestas 401 llevan los encabezados CORS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGENES_PERMITIDOS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key"],
    allow_credentials=False,
    max_age=600,
)


app.include_router(vehiculos.router)
app.include_router(websockets.router)
app.include_router(control_demo.router)


def custom_openapi():
    """Muestra el candado (Authorize) solo en los POST que siguen protegidos."""
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    schema.setdefault("components", {}).setdefault("securitySchemes", {})["ApiKeyAuth"] = {
        "type": "apiKey",
        "in": "header",
        "name": "X-API-Key",
    }
    for path, metodos in schema["paths"].items():
        ruta_ejemplo = re.sub(r"\{[^}]+\}", "1", path)
        for metodo, operacion in metodos.items():
            if metodo.lower() == "post" and not es_ruta_control_publica(ruta_ejemplo):
                operacion["security"] = [{"ApiKeyAuth": []}]
    app.openapi_schema = schema
    return schema


app.openapi = custom_openapi


@app.get("/", tags=["Root"])
def root():
    return {"mensaje": "Servidor de API IoT ejecutándose correctamente"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
