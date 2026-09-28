/**
 * `<nx-checklist>`: los campos de evidencia de un paso abierto (fotos, archivos, firma, nota, número
 * con rango, opciones). Van aparte (`import()`) para que la entrada no los pague, pero el elemento los
 * pide en reposo apenas se conecta: en una bodega sin señal el paso se abre igual.
 *
 * Las fotos y archivos quedan como metadatos (`{name, type, size}`) en la evidencia; el archivo de
 * verdad va en `blobs`, que es lo que el elemento sube antes del cambio. La firma es `<nx-signature>`
 * (cargado con `import()`); «Tomar con el celular» es un `<nx-handoff kind="photo">` que entrega en el
 * `<input type=file>` del campo.
 */
import { h, safeImageSrc } from "../../core/dom";
import { checklistInRange, checklistNumber, checklistOptions, checklistParseNumber } from "./logic";
import type { ChecklistEvidence, ChecklistEvidenceSpec, ChecklistFile, ChecklistLabels } from "./types";

/** Lo que un campo necesita del elemento. */
export interface ChecklistFieldHost {
  labels: ChecklistLabels;
  locale: string;
  /** Prefijo de los `id` (únicos por elemento). */
  uid: string;
  /** La base de `<nx-handoff>`: muestra «Tomar con el celular» en las fotos. */
  handoff?: string | null;
  /** Adjunto → archivo (lo que se sube), archivos ya tomados y las miniaturas locales (se revocan al cerrar). */
  blobs: WeakMap<ChecklistFile, File>;
  taken: WeakSet<File>;
  urls: string[];
  /** Algo cambió: se recalcula qué falta. */
  changed(): void;
}

const fill = (t: string, o: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (m, k) => (k in o ? String(o[k]) : m));

/** Un campo para llenar la evidencia `i` (`ev` es el borrador: el campo lo va cambiando). */
export function checklistField(host: ChecklistFieldHost, spec: ChecklistEvidenceSpec, i: number, ev: ChecklistEvidence): HTMLElement {
  const L = host.labels;
  const loc = host.locale;
  const id = `${host.uid}e${i}`;
  const type = spec.type;
  const label = spec.label ?? L[type];
  const grouped = type === "photo" || type === "file" || type === "signature";
  const lab = h(grouped ? "span" : "label", { class: "nx-cl__lab", id: `${id}l`, for: grouped ? null : id }, label, spec.required === false ? h("small", null, ` · ${L.optional}`) : "");
  const box = h("div", { class: "nx-cl__ev", "data-type": type, role: grouped ? "group" : null, "aria-labelledby": grouped ? `${id}l` : null }, lab);
  const changed = host.changed;
  if (type === "photo" || type === "file") {
    const photo = type === "photo";
    const input = h("input", { type: "file", id, class: "nx-cl__file", multiple: true, accept: photo ? "image/*" : (spec.accept ?? null), capture: photo ? "environment" : null, tabindex: -1, "aria-hidden": "true" });
    const list = h("ul", { class: "nx-cl__files" });
    const pick = h("button", { type: "button", class: "nx-cl__btn" }, photo ? L.takePhoto : L.attach);
    const paint = () =>
      list.replaceChildren(
        ...(ev.files ?? []).map((f, k) => {
          const blob = host.blobs.get(f);
          let src = f.url ? safeImageSrc(f.url) : undefined;
          if (!src && blob && photo) host.urls.push((src = URL.createObjectURL(blob)));
          const rm = h("button", { type: "button", class: "nx-cl__rm", "aria-label": fill(L.remove, { name: f.name }) }, "×");
          rm.addEventListener("click", () => {
            ev.files!.splice(k, 1);
            paint();
            changed();
            (list.querySelector("button") ?? pick).focus();
          });
          return h("li", null, photo && src ? h("img", { src, alt: f.name }) : h("span", { class: "nx-cl__fname" }, f.name), rm);
        }),
      );
    input.addEventListener("change", () => {
      // `<nx-handoff>` agrega al `FileList` lo que llega: solo se toma lo nuevo.
      for (const file of input.files ?? []) {
        if (host.taken.has(file)) continue;
        host.taken.add(file);
        const meta: ChecklistFile = { name: file.name, size: file.size };
        if (file.type) meta.type = file.type;
        host.blobs.set(meta, file);
        (ev.files ??= []).push(meta);
      }
      try {
        input.value = "";
      } catch {
        /* FileList de mentira */
      }
      paint();
      changed();
    });
    pick.addEventListener("click", () => input.click());
    const acts = h("div", { class: "nx-cl__acts" }, pick);
    const ho = host.handoff;
    if (photo && ho) {
      const phone = h("button", { type: "button", class: "nx-cl__btn" }, L.phone);
      phone.addEventListener("click", () => {
        phone.disabled = true;
        void import("../handoff/index").then(() => {
          const el = document.createElement("nx-handoff") as HTMLElement & { start(): void };
          for (const [k, v] of [["kind", "photo"], ["endpoint", ho], ["for", id], ["accept", "image/*"], ["multiple", ""], ["locale", loc]]) el.setAttribute(k, v);
          box.append(el);
          el.start();
        });
      });
      acts.append(phone);
    }
    box.append(list, acts, input);
    paint();
  } else if (type === "signature") {
    void import("../signature/index").then(() => {
      const sig = document.createElement("nx-signature") as HTMLElement & { value: unknown };
      sig.setAttribute("ask-name", "");
      sig.setAttribute("locale", loc);
      if (ev.signature) sig.value = ev.signature;
      sig.addEventListener("nx-signature-done", (e) => {
        const v = (e as CustomEvent<{ svg: string; meta?: unknown }>).detail;
        ev.signature = { svg: v.svg, meta: v.meta };
        changed();
      });
      sig.addEventListener("nx-signature-change", (e) => {
        if ((e as CustomEvent<{ empty: boolean }>).detail.empty) delete ev.signature;
        changed();
      });
      box.append(sig);
    });
  } else if (type === "choice") {
    const fs = h("fieldset", { class: "nx-cl__choice" }, h("legend", { class: "nx-cl__lab" }, label));
    lab.remove();
    for (const o of checklistOptions(spec)) {
      const r = h("input", { type: "radio", name: id, value: o.value });
      r.checked = ev.value === o.value;
      r.addEventListener("change", () => ((ev.value = o.value), changed()));
      fs.append(h("label", null, r, o.label));
    }
    box.append(fs);
  } else if (type === "number") {
    const { min, max } = spec;
    const hint = min !== undefined && max !== undefined ? L.range : min !== undefined ? L.min : max !== undefined ? L.max : "";
    const unit = spec.unit ? ` ${spec.unit}` : "";
    const input = h("input", { id, class: "nx-cl__in nx-cl__num", inputmode: "decimal", autocomplete: "off", "aria-describedby": hint ? `${id}h` : null });
    const out = () => box.toggleAttribute("data-out", checklistInRange(ev.value, spec) === false);
    if (typeof ev.value === "number") input.value = checklistNumber(ev.value, loc);
    input.addEventListener("input", () => {
      ev.value = checklistParseNumber(input.value, loc);
      out();
      changed();
    });
    out();
    box.append(
      h("span", { class: "nx-cl__numrow" }, input, unit ? h("span", { class: "nx-cl__unit" }, spec.unit) : ""),
      hint ? h("small", { id: `${id}h`, class: "nx-cl__range" }, fill(hint, { min: checklistNumber(min ?? 0, loc), max: checklistNumber(max ?? 0, loc) }) + unit) : "",
    );
  } else {
    const t = h("textarea", { id, class: "nx-cl__in", rows: 2 });
    t.value = typeof ev.value === "string" ? ev.value : "";
    t.addEventListener("input", () => ((ev.value = t.value), changed()));
    box.append(t);
  }
  return box;
}
