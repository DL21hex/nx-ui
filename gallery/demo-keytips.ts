/**
 * Demo de `<nx-keytips>`: la pantalla de un pedido de un ERP (barra de acciones, campos, pestañas y
 * un diálogo de anulación). Cada acción deja su rastro en el registro, junto con `nx-keytip` y
 * `nx-open-change`; «Ver la hoja de atajos» pinta `assignments`.
 */
import "../src/components/keytips/index";
import type { KeytipDetail, NxKeytips } from "../src/components/keytips/index";
import type { NxDialog } from "../src/components/dialog/dialog";

export function mountKeytipsDemo(root: HTMLElement): void {
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const kt = $<NxKeytips>("#kt");
  const log = $<HTMLOListElement>("#kt-log");
  const state = $("#kt-state");
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 6) log.lastElementChild!.remove();
  };

  kt.addEventListener("nx-keytip", (e) => {
    const d = (e as CustomEvent<KeytipDetail>).detail;
    add(`nx-keytip → ${d.key} «${d.name}»`);
  });
  kt.addEventListener("nx-open-change", (e) => add(`nx-open-change → ${(e as CustomEvent<{ open: boolean }>).detail.open ? "abiertos" : "cerrados"}`));

  // ---------------------------------------------------------------- acciones del pedido
  const act = (sel: string, text: string, next?: string) =>
    $(sel).addEventListener("click", () => {
      add(text);
      if (next) state.textContent = next;
    });
  act("#kt-save", "Pedido guardado", "Guardado");
  act("#kt-approve", "Pedido aprobado por Laura Restrepo", "Aprobado");
  act("#kt-print", "Imprimir: PED-1043.pdf (vista previa)");
  act("#kt-send", "Enviado a compras@eltornillo.co");
  act("#kt-excel", "Exportado: PED-1043.xlsx");
  act("#kt-delete", "Eliminar borrador (sin atajo: data-keytip=\"off\")");
  act("#kt-receipt", "Registrar abono…");

  const dlg = $<NxDialog>("#kt-void-dlg");
  $("#kt-void").addEventListener("click", () => void dlg.show());
  $("#kt-void-ok").addEventListener("click", () => {
    const motivo = new FormData($<HTMLFormElement>("#kt-void-form")).get("motivo");
    dlg.close("ok");
    state.textContent = "Anulado";
    add(`Pedido anulado: ${motivo}`);
  });

  // ---------------------------------------------------------------- pestañas (roving tabindex)
  const tabs = [...root.querySelectorAll<HTMLButtonElement>(".kt-tabs [role=tab]")];
  const select = (tab: HTMLButtonElement, focus = false) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      $(`#${t.getAttribute("aria-controls")}`).hidden = !on;
    }
    if (focus) tab.focus();
  };
  for (const tab of tabs) tab.addEventListener("click", () => select(tab));
  $(".kt-tabs").addEventListener("keydown", (e) => {
    const i = tabs.indexOf(e.target as HTMLButtonElement);
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (i < 0 || !step) return;
    e.preventDefault();
    select(tabs[(i + step + tabs.length) % tabs.length], true);
  });

  // ---------------------------------------------------------------- región y hoja de atajos
  $<HTMLInputElement>("#kt-whole").addEventListener("change", (e) => {
    kt.scope = (e.target as HTMLInputElement).checked ? null : "#kt-order";
    paintSheet();
  });
  const sheet = $<HTMLDListElement>("#kt-sheet");
  const paintSheet = () => {
    if (sheet.hidden) return;
    sheet.replaceChildren(
      ...kt.assignments.flatMap((a) => {
        const dt = document.createElement("dt");
        const kbd = document.createElement("kbd");
        kbd.textContent = a.key;
        dt.append(kbd);
        const dd = document.createElement("dd");
        dd.textContent = a.name || `<${a.element.localName}>`;
        return [dt, dd];
      }),
    );
  };
  $("#kt-sheet-btn").addEventListener("click", () => {
    sheet.hidden = !sheet.hidden;
    $("#kt-sheet-btn").textContent = sheet.hidden ? "Ver la hoja de atajos" : "Ocultar la hoja de atajos";
    paintSheet();
  });
}
