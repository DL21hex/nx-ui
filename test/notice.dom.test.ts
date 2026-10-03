// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/components/notice/index";
import "../src/components/badge/index";
import type { NxNotice } from "../src/components/notice/index";
import type { NxBadge } from "../src/components/badge/index";

afterEach(() => {
  document.body.innerHTML = "";
});

const mount = (html: string) => {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
};

describe("<nx-notice>", () => {
  it("deja el texto del autor tal cual y agrega el ícono y la acción", () => {
    document.body.innerHTML = '<nx-notice tone="warning" action="Renovar"><p id="t">El contrato vence en 11 días.</p></nx-notice>';
    const n = document.querySelector("nx-notice")!;
    const p = n.querySelector("#t")!;
    n.tone = "danger";
    n.action = "Renovar contrato";
    expect(n.querySelector("#t")).toBe(p);
    expect(p.textContent).toBe("El contrato vence en 11 días.");
    expect(n.querySelectorAll(".nx-notice__icon")).toHaveLength(1);
    expect(n.querySelector("button.nx-notice__act")!.textContent).toBe("Renovar contrato");
  });

  it("es una región status", () => {
    const n = mount("<nx-notice>Aviso</nx-notice>");
    expect(n.getAttribute("role")).toBe("status");
  });

  it("la acción avisa con nx-notice-action", () => {
    const n = mount('<nx-notice action="Renovar">Vence pronto</nx-notice>');
    const spy = vi.fn();
    n.addEventListener("nx-notice-action", (e) => spy((e as CustomEvent).detail));
    n.querySelector<HTMLButtonElement>(".nx-notice__act")!.click();
    expect(spy).toHaveBeenCalledWith({ action: "Renovar" });
  });

  it("con action-href es un enlace, y un esquema peligroso no se pinta", () => {
    const n = mount('<nx-notice action="Ver" action-href="/contratos/12">Hay un borrador</nx-notice>') as NxNotice;
    expect(n.querySelector("a.nx-notice__act")!.getAttribute("href")).toBe("/contratos/12");
    n.actionHref = "javascript:alert(1)";
    expect(n.querySelector("a")).toBeNull();
    expect(n.querySelector("button.nx-notice__act")).not.toBeNull();
  });

  it("sin action no hay botón; text (BDUI) pinta el texto", () => {
    const n = mount("<nx-notice></nx-notice>") as NxNotice;
    n.text = "Está de vacaciones hasta el 6 de octubre.";
    expect(n.querySelector(".nx-notice__text")!.textContent).toBe("Está de vacaciones hasta el 6 de octubre.");
    expect(n.querySelector(".nx-notice__act")).toBeNull();
    n.action = "Ver";
    expect(n.querySelector(".nx-notice__act")).not.toBeNull();
    n.action = null;
    expect(n.querySelector(".nx-notice__act")).toBeNull();
  });

  it("danger se anuncia (alert) y un role del autor se respeta", () => {
    const n = mount('<nx-notice tone="danger">No se pudo guardar</nx-notice>') as NxNotice;
    expect(n.getAttribute("role")).toBe("alert");
    n.tone = "info";
    expect(n.getAttribute("role")).toBe("status");
    const own = mount('<nx-notice role="note">Dato</nx-notice>');
    expect(own.getAttribute("role")).toBe("note");
  });

  it("cambiar el tono cambia el ícono sin duplicarlo", () => {
    const n = mount("<nx-notice>Hola</nx-notice>") as NxNotice;
    n.tone = "success";
    n.tone = "warning";
    expect(n.querySelectorAll(".nx-notice__icon")).toHaveLength(1);
  });

  it("un atributo que no cambia el texto no reemplaza los nodos de texto (la región no se vuelve a anunciar)", () => {
    const n = mount('<nx-notice text="Vence pronto" action="Renovar"></nx-notice>') as NxNotice;
    const text = n.querySelector(".nx-notice__text")!.firstChild;
    const act = n.querySelector(".nx-notice__act")!.firstChild;
    n.setAttribute("action-href", "/renovar");
    n.tone = "warning";
    expect(n.querySelector(".nx-notice__text")!.firstChild).toBe(text);
    // La acción pasó a enlace (otro nodo); el siguiente cambio ya no la toca.
    const link = n.querySelector(".nx-notice__act")!.firstChild;
    expect(link).not.toBe(act);
    n.setAttribute("action-href", "/renovar/2");
    expect(n.querySelector(".nx-notice__act")!.firstChild).toBe(link);
  });
});

describe("<nx-badge>", () => {
  it("usa el contenido del autor, o label", () => {
    const b = mount('<nx-badge tone="success">Activa</nx-badge>') as NxBadge;
    expect(b.textContent).toBe("Activa");
    const c = mount("<nx-badge></nx-badge>") as NxBadge;
    c.label = "Retirado";
    c.tone = "neutral";
    expect(c.querySelector(".nx-badge__text")!.textContent).toBe("Retirado");
    expect(c.getAttribute("tone")).toBe("neutral");
    c.label = null;
    expect(c.querySelector(".nx-badge__text")).toBeNull();
  });
});
