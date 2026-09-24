/**
 * Adaptador para SolidJS: tipos JSX de las etiquetas y un envoltorio `<SideMenu>`.
 *
 * Se publica como JSX sin compilar bajo la condición de export `"solid"`: el compilador de la
 * app (vite-plugin-solid) lo compila para SSR o para el navegador según corresponda.
 *
 * Por qué el envoltorio usa `prop:` y `bool:`:
 * - `items={x}` en un elemento personalizado se renderiza en el servidor como el atributo
 *   `items="[object Object]"`, y al hidratar no se asigna la propiedad. `prop:items` evita las dos cosas.
 * - `collapsed={false}` escribe `collapsed="false"`; `bool:collapsed` quita el atributo.
 */
import { splitProps, type JSX } from "solid-js";
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
import type { NxSidemenu } from "../components/sidemenu/sidemenu";
import type { MenuItem, OpenChangeDetail, SelectDetail, SidemenuLabels, ToggleDetail } from "../components/sidemenu/types";

export type { MenuItem, SidemenuLabels, SelectDetail, ToggleDetail, OpenChangeDetail, NxSidemenu };
export type { NxButton, ButtonLabels, ButtonVariant, DoneDetail, LogMode };
export type { NxSelect, SelectChangeDetail, SelectField, SelectLabels, SelectOption };
export type { NxAiAnswer, AiActionDetail, AiDoneDetail, AiEvent, AiFeedbackDetail, AiLabels };

declare module "solid-js" {
  namespace JSX {
    interface ExplicitProperties {
      items: MenuItem[];
      labels: Partial<SidemenuLabels> | Partial<ButtonLabels> | Partial<SelectLabels> | Partial<AiLabels> | undefined;
      suggestions: string[] | undefined;
      context: unknown;
      progress: number | null | undefined;
      options: SelectOption[];
      fields: SelectField[];
      value: string | string[] | undefined;
      selection: SelectOption[] | undefined;
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
    }
    interface IntrinsicElements {
      "nx-sidemenu": HTMLAttributes<NxSidemenu> & { active?: string };
      "nx-button": HTMLAttributes<NxButton> & { label?: string; icon?: string; variant?: ButtonVariant };
      "nx-select": HTMLAttributes<NxSelect> & { label?: string; placeholder?: string };
      "nx-ai-answer": HTMLAttributes<NxAiAnswer> & { endpoint?: string; placeholder?: string };
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
