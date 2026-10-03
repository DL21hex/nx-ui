/** `<Scan>` para SolidJS: envuelve `<nx-scan>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/scan/index";
import type { NxScan } from "../components/scan/scan";
import type { ScanCountDetail, ScanDetail, ScanItem, ScanLabels, ScanMode, ScanProblem, ScanWedge } from "../components/scan/types";

export type { NxScan, ScanCountDetail, ScanDetail, ScanItem, ScanLabels, ScanMode, ScanProblem, ScanWedge };

export interface ScanProps extends Omit<JSX.HTMLAttributes<NxScan>, "onError"> {
  /** `single` (por defecto): una lectura y la cámara se apaga. `count`: cada lectura suma a la lista. */
  mode?: ScanMode;
  /** `["ean_13", "code_128", "qr_code"]`… Por defecto, los de inventario y QR. */
  formats?: string[];
  /** URL que describe un código: se le agrega el código (o reemplaza `{code}`). Responde `{code, name, unit?, expected?}`. */
  source?: string;
  /** Las líneas del conteo (se pueden precargar con `expected` y `qty: 0`). */
  items?: ScanItem[];
  /** Sin el «bip» al leer. */
  muted?: boolean;
  /** Abre la cámara al montarse. */
  autostart?: boolean;
  /** Dónde se escucha la pistola lectora: `page` (por defecto), `field` u `off`. */
  wedge?: ScanWedge;
  locale?: string;
  labels?: Partial<ScanLabels>;
  /** Cada lectura: `{code, format, via}`. Cancelable (en el conteo, no se suma). */
  onRead?: (e: CustomEvent<ScanDetail>) => void;
  /** La lista después de cada cambio: `{items}`. */
  onCount?: (e: CustomEvent<ScanCountDetail>) => void;
  /** Sin cámara: `{problem}`. */
  onError?: (e: CustomEvent<{ problem: ScanProblem }>) => void;
}

export function Scan(props: ScanProps): JSX.Element {
  const [local, rest] = splitProps(props, ["mode", "formats", "source", "items", "muted", "autostart", "wedge", "locale", "labels", "onRead", "onCount", "onError"]);
  return (
    <nx-scan
      {...rest}
      prop:formats={local.formats}
      prop:items={local.items}
      prop:labels={local.labels}
      attr:mode={local.mode}
      attr:source={local.source}
      attr:wedge={local.wedge}
      attr:locale={local.locale}
      bool:muted={!!local.muted}
      bool:autostart={!!local.autostart}
      on:nx-scan-read={(e) => local.onRead?.(e)}
      on:nx-scan-count={(e) => local.onCount?.(e)}
      on:nx-scan-error={(e) => local.onError?.(e)}
    />
  );
}
