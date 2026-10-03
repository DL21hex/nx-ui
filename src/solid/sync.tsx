/** `<Sync>` para SolidJS: envuelve `<nx-sync>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/sync/index";
import type { NxSync } from "../components/sync/sync";
import type { SyncChangeDetail, SyncField, SyncLabels, SyncOp } from "../components/sync/types";

export type { NxSync, SyncChangeDetail, SyncField, SyncLabels, SyncOp };

export interface SyncProps extends Omit<JSX.HTMLAttributes<NxSync>, "onChange" | "children"> {
  /** URL que responde rápido para comprobar que hay conexión de verdad (ajusta la cola de la página). */
  ping?: string;
  /** Nombres de los campos para el comparador: `[{key: "productos.*.cantidad", label: "Cantidad · {nombre}"}]`. */
  fields?: SyncField[];
  locale?: string;
  labels?: Partial<SyncLabels>;
  /** `{online, pending, conflicts}` cada vez que cambia algo de eso. */
  onChange?: (e: CustomEvent<SyncChangeDetail>) => void;
  /** Una operación llegó al servidor: `{op, data}` con la respuesta. */
  onDone?: (e: CustomEvent<{ op: SyncOp; data: unknown }>) => void;
  /** El servidor pidió iniciar sesión (401): la cola se detiene hasta `flush()` con la sesión nueva. */
  onAuth?: (e: CustomEvent<{ op: SyncOp }>) => void;
  /** Sin hijos: el componente pinta todo su contenido. */
  children?: never;
}

export function Sync(props: SyncProps): JSX.Element {
  const [local, rest] = splitProps(props, ["ping", "fields", "locale", "labels", "onChange", "onDone", "onAuth", "children"]);
  return (
    <nx-sync
      {...rest}
      prop:fields={local.fields}
      prop:labels={local.labels}
      attr:ping={local.ping}
      attr:locale={local.locale}
      on:nx-sync-change={(e) => e.target === e.currentTarget && local.onChange?.(e)}
      on:nx-sync-done={(e) => e.target === e.currentTarget && local.onDone?.(e)}
      on:nx-sync-auth={(e) => e.target === e.currentTarget && local.onAuth?.(e)}
    />
  );
}
