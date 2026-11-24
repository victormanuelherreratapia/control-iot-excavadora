// =====================================================================
// Ayudantes de DOM. Todo texto se inserta con textContent (los datos que
// vienen de la API nunca se interpretan como HTML).
// =====================================================================
import { FechaHora } from "./FechaHora.js";

/**
 * el("button", { class: "btn", onclick: fn, dataset: { id: 3 } }, "Texto", otroNodo)
 */
export function el(tag, attrs = {}, ...hijos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "dataset") Object.assign(n.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (k === "value") n.value = v;
    else if (v === true) n.setAttribute(k, "");
    else n.setAttribute(k, String(v));
  }
  for (const h of hijos.flat()) {
    if (h === null || h === undefined || h === false) continue;
    n.append(h instanceof Node ? h : document.createTextNode(String(h)));
  }
  return n;
}

export function icono(nombre) {
  return el("i", { class: `bi ${nombre}`, "aria-hidden": "true" });
}

/** Fecha/hora UTC del servidor → "dd/mm/aaaa hh:mm:ss" (hora de México). */
export function fechaHora(texto) {
  const f = FechaHora.formatear(texto);
  return f ? `${f.fecha} ${f.hora}` : "—";
}

/** Mensaje de estado accesible bajo un formulario. */
export function mensaje(nodo, texto, tipo = "info") {
  nodo.textContent = texto;
  nodo.dataset.tipo = tipo;
}

/** Botón deshabilitado mientras corre una promesa (evita dobles envíos). */
export async function conEspera(boton, accion) {
  const original = boton.disabled;
  boton.disabled = true;
  boton.setAttribute("aria-busy", "true");
  try {
    return await accion();
  } finally {
    boton.disabled = original;
    boton.removeAttribute("aria-busy");
  }
}

export const ETIQUETA_ESTADO = Object.freeze({
  DISPONIBLE: "Disponible",
  VENDIDO: "Vendido / asignado",
  EXHIBICION: "Exhibición",
  INACTIVO: "Inactivo",
});

export function insigniaEstado(estado) {
  return el("span", { class: `insignia insignia-${String(estado).toLowerCase()}` }, ETIQUETA_ESTADO[estado] ?? estado);
}
