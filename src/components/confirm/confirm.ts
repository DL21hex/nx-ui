/**
 * `nxConfirm()`: la confirmación que muestra qué va a pasar antes de pedir el sí. El backend
 * describe las consecuencias (una lista, o transmitidas en streaming como la IA) y puede bloquear
 * la acción con un motivo. Lo destructivo se confirma manteniendo pulsado el botón, no con un clic
 * distraído.
 *
 *   if (await nxConfirm({ heading: "Anular OC-2291", impact: "/compras/oc/2291/impacto" })) anular();
 *
 * Es un `<nx-dialog>` que se crea al llamar y se quita al cerrar: nace del botón que lo pidió.
 */
import { h, safeEndpoint } from "../../core/dom";
import { hasIcon, icon } from "../../core/icons";
import { parseImpactEvent } from "../../core/impact";
import { mergeLabels } from "../../core/labels";
import { lineData, readLines } from "../../core/stream";
import type { NxButton } from "../button/button";
import "../button/index";
import type { NxDialog } from "../dialog/dialog";
import "../dialog/index";
import type { ConfirmLabels, ConfirmOptions, ImpactItem } from "../dialog/types";

export { parseImpactEvent };

export const CONFIRM_LABELS: ConfirmLabels = {
  confirm: "Confirmar",
  cancel: "Cancelar",
  impact: "Esto afecta a:",
  loading: "Calculando el impacto…",
  error: "No se pudo calcular el impacto",
};

export function nxConfirm(opts: ConfirmOptions): Promise<boolean> {
  const L = mergeLabels(CONFIRM_LABELS, opts.labels);
  const danger = (opts.tone ?? "danger") === "danger";
  const dlg = h("nx-dialog", { size: "sm", class: "nx-confirm", heading: opts.heading, "data-tone": danger ? "danger" : "primary" }) as NxDialog;
  const list = h("ul", { class: "nx-confirm__list" });
  const status = h("p", { class: "nx-confirm__status" });
  const block = h("p", { class: "nx-confirm__block", role: "alert", hidden: true });
  const notes = h("div", { class: "nx-confirm__notes" });
  const impact = opts.impact ? h("section", { class: "nx-confirm__impact" }, h("p", { class: "nx-confirm__impact-title" }, L.impact), list, status, block, notes) : null;
  const cancel = h("nx-button", { variant: "secondary", label: opts.cancelLabel ?? L.cancel, "log-mode": "none", "data-nx-close": "cancel", autofocus: danger }) as NxButton;
  const ok = h("nx-button", { variant: danger ? "danger" : "primary", label: opts.confirmLabel ?? L.confirm, "log-mode": "none", autofocus: !danger }) as NxButton;
  const hold = opts.hold ?? (danger ? 1000 : 0);
  if (hold) ok.setAttribute("hold", String(hold));
  dlg.append(...(opts.message ? [h("p", { class: "nx-confirm__msg" }, opts.message)] : []), ...(impact ? [impact] : []), h("div", { slot: "footer" }, cancel, ok));

  const item = (it: ImpactItem) =>
    h(
      "li",
      { class: "nx-confirm__item", "data-tone": it.tone ?? "neutral" },
      it.icon && hasIcon(it.icon) ? icon(it.icon) : h("span", { class: "nx-confirm__dot", "aria-hidden": "true" }),
      h("span", { class: "nx-confirm__label" }, it.label),
      it.detail ? h("span", { class: "nx-confirm__detail" }, it.detail) : null,
    );

  // Solo el clic del <button> de adentro confirma: ese ya respeta `disabled` y la pulsación larga
  // (un `ok.click()` sobre el envoltorio, o un clic en su borde, no se los salta).
  ok.addEventListener("click", (e) => {
    if ((e.target as Element).closest?.(".nx-button__btn")) dlg.close("confirm", "api");
  });
  document.body.append(dlg);
  const result = dlg.show(opts.origin).then((v) => {
    // Se quita cuando termina de salir.
    setTimeout(() => dlg.remove(), 400);
    return v === "confirm";
  });

  if (Array.isArray(opts.impact)) list.append(...opts.impact.map(item));
  else if (typeof opts.impact === "string") {
    // Solo del mismo origen (o de uno permitido con `allowOrigins`): `body` no sale hacia un tercero.
    const url = safeEndpoint(opts.impact);
    ok.disabled = true;
    list.setAttribute("aria-busy", "true");
    status.textContent = L.loading;
    status.classList.add("is-loading");
    const ctrl = new AbortController();
    dlg.addEventListener("nx-open-change", () => ctrl.abort(), { once: true });
    let blocked = false;
    // Falla cerrado: si no se pudo saber qué pasa (error de red o del servidor, un evento `error`,
    // un stream cortado antes de `done`), no se puede confirmar. `failOpen: true` lo permite igual.
    const end = (error?: string) => {
      list.removeAttribute("aria-busy");
      status.classList.remove("is-loading");
      status.textContent = error ?? "";
      status.hidden = !error;
      ok.disabled = blocked || (!!error && !opts.failOpen);
    };
    void (async () => {
      try {
        if (!url) throw new Error("url");
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/x-ndjson, text/event-stream" },
          credentials: "same-origin",
          body: JSON.stringify(opts.body ?? {}),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let error: string | undefined;
        let complete = false;
        await readLines(res, (line) => {
          const ev = parseImpactEvent(lineData(line));
          if (!ev) return;
          // `done` cierra la lista aunque el servidor deje la conexión abierta.
          if (ev.type === "done") {
            complete = true;
            return false;
          }
          if (ev.type === "impact") list.append(item(ev));
          else if (ev.type === "block") {
            blocked = true;
            block.hidden = false;
            block.textContent = ev.message;
          } else if (ev.type === "note") notes.append(h("p", null, ev.message));
          else if (ev.type === "error") error = ev.message;
        });
        end(error ?? (complete ? undefined : L.error));
      } catch {
        if (!ctrl.signal.aborted) end(L.error);
      }
    })();
  }
  return result;
}
