/**
 * `showViewAsBanner()`: la franja de «Ver como». Un administrador entra con el rol de otra persona
 * para probar permisos, y la franja no deja olvidarlo: fija arriba de todo (capa superior, sobre los
 * diálogos), color de advertencia, empuja el contenido y marca el título de la pestaña.
 *
 *   const quitar = showViewAsBanner({ id: "u7", name: "Laura Gómez", role: "Auxiliar contable" }, { onExit: salir });
 *
 * Pone en `<html>` `data-nx-view-as` (con el id) y `--nx-view-as-offset: 36px`: el sidemenu o la
 * barra fija de la app pueden usar esa variable. Una sola franja a la vez: llamar de nuevo reemplaza.
 */
import { h } from "../../core/dom";
import { mergeLabels } from "../../core/labels";

export interface ViewAsUser {
  id: string;
  name: string;
  role?: string;
  avatar?: string;
}
export interface ViewAsLabels {
  /** `{name}` va en negrita; sin rol, « ({role})» se quita. */
  banner: string;
  exit: string;
  /** Prefijo del título de la pestaña. */
  title?: string;
}

export const VIEW_AS_LABELS: Required<ViewAsLabels> = {
  banner: "Estás viendo como {name} ({role})",
  exit: "Salir de ver como",
  title: "[Ver como] ",
};

/** Alto de la franja: lo que se empuja el contenido. */
export const VIEW_AS_OFFSET = "36px";

/** El ojo de la franja (constante, no un dato). `glyph()` del núcleo arrastraría su registro. */
const EYE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/></svg>';

let hide: (() => void) | null = null;
let seq = 0;

/** Muestra la franja «Estás viendo como {name} ({role}) · Salir». Devuelve la función que la quita. Una sola franja a la vez. */
export function showViewAsBanner(user: ViewAsUser, opts: { labels?: Partial<ViewAsLabels>; onExit: () => void }): () => void {
  hide?.();
  if (typeof document === "undefined") return () => {};
  const L = mergeLabels(VIEW_AS_LABELS, opts?.labels);
  const name = String(user?.name ?? "");
  const role = user?.role ? String(user.role) : "";
  const root = document.documentElement;
  const id = `nx-viewas${++seq}`;

  // Todo como texto: el nombre y el rol vienen de datos.
  const text = h("p", { class: "nx-viewas__text", id });
  L.banner.split("{name}").forEach((part, i) => {
    if (i) text.append(h("strong", null, name));
    // Con función: un «$&» en el rol es texto, no un patrón de reemplazo.
    text.append(role ? part.replaceAll("{role}", () => role) : part.replace(/\s*\(\{role\}\)|\{role\}/g, ""));
  });
  const sentence = text.textContent ?? "";
  text.title = sentence;
  const exit = h("button", { type: "button", class: "nx-viewas__exit" }, L.exit);
  const status = h("span", { class: "nx-viewas__sr", role: "status" });
  const bar = h("div", { class: "nx-viewas", role: "region", "aria-labelledby": id, popover: "manual", "data-enter": "" }, text, exit, status);
  bar.insertAdjacentHTML("afterbegin", EYE);
  exit.addEventListener("click", () => opts.onExit());
  bar.addEventListener("animationend", () => bar.removeAttribute("data-enter"));

  const show = () => {
    try {
      bar.showPopover?.();
    } catch {
      /* sin Popover API: `position: fixed` */
    }
  };
  // Un diálogo que se abre después queda encima: la franja vuelve a subir.
  const raise = () => {
    try {
      bar.hidePopover?.();
    } catch {
      /* ya oculta */
    }
    show();
  };
  // El título lleva el prefijo aunque la app lo cambie (una ruta nueva de una SPA).
  const pre = L.title;
  const mark = () => {
    if (pre && !document.title.startsWith(pre)) document.title = pre + document.title;
  };
  const mo = typeof MutationObserver !== "undefined" && document.head ? new MutationObserver(mark) : null;

  document.body.append(bar);
  show();
  root.style.setProperty("--nx-view-as-offset", VIEW_AS_OFFSET);
  root.setAttribute("data-nx-view-as", String(user?.id ?? ""));
  mark();
  mo?.observe(document.head, { subtree: true, childList: true, characterData: true });
  document.addEventListener("nx-open-change", raise);
  // Se anuncia una vez: la región `status` ya está en el DOM cuando recibe el texto.
  setTimeout(() => (status.textContent = sentence), 50);

  let done = false;
  const remove = () => {
    if (done) return;
    done = true;
    if (hide === remove) hide = null;
    mo?.disconnect();
    document.removeEventListener("nx-open-change", raise);
    try {
      bar.hidePopover?.();
    } catch {
      /* ya oculta */
    }
    bar.remove();
    root.removeAttribute("data-nx-view-as");
    root.style.removeProperty("--nx-view-as-offset");
    if (pre && document.title.startsWith(pre)) document.title = document.title.slice(pre.length);
  };
  hide = remove;
  return remove;
}
