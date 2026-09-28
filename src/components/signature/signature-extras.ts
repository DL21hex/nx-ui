/**
 * Lo que `<nx-signature>` usa de vez en cuando y carga aparte (`import()`), para que la entrada no lo
 * pague: el PNG, la ubicación y el `<nx-handoff>` de «Firmar en el celular» (que a su vez se carga
 * aparte).
 */
import type { SignatureGeo } from "./types";

/** El PNG de un SVG a `width`×`height` px (fondo transparente). `null` si el navegador no puede. */
export async function svgToPng(svg: string, width: number, height: number): Promise<Blob | null> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  try {
    await img.decode();
    c.getContext("2d")!.drawImage(img, 0, 0, width, height);
    return await new Promise((r) => c.toBlob(r, "image/png"));
  } catch {
    return null;
  }
}

/** La ubicación, una vez, con tope de `ms`. Negada, sin GPS o vencida: `undefined` (y se sigue sin ella). */
export function locate(ms: number): Promise<SignatureGeo | undefined> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
    try {
      navigator.geolocation.getCurrentPosition(
        ({ coords: c }) => resolve({ lat: c.latitude, lng: c.longitude, accuracy: Math.round(c.accuracy) }),
        () => resolve(undefined),
        { timeout: ms, maximumAge: 60_000 },
      );
    } catch {
      resolve(undefined);
    }
  });
}

type Handoff = HTMLElement & { start(): void; context: unknown };

/**
 * Un `<nx-handoff kind="signature">` propio dentro de `box` (o el que ya estaba): lo que llega del
 * celular (`{kind: "data", data: {svg, meta}}`) se entrega a `load` y no a ningún `for`.
 */
export async function signatureHandoff(box: Element, endpoint: string, locale: string, context: unknown, load: (v: unknown) => unknown): Promise<void> {
  await import("../handoff/index");
  let ho = box.querySelector<Handoff>("nx-handoff");
  if (!ho) {
    ho = document.createElement("nx-handoff") as unknown as Handoff;
    ho.setAttribute("kind", "signature");
    ho.addEventListener("nx-handoff-item", (e) => {
      const item = (e as CustomEvent<{ item: { kind: string; data?: unknown } }>).detail.item;
      if (item.kind === "data") {
        e.preventDefault();
        load(item.data);
      }
    });
    box.append(ho);
  }
  ho.setAttribute("endpoint", endpoint);
  ho.setAttribute("locale", locale);
  ho.context = context;
  ho.start();
}
