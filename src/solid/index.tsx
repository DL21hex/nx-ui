/**
 * Adaptador para SolidJS: tipos JSX de las etiquetas y envoltorios (`<SideMenu>`, `<Button>`,
 * `<Select>`, `<AIAnswer>`, `<DocCapture>`, `<Grid>`, `<Dialog>`), y `nxToast` / `nxConfirm`.
 *
 * Se publica como JSX sin compilar bajo la condición de export `"solid"`: el compilador de la
 * app (vite-plugin-solid) lo compila para SSR o para el navegador según corresponda.
 *
 * Por qué el envoltorio usa `prop:` y `bool:`:
 * - `items={x}` en un elemento personalizado se renderiza en el servidor como el atributo
 *   `items="[object Object]"`, y al hidratar no se asigna la propiedad. `prop:items` evita las dos cosas.
 * - `collapsed={false}` escribe `collapsed="false"`; `bool:collapsed` quita el atributo.
 */
import { createEffect, splitProps, type JSX } from "solid-js";
import "../components/sidemenu/index";
import "../components/button/index";
import type { NxButton } from "../components/button/button";
import type { ButtonLabels, ButtonVariant, DoneDetail, LogMode } from "../components/button/types";
import "../components/select/index";
import type { NxSelect } from "../components/select/select";
import type { SelectChangeDetail, SelectField, SelectLabels, SelectOption } from "../components/select/types";
import "../components/ai/index";
import type { NxAiAnswer } from "../components/ai/ai-answer";
import type { AiActionDetail, AiDoneDetail, AiEvent, AiFeedbackDetail, AiLabels } from "../components/ai/types";
import "../components/capture/index";
import type { NxDocCapture } from "../components/capture/doc-capture";
import type { CaptureEvent, CaptureLabels, CaptureSchemaItem, CaptureSubmitDetail, CaptureValues } from "../components/capture/types";
import "../components/grid/index";
import type { NxGrid } from "../components/grid/grid";
import type { GridChange, GridColumn, GridFilter, GridLabels, GridRow, GridSort } from "../components/grid/types";
import "../components/dialog/index";
import type { NxDialog } from "../components/dialog/dialog";
import type { CloseReason, DialogCloseDetail, DialogLabels, DialogMode, DialogSize } from "../components/dialog/types";
export { nxConfirm } from "../components/confirm/index";
export { nxToast } from "../components/toast/index";
import type { NxSidemenu } from "../components/sidemenu/sidemenu";
import type { MenuItem, OpenChangeDetail, SelectDetail, SidemenuLabels, ToggleDetail } from "../components/sidemenu/types";

export type { MenuItem, SidemenuLabels, SelectDetail, ToggleDetail, OpenChangeDetail, NxSidemenu };
export type { NxButton, ButtonLabels, ButtonVariant, DoneDetail, LogMode };
export type { NxSelect, SelectChangeDetail, SelectField, SelectLabels, SelectOption };
export type { NxAiAnswer, AiActionDetail, AiDoneDetail, AiEvent, AiFeedbackDetail, AiLabels };
export type { NxDocCapture, CaptureEvent, CaptureLabels, CaptureSchemaItem, CaptureSubmitDetail, CaptureValues };
export type { NxDialog, CloseReason, DialogCloseDetail, DialogLabels, DialogMode, DialogSize };
export type { NxGrid, GridChange, GridColumn, GridFilter, GridLabels, GridRow, GridSort };

type GridFilterDetail = { filters: GridFilter[]; sort: GridSort | null; groupBy: string; count: number };

declare module "solid-js" {
  namespace JSX {
    interface ExplicitProperties {
      items: MenuItem[];
      labels: Partial<SidemenuLabels> | Partial<ButtonLabels> | Partial<SelectLabels> | Partial<AiLabels> | Partial<CaptureLabels> | Partial<GridLabels> | Partial<DialogLabels> | undefined;
      schema: CaptureSchemaItem[] | undefined;
      suggestions: string[] | undefined;
      context: unknown;
      progress: number | null | undefined;
      options: SelectOption[];
      fields: SelectField[];
      value: string | string[] | undefined;
      selection: SelectOption[] | undefined;
      columns: GridColumn[];
      rows: GridRow[] | undefined;
      filters: GridFilter[] | undefined;
      sort: GridSort | null | undefined;
    }
    interface ExplicitAttributes {
      active: string | undefined;
      label: string | undefined;
      icon: string | undefined;
      variant: ButtonVariant | undefined;
      type: "button" | "submit" | undefined;
      "log-mode": LogMode | undefined;
      stream: string | undefined;
      method: string | undefined;
      placeholder: string | undefined;
      source: string | undefined;
      name: string | undefined;
      endpoint: string | undefined;
      question: string | undefined;
      action: string | undefined;
      "review-below": string | undefined;
      "ai-endpoint": string | undefined;
      "nl-endpoint": string | undefined;
      "group-by": string | undefined;
      "row-key": string | undefined;
      filename: string | undefined;
      height: string | undefined;
      locale: string | undefined;
      heading: string | undefined;
      description: string | undefined;
      mode: DialogMode | undefined;
      size: DialogSize | undefined;
      url: string | undefined;
      hold: string | undefined;
    }
    interface ExplicitBoolAttributes {
      collapsed: boolean;
      collapsible: boolean;
      "auto-collapse": boolean;
      busy: boolean;
      disabled: boolean;
      multiple: boolean;
      required: boolean;
      clearable: boolean;
      avatar: boolean;
      feedback: boolean;
      "facets-open": boolean;
      persistent: boolean;
    }
    interface CustomEvents {
      "nx-select": CustomEvent<SelectDetail>;
      "nx-toggle": CustomEvent<ToggleDetail>;
      "nx-open-change": CustomEvent<OpenChangeDetail>;
      "nx-done": CustomEvent<DoneDetail>;
      "nx-change": CustomEvent<SelectChangeDetail>;
      "nx-ai-done": CustomEvent<AiDoneDetail>;
      "nx-ai-action": CustomEvent<AiActionDetail>;
      "nx-ai-feedback": CustomEvent<AiFeedbackDetail>;
      "nx-capture-done": CustomEvent<{ values: CaptureValues; pending: string[] }>;
      "nx-capture-submit": CustomEvent<CaptureSubmitDetail>;
      "nx-grid-filter": CustomEvent<GridFilterDetail>;
      "nx-grid-change": CustomEvent<{ changes: GridChange[] }>;
      "nx-grid-columns": CustomEvent<{ columns: GridColumn[] }>;
      "nx-dialog-close": CustomEvent<DialogCloseDetail>;
    }
    interface IntrinsicElements {
      "nx-sidemenu": HTMLAttributes<NxSidemenu> & { active?: string };
      "nx-button": HTMLAttributes<NxButton> & { label?: string; icon?: string; variant?: ButtonVariant };
      "nx-select": HTMLAttributes<NxSelect> & { label?: string; placeholder?: string };
      "nx-ai-answer": HTMLAttributes<NxAiAnswer> & { endpoint?: string; placeholder?: string };
      "nx-doc-capture": HTMLAttributes<NxDocCapture> & { endpoint?: string };
      "nx-grid": HTMLAttributes<NxGrid> & { source?: string };
      "nx-dialog": HTMLAttributes<NxDialog> & { heading?: string };
    }
  }
}

export interface SideMenuProps extends Omit<JSX.HTMLAttributes<NxSidemenu>, "onSelect" | "onToggle"> {
  items: MenuItem[];
  /** El href (o id) de la pantalla actual, p. ej. `useLocation().pathname`. */
  active?: string;
  collapsed?: boolean;
  collapsible?: boolean;
  /** Compacto automático en tablet (768–1023 px). */
  autoCollapse?: boolean;
  labels?: Partial<SidemenuLabels>;
  /** Cancelable: `e.preventDefault()` evita la navegación del enlace. */
  onSelect?: (e: CustomEvent<SelectDetail>) => void;
  /** Cancelable: con `preventDefault()` el estado compacto lo controla la app. */
  onToggle?: (e: CustomEvent<ToggleDetail>) => void;
  onOpenChange?: (e: CustomEvent<OpenChangeDetail>) => void;
}

export function SideMenu(props: SideMenuProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "items",
    "active",
    "collapsed",
    "collapsible",
    "autoCollapse",
    "labels",
    "onSelect",
    "onToggle",
    "onOpenChange",
    "children",
  ]);
  return (
    <nx-sidemenu
      {...rest}
      prop:items={local.items}
      prop:labels={local.labels}
      attr:active={local.active}
      bool:collapsed={!!local.collapsed}
      bool:collapsible={!!local.collapsible}
      bool:auto-collapse={!!local.autoCollapse}
      on:nx-select={(e) => local.onSelect?.(e)}
      on:nx-toggle={(e) => local.onToggle?.(e)}
      on:nx-open-change={(e) => local.onOpenChange?.(e)}
    >
      {local.children}
    </nx-sidemenu>
  );
}

export interface ButtonProps extends Omit<JSX.HTMLAttributes<NxButton>, "onClick"> {
  label: string;
  icon?: string;
  variant?: ButtonVariant;
  type?: "button" | "submit";
  disabled?: boolean;
  /** Ocupado: spinner y bloqueo. Para tareas con registro, usa `ref` y `el.run(...)`. */
  busy?: boolean;
  progress?: number | null;
  logMode?: LogMode;
  /** URL que transmite el avance (NDJSON o SSE): el clic corre la tarea solo. */
  stream?: string;
  method?: string;
  labels?: Partial<ButtonLabels>;
  /** Mantener pulsado (ms) para activarlo: para lo destructivo. */
  hold?: number;
  /** No se dispara mientras está ocupado. */
  onClick?: (e: MouseEvent) => void;
  onDone?: (e: CustomEvent<DoneDetail>) => void;
}

export function Button(props: ButtonProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "label",
    "icon",
    "variant",
    "type",
    "disabled",
    "busy",
    "progress",
    "logMode",
    "stream",
    "method",
    "labels",
    "hold",
    "onClick",
    "onDone",
  ]);
  return (
    <nx-button
      {...rest}
      attr:label={local.label}
      attr:icon={local.icon}
      attr:variant={local.variant}
      attr:type={local.type}
      attr:log-mode={local.logMode}
      attr:stream={local.stream}
      attr:method={local.method}
      attr:hold={local.hold ? String(local.hold) : undefined}
      bool:disabled={!!local.disabled}
      bool:busy={!!local.busy}
      prop:progress={local.progress ?? null}
      prop:labels={local.labels}
      on:click={(e) => local.onClick?.(e)}
      on:nx-done={(e) => local.onDone?.(e)}
    />
  );
}

export interface SelectProps extends Omit<JSX.HTMLAttributes<NxSelect>, "onChange"> {
  /** Columnas buscables; la primera es la principal. */
  fields: SelectField[];
  /** Registros locales. Para catálogos grandes, `source`. */
  options?: SelectOption[];
  /** URL de búsqueda en el servidor (`?q=`). */
  source?: string;
  value?: string | string[];
  /** Registros elegidos (con `source`, para pintar la selección inicial). */
  selection?: SelectOption[];
  multiple?: boolean;
  placeholder?: string;
  /** Nombre accesible del campo. */
  label?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  avatar?: boolean;
  labels?: Partial<SelectLabels>;
  onChange?: (e: CustomEvent<SelectChangeDetail>) => void;
}

export function Select(props: SelectProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "fields",
    "options",
    "source",
    "value",
    "selection",
    "multiple",
    "placeholder",
    "label",
    "name",
    "required",
    "disabled",
    "clearable",
    "avatar",
    "labels",
    "onChange",
  ]);
  return (
    <nx-select
      {...rest}
      prop:fields={local.fields}
      prop:options={local.options ?? []}
      prop:value={local.value}
      prop:selection={local.selection}
      prop:labels={local.labels}
      attr:source={local.source}
      attr:placeholder={local.placeholder}
      attr:label={local.label}
      attr:name={local.name}
      bool:multiple={!!local.multiple}
      bool:required={!!local.required}
      bool:disabled={!!local.disabled}
      bool:clearable={!!local.clearable}
      bool:avatar={!!local.avatar}
      on:nx-change={(e) => local.onChange?.(e)}
    />
  );
}

export interface AIAnswerProps extends JSX.HTMLAttributes<NxAiAnswer> {
  /** URL que responde con el protocolo de streaming de nx-ui (POST `{question, context}`). */
  endpoint?: string;
  method?: string;
  /** Pregunta inicial; con `endpoint`, se pregunta al montar. */
  question?: string;
  placeholder?: string;
  suggestions?: string[];
  /** Datos que viajan con cada pregunta (el registro que se está viendo…). */
  context?: unknown;
  feedback?: boolean;
  labels?: Partial<AiLabels>;
  onDone?: (e: CustomEvent<AiDoneDetail>) => void;
  onAction?: (e: CustomEvent<AiActionDetail>) => void;
  onFeedback?: (e: CustomEvent<AiFeedbackDetail>) => void;
}

export function AIAnswer(props: AIAnswerProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "endpoint",
    "method",
    "question",
    "placeholder",
    "suggestions",
    "context",
    "feedback",
    "labels",
    "onDone",
    "onAction",
    "onFeedback",
  ]);
  return (
    <nx-ai-answer
      {...rest}
      attr:endpoint={local.endpoint}
      attr:method={local.method}
      attr:question={local.question}
      attr:placeholder={local.placeholder}
      prop:suggestions={local.suggestions}
      prop:context={local.context}
      prop:labels={local.labels}
      bool:feedback={!!local.feedback}
      on:nx-ai-done={(e) => local.onDone?.(e)}
      on:nx-ai-action={(e) => local.onAction?.(e)}
      on:nx-ai-feedback={(e) => local.onFeedback?.(e)}
    />
  );
}

export interface DocCaptureProps extends Omit<JSX.HTMLAttributes<NxDocCapture>, "onSubmit"> {
  /** Qué se captura: campos y tablas. */
  schema: CaptureSchemaItem[];
  /** URL que lee el documento (POST multipart `file`, responde en streaming). */
  endpoint?: string;
  /** URL que registra lo capturado (POST JSON `{values, confirmed}`). */
  action?: string;
  /** Confianza por debajo de la cual un campo exige revisión (0–1). */
  reviewBelow?: number;
  labels?: Partial<CaptureLabels>;
  onDone?: (e: CustomEvent<{ values: CaptureValues; pending: string[] }>) => void;
  /** Cancelable: con `preventDefault()` la app registra por su cuenta. */
  onSubmit?: (e: CustomEvent<CaptureSubmitDetail>) => void;
}

export function DocCapture(props: DocCaptureProps): JSX.Element {
  const [local, rest] = splitProps(props, ["schema", "endpoint", "action", "reviewBelow", "labels", "onDone", "onSubmit"]);
  return (
    <nx-doc-capture
      {...rest}
      prop:schema={local.schema}
      prop:labels={local.labels}
      attr:endpoint={local.endpoint}
      attr:action={local.action}
      attr:review-below={local.reviewBelow === undefined ? undefined : String(local.reviewBelow)}
      on:nx-capture-done={(e) => local.onDone?.(e)}
      on:nx-capture-submit={(e) => local.onSubmit?.(e)}
    />
  );
}

export interface GridProps extends Omit<JSX.HTMLAttributes<NxGrid>, "onChange"> {
  columns: GridColumn[];
  /** Filas en el cliente. Sin `source`, se filtra, ordena y agrega aquí. */
  rows?: GridRow[];
  /** URL de datos en el servidor (POST `{offset, limit, sort, filters}` → `GridPage`). */
  source?: string;
  /** URL que calcula las columnas de IA. Sin ella no aparece «Columna IA». */
  aiEndpoint?: string;
  /** URL opcional para frases que el analizador local no entiende. */
  nlEndpoint?: string;
  filters?: GridFilter[];
  sort?: GridSort | null;
  groupBy?: string;
  rowKey?: string;
  facetsOpen?: boolean;
  height?: number;
  filename?: string;
  /** Formato de números, montos, fechas y orden (`es-CO`, `en-US`…). Por defecto, el `lang` de la página. */
  locale?: string;
  labels?: Partial<GridLabels>;
  onFilter?: (e: CustomEvent<GridFilterDetail>) => void;
  /** Cancelable: con `preventDefault()` la edición no se aplica. */
  onChange?: (e: CustomEvent<{ changes: GridChange[] }>) => void;
  onColumns?: (e: CustomEvent<{ columns: GridColumn[] }>) => void;
}

export function Grid(props: GridProps): JSX.Element {
  const [local, rest] = splitProps(props, ["columns", "rows", "source", "aiEndpoint", "nlEndpoint", "filters", "sort", "groupBy", "rowKey", "facetsOpen", "height", "filename", "locale", "labels", "onFilter", "onChange", "onColumns"]);
  return (
    <nx-grid
      {...rest}
      prop:columns={local.columns}
      prop:rows={local.rows}
      prop:filters={local.filters}
      prop:sort={local.sort}
      prop:labels={local.labels}
      attr:source={local.source}
      attr:ai-endpoint={local.aiEndpoint}
      attr:nl-endpoint={local.nlEndpoint}
      attr:group-by={local.groupBy}
      attr:row-key={local.rowKey}
      attr:height={local.height === undefined ? undefined : String(local.height)}
      attr:filename={local.filename}
      attr:locale={local.locale}
      bool:facets-open={!!local.facetsOpen}
      on:nx-grid-filter={(e) => local.onFilter?.(e)}
      on:nx-grid-change={(e) => local.onChange?.(e)}
      on:nx-grid-columns={(e) => local.onColumns?.(e)}
    />
  );
}

export interface DialogProps extends Omit<JSX.HTMLAttributes<NxDialog>, "onClose"> {
  /** Controlado: abre y cierra con la señal (y avisa en `onOpenChange`). */
  open?: boolean;
  heading?: string;
  description?: string;
  mode?: DialogMode;
  size?: DialogSize;
  persistent?: boolean;
  /** Entrada de historial al abrir («atrás» cierra). `""` = la URL actual. */
  url?: string;
  labels?: Partial<DialogLabels>;
  onOpenChange?: (e: CustomEvent<{ open: boolean; value?: string; reason?: CloseReason }>) => void;
  /** Cancelable: `e.preventDefault()` lo deja abierto. */
  onClose?: (e: CustomEvent<DialogCloseDetail>) => void;
  children?: JSX.Element;
}

export function Dialog(props: DialogProps): JSX.Element {
  const [local, rest] = splitProps(props, ["open", "heading", "description", "mode", "size", "persistent", "url", "labels", "onOpenChange", "onClose", "children"]);
  let el: NxDialog | undefined;
  createEffect(() => {
    const want = !!local.open;
    if (el && want !== el.open) {
      if (want) void el.show();
      else el.close(undefined, "api");
    }
  });
  return (
    <nx-dialog
      {...rest}
      ref={(e: NxDialog) => (el = e)}
      attr:heading={local.heading}
      attr:description={local.description}
      attr:mode={local.mode}
      attr:size={local.size}
      attr:url={local.url}
      bool:persistent={!!local.persistent}
      prop:labels={local.labels}
      on:nx-open-change={(e) => local.onOpenChange?.(e)}
      on:nx-dialog-close={(e) => local.onClose?.(e)}
    >
      {local.children}
    </nx-dialog>
  );
}
