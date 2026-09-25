/**
 * Registro de íconos. La librería no trae íconos en su núcleo: la app registra los que usa
 * (`registerIcons(lucide)` desde `nx-ui/icons`, o los suyos) y los datos solo los NOMBRAN.
 *
 * Un valor puede ser un `<svg>` completo o solo su contenido (paths de 24×24, trazo de Lucide).
 * Lo registra el desarrollador, no el backend: es el único HTML que la librería interpreta.
 * Un nombre que no está registrado se pinta como las iniciales de la etiqueta, para que el
 * modo compacto nunca deje una fila vacía.
 */
const registry = new Map<string, string>();
const cache = new Map<string, Element>();

const SVG_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">';

export function registerIcons(icons: Record<string, string>): void {
  for (const [name, svg] of Object.entries(icons)) {
    registry.set(name, svg.trimStart().startsWith("<svg") ? svg : `${SVG_OPEN}${svg}</svg>`);
    cache.delete(name);
  }
}

export function hasIcon(name: string | undefined): boolean {
  return !!name && registry.has(name);
}

function svgFor(name: string): Element | null {
  let el = cache.get(name);
  if (!el) {
    const markup = registry.get(name);
    if (!markup) return null;
    const tpl = document.createElement("template");
    tpl.innerHTML = markup;
    el = tpl.content.firstElementChild ?? undefined;
    if (!el) return null;
    cache.set(name, el);
  }
  return el.cloneNode(true) as Element;
}

/** Dos letras para un ítem sin ícono: «Seguridad Física» → «SF», «Ventas» → «Ve». */
export function initials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2).replace(/^./, (c) => c.toUpperCase());
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** `<span class="nx-icon">` con el SVG registrado, o con las iniciales de `label`. */
export function icon(name: string | undefined, label = ""): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "nx-icon";
  span.setAttribute("aria-hidden", "true");
  const svg = name ? svgFor(name) : null;
  if (svg) span.append(svg);
  else {
    span.classList.add("nx-icon--initials");
    span.textContent = initials(label);
  }
  return span;
}

/** Glifos internos de los componentes (no dependen del registro de la app). */
const GLYPHS: Record<string, string> = {
  chevron: '<path d="m9 18 6-6-6-6"/>',
  search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  panel: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
};

const glyphs = new Map<string, DocumentFragment>();

/** Un glifo interno por nombre, o el contenido SVG directo (`<path …/>`) para que cada componente
 *  traiga los suyos sin engordar el núcleo. El markup es SIEMPRE una constante del componente:
 *  nunca un dato (para un ícono que nombra el backend está `icon()`, que solo usa el registro). */
export function glyph(name: keyof typeof GLYPHS | string, cls = ""): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = `nx-glyph ${cls}`.trim();
  span.setAttribute("aria-hidden", "true");
  if (typeof name !== "string") return span;
  let frag = glyphs.get(name);
  if (!frag) {
    const inner = name.startsWith("<") ? name : Object.hasOwn(GLYPHS, name) ? GLYPHS[name] : "";
    const tpl = document.createElement("template");
    tpl.innerHTML = `${SVG_OPEN}${inner}</svg>`;
    frag = tpl.content;
    if (glyphs.size < 500) glyphs.set(name, frag);
  }
  span.append(frag.cloneNode(true));
  return span;
}
