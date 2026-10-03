/**
 * `<nx-handoff side="phone">`: la página que abre el QR. Va en un chunk aparte (el escritorio no
 * la carga) y `<nx-scan>` o `<nx-signature>`, en otro más (solo si lo pedido es escanear o firmar).
 *
 * Una columna, botones grandes y cero adornos: «Tomar foto» (cámara trasera), «Elegir de la
 * galería», las miniaturas con «Quitar» y «Enviar al computador». Las fotos se reducen antes de
 * subir (lado mayor 2000 px, JPEG 0,85) y se suben una por una, con avance y reintento.
 */
import { h, safeEndpoint } from "../../core/dom";
import { glyph } from "../../core/icons";
import { mergeLabels } from "../../core/labels";
import type { PhoneHost } from "./handoff";
import { countText, fill, fitSize, jpegName, parseHandoffItem, parsePhoneInfo, phoneParams, retryDelay, sessionUrl, uploadVerdict } from "./logic";
import type { HandoffItem, HandoffLabels, HandoffPhoneInfo, HandoffPhoneLabels } from "./types";

export const HANDOFF_PHONE_LABELS: HandoffPhoneLabels = {
  loading: "Conectando…",
  title: "Enviar al computador",
  takePhoto: "Tomar foto",
  gallery: "Elegir de la galería",
  chooseFile: "Elegir archivo",
  remove: "Quitar {name}",
  send: "Enviar al computador",
  sending: "Enviando {i} de {n}…",
  queued: "Por enviar",
  uploaded: "Enviado",
  failed: "No se envió",
  uploadFailed: "No se pudo enviar {name}",
  sent: "Listo. Ya puedes volver al computador.",
  more: "Enviar más",
  finish: "Terminar",
  codesSent: "Enviados: {n}",
  invalid: "Este enlace venció o ya se usó. Genera otro desde el computador.",
  offline: "Sin conexión con el computador",
  fullscreen: "Firmar en pantalla completa",
  signSending: "Enviando la firma…",
};

type Shot = { file: File; src: string; status: "queued" | "sending" | "uploaded" | "failed" };
type Posted = { v: "ok" | "gone" | "fail"; item?: HandoffItem | null };

const CAMERA = '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>';
const IMAGE = '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>';
const FILE = '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>';
const X = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';
const CHECK = '<path d="M20 6 9 17l-5-5"/>';

/** Lado mayor y calidad de una foto reducida. */
export const PHOTO_MAX = 2000;
export const PHOTO_QUALITY = 0.85;

/**
 * Reduce una foto a `max` px de lado mayor (JPEG): una de 12 MP del teléfono pasa de ~4 MB a
 * ~600 KB. Sin `createImageBitmap` o canvas, o si no se puede leer (HEIC en Android), va tal cual.
 */
export async function shrinkImage(file: File, max = PHOTO_MAX, quality = PHOTO_QUALITY): Promise<File> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) || typeof createImageBitmap !== "function") return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const fit = fitSize(bmp.width, bmp.height, max);
    if (!fit.scaled) {
      bmp.close();
      return file;
    }
    const off = typeof OffscreenCanvas === "function";
    const canvas = off ? new OffscreenCanvas(fit.width, fit.height) : Object.assign(document.createElement("canvas"), { width: fit.width, height: fit.height });
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) return file;
    // Un PNG con transparencia no queda negro en JPEG.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, fit.width, fit.height);
    ctx.drawImage(bmp, 0, 0, fit.width, fit.height);
    bmp.close();
    const blob = off
      ? await (canvas as OffscreenCanvas).convertToBlob({ type: "image/jpeg", quality })
      : await new Promise<Blob | null>((r) => (canvas as HTMLCanvasElement).toBlob(r, "image/jpeg", quality));
    return blob && blob.size < file.size ? new File([blob], jpegName(file.name), { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

export function mountPhone(host: PhoneHost): { destroy(): void } {
  const L = (): HandoffLabels & HandoffPhoneLabels => ({ ...host.labels, ...mergeLabels(HANDOFF_PHONE_LABELS, host.raw) });
  const ctrl = new AbortController();
  const { signal } = ctrl;
  const params = typeof location === "undefined" ? {} : phoneParams(location.search);
  const id = host.session || params.session;
  const token = host.token || params.token;
  const base = safeEndpoint(host.endpoint);
  const root = h("div", { class: "nx-ho__phone" });
  host.el.replaceChildren(root);
  let info: HandoffPhoneInfo | null = null;
  let shots: Shot[] = [];
  let sent: HandoffItem[] = [];

  const url = (path: string) => sessionUrl(base!, id!, path, { t: token });
  const screen = (...nodes: (Node | null)[]) => root.replaceChildren(...nodes.filter((n): n is Node => !!n));
  const btn = (text: string, cls: string, onClick: () => void, icon?: string) => {
    const b = h("button", { type: "button", class: `nx-ho__btn ${cls}`.trim() }, icon ? glyph(icon, "nx-ho__icon") : null, text);
    b.addEventListener("click", onClick);
    return b;
  };
  const heading = () => [h("h2", { class: "nx-ho__title" }, info?.title ?? L().title), info?.hint ? h("p", { class: "nx-ho__hint" }, info.hint) : null];

  const gone = () => {
    screen(h("p", { class: "nx-ho__end", role: "alert" }, L().invalid));
    host.emit("nx-handoff-error", { message: "expired" });
  };
  const offline = (again: () => void) => screen(...heading(), h("p", { class: "nx-ho__msg", role: "alert" }, L().offline), btn(L().retry, "nx-ho__btn--big", again));

  /** Un POST con reintento (3 intentos con espera creciente) para lo que se puede repetir. */
  async function post(path: string, body: () => BodyInit | null, json = false): Promise<Posted> {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(url(path), { method: "POST", body: body(), credentials: "same-origin", signal, headers: json ? { "Content-Type": "application/json" } : undefined });
        const v = uploadVerdict(res.status);
        if (v === "ok") {
          const data = await res.json().catch(() => null);
          return { v, item: parseHandoffItem(data?.item) };
        }
        if (v === "gone" || v === "fail") return { v };
      } catch {
        if (signal.aborted) return { v: "fail" };
      }
      if (attempt >= 3) return { v: "fail" };
      await sleep(retryDelay(attempt, 600, 5000), signal);
    }
  }

  async function load(): Promise<void> {
    screen(h("p", { class: "nx-ho__msg", role: "status" }, L().loading));
    if (!base || !id || !token) return gone();
    try {
      const res = await fetch(url(""), { credentials: "same-origin", signal, headers: { Accept: "application/json" } });
      const v = uploadVerdict(res.status);
      if (v === "gone") return gone();
      if (v !== "ok") throw new Error(`HTTP ${res.status}`);
      info = parsePhoneInfo(await res.json());
      if (!info) throw new Error("respuesta inválida");
      if (info.kind === "scan") await scan();
      else if (info.kind === "signature") await sign();
      else pick();
    } catch {
      if (!signal.aborted) offline(() => void load());
    }
  }

  // ---------------------------------------------------------------- fotos y archivos

  function pick(): void {
    const i = info!;
    const photo = i.kind === "photo";
    const accept = i.accept ?? (photo ? "image/*" : undefined);
    // Los selectores quedan fuera de la vista (no `hidden`: Safari viejo de iOS no abre la cámara con
    // `click()` sobre un input con `display: none`); los botones grandes los abren.
    const input = (capture: boolean) => {
      const el = h("input", { type: "file", class: "nx-ho__file", accept, capture: capture ? "environment" : null, multiple: !!i.multiple && !capture, tabindex: "-1", "aria-hidden": "true" });
      el.addEventListener("change", () => {
        add([...(el.files ?? [])]);
        el.value = "";
      });
      return el;
    };
    const cam = input(photo);
    const gal = photo ? input(false) : null;
    const list = h("ul", { class: "nx-ho__shots" });
    const msg = h("p", { class: "nx-ho__msg", role: "status" });
    const send = btn(L().send, "nx-ho__btn--primary nx-ho__btn--big", () => void upload());
    let busy = false;

    const add = (files: File[]) => {
      if (!files.length) return;
      if (!i.multiple) {
        clear();
        files = files.slice(0, 1);
      }
      for (const file of files) shots.push({ file, src: file.type.startsWith("image/") ? URL.createObjectURL(file) : "", status: "queued" });
      msg.textContent = "";
      paint();
    };
    const paint = () => {
      list.replaceChildren(
        ...shots.map((s) => {
          const st = s.status === "uploaded" ? L().uploaded : s.status === "failed" ? L().failed : s.status === "queued" ? L().queued : "";
          const x = btn("", "nx-ho__x", () => {
            URL.revokeObjectURL(s.src);
            shots = shots.filter((o) => o !== s);
            paint();
          });
          x.append(glyph(X));
          x.setAttribute("aria-label", fill(L().remove, { name: s.file.name }));
          x.hidden = busy || s.status === "uploaded";
          return h(
            "li",
            { class: "nx-ho__shot", "data-status": s.status },
            s.src ? h("img", { src: s.src, alt: "", decoding: "async" }) : glyph(FILE, "nx-ho__thumb"),
            h("span", { class: "nx-ho__shot-name" }, s.file.name, h("small", null, st)),
            x,
          );
        }),
      );
      send.disabled = busy || !shots.some((s) => s.status !== "uploaded");
    };

    async function upload(): Promise<void> {
      if (busy) return;
      busy = true;
      paint();
      const n = shots.length;
      for (const s of shots) {
        if (s.status === "uploaded") continue;
        s.status = "sending";
        msg.textContent = fill(L().sending, { i: shots.indexOf(s) + 1, n });
        paint();
        const file = s.file.type.startsWith("image/") ? await shrinkImage(s.file) : s.file;
        if (signal.aborted) return;
        const r = await post("/items", () => {
          const fd = new FormData();
          fd.append("file", file, file.name);
          return fd;
        });
        if (r.v === "gone") return gone();
        if (r.v !== "ok") {
          s.status = "failed";
          busy = false;
          const message = fill(L().uploadFailed, { name: s.file.name });
          msg.textContent = message;
          paint();
          host.emit("nx-handoff-error", { message });
          return;
        }
        s.status = "uploaded";
        sent.push(r.item ?? { kind: "file", name: file.name, type: file.type, size: file.size, url: "" });
        paint();
      }
      const d = await post("/done", () => null);
      busy = false;
      if (d.v === "gone") return gone();
      if (d.v !== "ok") {
        msg.textContent = L().offline;
        return paint();
      }
      finished();
    }

    screen(
      ...heading(),
      h("div", { class: "nx-ho__pick" }, btn(photo ? L().takePhoto : L().chooseFile, "nx-ho__btn--big", () => cam.click(), photo ? CAMERA : FILE), gal ? btn(L().gallery, "nx-ho__btn--big nx-ho__btn--quiet", () => gal.click(), IMAGE) : null, cam, gal),
      list,
      send,
      msg,
    );
    paint();
  }

  function clear(): void {
    for (const s of shots) if (s.src) URL.revokeObjectURL(s.src);
    shots = [];
  }

  function finished(): void {
    host.emit("nx-handoff-done", { items: sent });
    sent = [];
    screen(
      h("p", { class: "nx-ho__end", role: "status" }, glyph(CHECK, "nx-ho__ok"), L().sent),
      btn(L().more, "nx-ho__btn--big nx-ho__btn--quiet", () => {
        clear();
        if (info!.kind === "scan") void scan();
        else if (info!.kind === "signature") void sign();
        else pick();
      }),
    );
  }

  // ---------------------------------------------------------------- escanear

  async function scan(): Promise<void> {
    await import("../scan/index");
    if (signal.aborted) return;
    const reader = document.createElement("nx-scan");
    reader.setAttribute("mode", "count");
    const locale = host.el.getAttribute("locale");
    if (locale) reader.setAttribute("locale", locale);
    const count = h("p", { class: "nx-ho__msg", role: "status" });
    let n = 0;
    let chain = Promise.resolve(true);
    reader.addEventListener("nx-scan-read", (e) => {
      const { code, format } = e.detail;
      chain = chain.then(async (alive) => {
        if (!alive) return false;
        const r = await post("/items", () => JSON.stringify(format ? { kind: "code", code, format } : { kind: "code", code }), true);
        if (r.v === "gone") return gone(), false;
        if (r.v === "ok") {
          n++;
          sent.push(r.item ?? { kind: "code", code, ...(format ? { format } : {}) });
          count.textContent = fill(L().codesSent, { n: countText("scan", n, L()) });
        } else host.emit("nx-handoff-error", { message: fill(L().uploadFailed, { name: code }) });
        return true;
      });
    });
    const finish = btn(L().finish, "nx-ho__btn--primary nx-ho__btn--big", () => {
      finish.disabled = true;
      void chain.then(async (alive) => {
        if (!alive) return;
        const d = await post("/done", () => null);
        finish.disabled = false;
        if (d.v === "gone") return gone();
        if (d.v !== "ok") count.textContent = L().offline;
        else finished();
      });
    });
    screen(...heading(), reader, count, finish);
  }

  // ---------------------------------------------------------------- firmar

  /**
   * `<nx-signature>` (chunk aparte) a lo ancho de la pantalla; si el teléfono deja, a pantalla
   * completa y en horizontal. Al confirmar, manda `{kind: "data", data: {svg, meta}}` y cierra la tanda.
   */
  async function sign(): Promise<void> {
    await import("../signature/index");
    if (signal.aborted) return;
    const pad = document.createElement("nx-signature");
    for (const [a, on] of [["required", 1], ["ask-name", info!.askName], ["ask-id", info!.askId]] as const) pad.toggleAttribute(a, !!on);
    const locale = host.el.getAttribute("locale");
    if (locale) pad.setAttribute("locale", locale);
    // Alta según la pantalla (a pantalla completa, el CSS la ajusta al alto que quede).
    pad.setAttribute("height", String(Math.max(140, Math.min(420, innerHeight - 230))));
    const msg = h("p", { class: "nx-ho__msg", role: "status" });
    const send = async (data: unknown): Promise<void> => {
      msg.textContent = L().signSending;
      const r = await post("/items", () => JSON.stringify({ kind: "data", data }), true);
      const d = r.v === "ok" ? await post("/done", () => null) : r;
      if (d.v === "gone") return gone();
      // Sin red: «Reintentar» manda la misma firma (no hay que volver a firmar).
      if (d.v !== "ok") return offline(() => void send(data));
      sent.push(r.item ?? { kind: "data", data });
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      finished();
    };
    pad.addEventListener("nx-signature-done", (e) => void send(e.detail));
    const full = btn(L().fullscreen, "nx-ho__btn--quiet", () => {
      // `screen` aquí es la función que cambia de pantalla: la orientación es la de `globalThis.screen`.
      Promise.resolve(root.requestFullscreen?.())
        .then(() => (globalThis.screen?.orientation as { lock?(o: string): Promise<void> } | undefined)?.lock?.("landscape"))
        .catch(() => {});
    });
    // Solo en un teléfono o tableta que lo permita: en un computador, pantalla completa estorba.
    full.hidden = !document.fullscreenEnabled || !matchMedia("(pointer: coarse)").matches;
    screen(...heading(), pad, full, msg);
  }

  void load();
  return {
    destroy() {
      ctrl.abort();
      clear();
    },
  };
}
