// =====================================================================
// Clase Sesion: guarda el token de ESTA pestaña (sessionStorage).
// El navegador solo guarda el token; el rol y los permisos reales los
// decide FastAPI en cada petición (nunca se confía en estos datos).
// Cada pestaña tiene su propia sesión: sirve para probar Admin, Usuario
// e Invitado al mismo tiempo en pestañas distintas.
// =====================================================================
import { FechaHora } from "./FechaHora.js";

const CLAVE = "iot.sesion";
const CLAVE_VEHICULO = "iot.vehiculo";
const CLAVE_AVISO = "iot.aviso";

function leer(clave) {
  try { return sessionStorage.getItem(clave); } catch { return null; }
}
function escribir(clave, valor) {
  try {
    if (valor === null) sessionStorage.removeItem(clave);
    else sessionStorage.setItem(clave, valor);
  } catch { /* almacenamiento bloqueado: la sesión dura lo que dure la página */ }
}

export class Sesion {
  static #memoria = null;

  /** @returns {{token:string, tipo:string, nombre:string, correo?:string, id_usuario?:number, expira:string, id_vehiculo?:number} | null} */
  static actual() {
    if (Sesion.#memoria) return Sesion.#memoria;
    try {
      const s = JSON.parse(leer(CLAVE) ?? "null");
      if (s && typeof s.token === "string" && (FechaHora.aMs(s.expira) ?? 0) > Date.now()) {
        Sesion.#memoria = s;
        return s;
      }
    } catch { /* dato corrupto */ }
    return null;
  }

  static guardar(datos) {
    Sesion.#memoria = datos;
    escribir(CLAVE, JSON.stringify(datos));
  }

  static cerrar(aviso = "") {
    Sesion.#memoria = null;
    escribir(CLAVE, null);
    escribir(CLAVE_VEHICULO, null);
    if (aviso) escribir(CLAVE_AVISO, aviso);
  }

  /** Expiración en ms (la API la envía en UTC sin zona; FechaHora la interpreta como UTC). */
  static expiraMs() { return FechaHora.aMs(Sesion.actual()?.expira) ?? 0; }

  static token() { return Sesion.actual()?.token ?? ""; }
  static tipo() { return Sesion.actual()?.tipo ?? null; }

  static fijarVehiculo(id) { escribir(CLAVE_VEHICULO, String(id)); }
  static vehiculoGuardado() { return Number(leer(CLAVE_VEHICULO)) || null; }

  /** Mensaje para mostrar después de recargar (p. ej. «tu prueba terminó»). */
  static tomarAviso() {
    const a = leer(CLAVE_AVISO);
    escribir(CLAVE_AVISO, null);
    return a;
  }

  /** Recarga limpia: cierra el WSS actual y vuelve a crear todo con la sesión/unidad nueva. */
  static recargar() {
    location.reload();
  }
}
