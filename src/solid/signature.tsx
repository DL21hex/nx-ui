/** `<Signature>` para SolidJS: envuelve `<nx-signature>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/signature/index";
import type { NxSignature } from "../components/signature/signature";
import type { SignatureDoneDetail, SignatureFormat, SignatureLabels, SignatureMeta, SignatureValue } from "../components/signature/types";

export type { NxSignature, SignatureDoneDetail, SignatureFormat, SignatureLabels, SignatureMeta, SignatureValue };

export interface SignatureProps extends Omit<JSX.HTMLAttributes<NxSignature>, "onChange"> {
  /** Nombre en el <form>. Lo que se envía depende de `valueFormat`. */
  name?: string;
  /** Exige una firma de verdad (ni un punto ni una raya) y el nombre y la cédula que se pidan. */
  required?: boolean;
  readonly?: boolean;
  disabled?: boolean;
  askName?: boolean;
  askId?: boolean;
  /** El texto que se firma, o el `id` de un elemento cuyo texto se firma: con él sale `meta.hash`. */
  document?: string;
  geo?: boolean;
  /** `json` (por defecto: `{svg, meta}`), `svg` o `png` (un archivo). */
  valueFormat?: SignatureFormat;
  /** Sin botón «Firmar»: la firma se da por hecha un momento después del último trazo. */
  auto?: boolean;
  /** Base de las rutas de `<nx-handoff>` (`/api/handoff`): muestra «Firmar en el celular». */
  handoff?: string;
  penColor?: string;
  height?: number;
  locale?: string;
  /** Una firma guardada: `{svg, meta}`, su JSON o el SVG. */
  value?: SignatureValue | string | null;
  labels?: Partial<SignatureLabels>;
  onChange?: (e: CustomEvent<{ empty: boolean }>) => void;
  onDone?: (e: CustomEvent<SignatureDoneDetail>) => void;
}

export function Signature(props: SignatureProps): JSX.Element {
  const [local, rest] = splitProps(props, ["name", "required", "readonly", "disabled", "askName", "askId", "document", "geo", "valueFormat", "auto", "handoff", "penColor", "height", "locale", "value", "labels", "onChange", "onDone"]);
  return (
    <nx-signature
      {...rest}
      prop:value={local.value}
      prop:labels={local.labels}
      attr:name={local.name}
      attr:document={local.document}
      attr:value-format={local.valueFormat}
      attr:handoff={local.handoff}
      attr:pen-color={local.penColor}
      attr:height={local.height === undefined ? undefined : String(local.height)}
      attr:locale={local.locale}
      bool:required={!!local.required}
      bool:readonly={!!local.readonly}
      bool:disabled={!!local.disabled}
      bool:ask-name={!!local.askName}
      bool:ask-id={!!local.askId}
      bool:geo={!!local.geo}
      bool:auto={!!local.auto}
      on:nx-signature-change={(e) => local.onChange?.(e)}
      on:nx-signature-done={(e) => local.onDone?.(e)}
    />
  );
}
