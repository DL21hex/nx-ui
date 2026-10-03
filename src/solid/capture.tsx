/** `<DocCapture>` para SolidJS: envuelve `<nx-doc-capture>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/capture/index";
import type { NxDocCapture } from "../components/capture/doc-capture";
import type { CaptureEvent, CaptureLabels, CaptureSchemaItem, CaptureSubmitDetail, CaptureValues } from "../components/capture/types";

export type { NxDocCapture, CaptureEvent, CaptureLabels, CaptureSchemaItem, CaptureSubmitDetail, CaptureValues };

export interface DocCaptureProps extends Omit<JSX.HTMLAttributes<NxDocCapture>, "onSubmit" | "children"> {
  /** Qué se captura: campos y tablas. */
  schema: CaptureSchemaItem[];
  /** URL que lee el documento (POST multipart `file`, responde en streaming). */
  endpoint?: string;
  /** URL que registra lo capturado (POST JSON `{values, confirmed}`). */
  action?: string;
  /** Confianza por debajo de la cual un campo exige revisión (0–1). */
  reviewBelow?: number;
  /** Tipos de archivo del selector (por defecto PDF e imágenes). */
  accept?: string;
  /** Tamaño máximo del archivo, en bytes (20 MB). */
  maxSize?: number;
  labels?: Partial<CaptureLabels>;
  onDone?: (e: CustomEvent<{ values: CaptureValues; pending: string[] }>) => void;
  /** Cancelable: con `preventDefault()` la app registra por su cuenta. */
  onSubmit?: (e: CustomEvent<CaptureSubmitDetail>) => void;
  /** Sin hijos: el componente pinta todo su contenido. */
  children?: never;
}

export function DocCapture(props: DocCaptureProps): JSX.Element {
  const [local, rest] = splitProps(props, ["schema", "endpoint", "action", "reviewBelow", "accept", "maxSize", "labels", "onDone", "onSubmit", "children"]);
  return (
    <nx-doc-capture
      {...rest}
      prop:schema={local.schema}
      prop:labels={local.labels}
      attr:endpoint={local.endpoint}
      attr:action={local.action}
      attr:review-below={local.reviewBelow === undefined ? undefined : String(local.reviewBelow)}
      attr:accept={local.accept}
      attr:max-size={local.maxSize === undefined ? undefined : String(local.maxSize)}
      on:nx-doc-capture-done={(e) => e.target === e.currentTarget && local.onDone?.(e)}
      on:nx-doc-capture-submit={(e) => e.target === e.currentTarget && local.onSubmit?.(e)}
    />
  );
}
