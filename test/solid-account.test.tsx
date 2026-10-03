// `<Account>` de Solid: sus manejadores solo atienden los eventos de la propia cuenta, no uno igual
// que burbujea desde dentro, y pasa los atributos de la salida (`logout-*`).
import { describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { Account } from "../src/solid/account";

describe("<Account> de Solid", () => {
  it("onSelect y onLogout ignoran los eventos que suben desde un descendiente", () => {
    const root = document.body.appendChild(document.createElement("div"));
    const onSelect = vi.fn();
    const onLogout = vi.fn();
    const dispose = render(() => <Account user={{ name: "Ana" }} logoutUrl="/salir" logoutMethod="get" logoutCsrf="t0k" onSelect={onSelect} onLogout={onLogout} />, root);
    const el = root.querySelector("nx-account")!;
    expect(el.getAttribute("logout-method")).toBe("get");
    expect(el.getAttribute("logout-csrf")).toBe("t0k");
    const inner = el.querySelector(".nx-account__card")!;
    inner.dispatchEvent(new CustomEvent("nx-account-select", { detail: { id: "de-dentro" }, bubbles: true }));
    inner.dispatchEvent(new CustomEvent("nx-account-logout", { detail: { pending: 0 }, bubbles: true, cancelable: true }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onLogout).not.toHaveBeenCalled();
    el.dispatchEvent(new CustomEvent("nx-account-select", { detail: { id: "propio" }, bubbles: true }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect.mock.calls[0][0].detail.id).toBe("propio");
    dispose();
    root.remove();
  });
});
