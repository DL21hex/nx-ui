/**
 * Adaptador para SolidJS: tipos JSX de las etiquetas y envoltorios (`<SideMenu>`, `<Button>`,
 * `<Select>`, `<AIAnswer>`, `<DocCapture>`, `<Grid>`, `<Dialog>`, `<Agent>`, `<Command>`, `<Explain>`,
 * `<Inbox>`, `<Survey>`, `<NumberInput>`, `<Kanban>`, `<History>`, `<DateRange>`,
 * `<PasteFill>`, `<Presence>`), y `nxToast` / `nxConfirm`.
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
import "../components/agent/index";
import type { NxAgent } from "../components/agent/agent";
import type { AgentLabels, AgentToolDetail, AguiContext, AguiEvent, AguiTool } from "../components/agent/types";
import "../components/command/index";
import type { NxCommand } from "../components/command/command";
import type { CommandItem, CommandLabels, CommandSelectDetail } from "../components/command/types";
import "../components/explain/index";
import type { NxExplain } from "../components/explain/explain";
import type { ExplainEvent, ExplainLabels } from "../components/explain/types";
import "../components/inbox/index";
import type { NxInbox } from "../components/inbox/inbox";
import type { InboxDecisionDetail, InboxItem, InboxLabels } from "../components/inbox/types";
import "../components/survey/index";
import type { NxSurvey } from "../components/survey/survey";
import type { SurveyAnswers, SurveyLabels, SurveyQuestionInput, SurveyResults, SurveySubmitDetail } from "../components/survey/types";
import "../components/number/index";
import type { NxNumber } from "../components/number/number";
import type { NumberAlign, NumberChangeDetail, NumberFormat, NumberLabels } from "../components/number/types";
import "../components/kanban/index";
import type { NxKanban } from "../components/kanban/kanban";
import type { KanbanCard, KanbanColumn, KanbanLabels, KanbanMoveDetail } from "../components/kanban/types";
import "../components/history/index";
import type { NxHistory } from "../components/history/history";
import type { HistoryActor, HistoryCommitDetail, HistoryEvent, HistoryField, HistoryLabels, HistoryRevertDetail, HistoryValue } from "../components/history/types";
import "../components/paste-fill/index";
import type { NxPasteFill } from "../components/paste-fill/paste-fill";
import type { PasteFieldInput, PasteFillDoneDetail, PasteFillLabels } from "../components/paste-fill/types";
import "../components/presence/index";
import type { NxPresence } from "../components/presence/presence";
import type { PresenceEvent, PresenceLabels, PresenceState, PresenceUser } from "../components/presence/types";
import "../components/date-range/index";
import type { NxDateRange } from "../components/date-range/date-range";
import type { DateRangeChangeDetail, DateRangeCompare, DateRangeLabels, DateRangePresetInput, DateRangeValue } from "../components/date-range/types";
import type { NxSidemenu } from "../components/sidemenu/sidemenu";
import type { MenuItem, OpenChangeDetail, SelectDetail, SidemenuLabels, ToggleDetail } from "../components/sidemenu/types";

export type { MenuItem, SidemenuLabels, SelectDetail, ToggleDetail, OpenChangeDetail, NxSidemenu };
export type { NxButton, ButtonLabels, ButtonVariant, DoneDetail, LogMode };
export type { NxSelect, SelectChangeDetail, SelectField, SelectLabels, SelectOption };
export type { NxAiAnswer, AiActionDetail, AiDoneDetail, AiEvent, AiFeedbackDetail, AiLabels };
export type { NxDocCapture, CaptureEvent, CaptureLabels, CaptureSchemaItem, CaptureSubmitDetail, CaptureValues };
export type { NxAgent, AgentLabels, AgentToolDetail, AguiContext, AguiEvent, AguiTool };
export type { NxDialog, CloseReason, DialogCloseDetail, DialogLabels, DialogMode, DialogSize };
export type { NxGrid, GridChange, GridColumn, GridFilter, GridLabels, GridRow, GridSort };
export type { NxCommand, CommandItem, CommandLabels, CommandSelectDetail };
export type { NxExplain, ExplainEvent, ExplainLabels };
export type { NxInbox, InboxDecisionDetail, InboxItem, InboxLabels };
export type { NxNumber, NumberAlign, NumberChangeDetail, NumberFormat, NumberLabels };
export type { NxKanban, KanbanCard, KanbanColumn, KanbanLabels, KanbanMoveDetail };
export type { NxHistory, HistoryActor, HistoryCommitDetail, HistoryEvent, HistoryField, HistoryLabels, HistoryRevertDetail };
export type { NxDateRange, DateRangeChangeDetail, DateRangeCompare, DateRangeLabels, DateRangePresetInput, DateRangeValue };
export type { NxPasteFill, PasteFieldInput, PasteFillDoneDetail, PasteFillLabels };
export type { NxPresence, PresenceEvent, PresenceLabels, PresenceState, PresenceUser };
export type { NxSurvey, SurveyAnswers, SurveyLabels, SurveyQuestionInput, SurveyResults, SurveySubmitDetail };

type GridFilterDetail = { filters: GridFilter[]; sort: GridSort | null; groupBy: string; count: number };

declare module "solid-js" {
  namespace JSX {
    interface ExplicitProperties {
      me: PresenceUser | null | undefined;
      items: MenuItem[] | CommandItem[] | InboxItem[] | undefined;
      labels: Partial<SidemenuLabels> | Partial<ButtonLabels> | Partial<SelectLabels> | Partial<AiLabels> | Partial<CaptureLabels> | Partial<GridLabels> | Partial<DialogLabels> | Partial<AgentLabels> | Partial<CommandLabels> | Partial<ExplainLabels> | Partial<InboxLabels> | Partial<SurveyLabels> | Partial<NumberLabels> | Partial<KanbanLabels> | Partial<HistoryLabels> | Partial<DateRangeLabels> | Partial<PasteFillLabels> | Partial<PresenceLabels> | undefined;
      schema: CaptureSchemaItem[] | undefined;
      suggestions: string[] | undefined;
      context: unknown;
      progress: number | null | undefined;
      options: SelectOption[];
      fields: SelectField[] | HistoryField[] | PasteFieldInput[] | undefined;
      record: Record<string, unknown> | undefined;
      events: HistoryEvent[] | undefined;
      user: HistoryActor | null | undefined;
      value: string | string[] | number | DateRangeValue | null | undefined;
      presets: DateRangePresetInput[] | undefined;
      selection: SelectOption[] | undefined;
      columns: GridColumn[] | KanbanColumn[];
      cards: KanbanCard[] | undefined;
      rows: GridRow[] | undefined;
      filters: GridFilter[] | undefined;
      sort: GridSort | null | undefined;
      selected: string[] | undefined;
      tools: AguiTool[] | undefined;
      explanation: ExplainEvent[] | null | undefined;
      questions: SurveyQuestionInput[] | undefined;
      answers: SurveyAnswers | undefined;
      results: SurveyResults | null | undefined;
    }
    interface ExplicitAttributes {
      idle: string | undefined;
      channel: string | undefined;
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
      for: string | undefined;
      menu: string | undefined;
      agent: string | undefined;
      hotkey: string | undefined;
      storage: string | undefined;
      undo: string | undefined;
      layout: string | undefined;
      format: NumberFormat | undefined;
      currency: string | undefined;
      decimals: string | undefined;
      min: string | undefined;
      max: string | undefined;
      step: string | undefined;
      align: NumberAlign | undefined;
      start: string | undefined;
      end: string | undefined;
      phrase: string | undefined;
      compare: string | undefined;
      today: string | undefined;
      "fiscal-start": string | undefined;
      "week-start": string | undefined;
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
      selectable: boolean;
      "require-reason": boolean;
      echo: boolean;
      words: boolean;
      readonly: boolean;
    }
    interface CustomEvents {
      "nx-presence-local": CustomEvent<PresenceEvent>;
      "nx-presence-change": CustomEvent<{ users: PresenceState[] }>;
      "nx-select": CustomEvent<SelectDetail>;
      "nx-toggle": CustomEvent<ToggleDetail>;
      "nx-open-change": CustomEvent<OpenChangeDetail>;
      "nx-done": CustomEvent<DoneDetail>;
      "nx-change": CustomEvent<SelectChangeDetail | DateRangeChangeDetail>;
      "nx-ai-done": CustomEvent<AiDoneDetail>;
      "nx-ai-action": CustomEvent<AiActionDetail>;
      "nx-ai-feedback": CustomEvent<AiFeedbackDetail>;
      "nx-capture-done": CustomEvent<{ values: CaptureValues; pending: string[] }>;
      "nx-capture-submit": CustomEvent<CaptureSubmitDetail>;
      "nx-grid-filter": CustomEvent<GridFilterDetail>;
      "nx-grid-change": CustomEvent<{ changes: GridChange[] }>;
      "nx-grid-columns": CustomEvent<{ columns: GridColumn[] }>;
      "nx-dialog-close": CustomEvent<DialogCloseDetail>;
      "nx-grid-selection": CustomEvent<{ ids: string[]; count: number }>;
      "nx-agent-tool": CustomEvent<AgentToolDetail>;
      "nx-agent-state": CustomEvent<{ state: unknown }>;
      "nx-agent-event": CustomEvent<AguiEvent>;
      "nx-grid-open": CustomEvent<{ id: string; row: GridRow; key: string; origin: HTMLElement | null }>;
      "nx-command-select": CustomEvent<CommandSelectDetail>;
      "nx-command-ask": CustomEvent<{ query: string }>;
      "nx-inbox-decide": CustomEvent<InboxDecisionDetail>;
      "nx-inbox-commit": CustomEvent<InboxDecisionDetail>;
      "nx-inbox-undo": CustomEvent<InboxDecisionDetail>;
      "nx-inbox-active": CustomEvent<{ id: string; item: InboxItem }>;
      "nx-survey-submit": CustomEvent<SurveySubmitDetail>;
      "nx-history-revert": CustomEvent<HistoryRevertDetail>;
      "nx-history-commit": CustomEvent<HistoryCommitDetail>;
      "nx-history-comment": CustomEvent<{ text: string }>;
      "nx-history-travel": CustomEvent<{ id: string | null; record: Record<string, HistoryValue> }>;
      "nx-kanban-move": CustomEvent<KanbanMoveDetail>;
      "nx-kanban-commit": CustomEvent<KanbanMoveDetail>;
      "nx-kanban-undo": CustomEvent<KanbanMoveDetail>;
      "nx-kanban-add": CustomEvent<{ column: string }>;
      "nx-kanban-open": CustomEvent<{ card: KanbanCard }>;
      "nx-survey-change": CustomEvent<{ id: string; value: unknown; answers: SurveyAnswers }>;
      "nx-paste-fill-start": CustomEvent<{ text: string }>;
      "nx-paste-fill-done": CustomEvent<PasteFillDoneDetail>;
      "nx-paste-fill-undo": CustomEvent<{ values: Record<string, string> }>;
    }
    interface IntrinsicElements {
      "nx-presence": HTMLAttributes<NxPresence> & { channel?: string; source?: string; for?: string };
      "nx-sidemenu": HTMLAttributes<NxSidemenu> & { active?: string };
      "nx-button": HTMLAttributes<NxButton> & { label?: string; icon?: string; variant?: ButtonVariant };
      "nx-select": HTMLAttributes<NxSelect> & { label?: string; placeholder?: string };
      "nx-ai-answer": HTMLAttributes<NxAiAnswer> & { endpoint?: string; placeholder?: string };
      "nx-doc-capture": HTMLAttributes<NxDocCapture> & { endpoint?: string };
      "nx-grid": HTMLAttributes<NxGrid> & { source?: string };
      "nx-dialog": HTMLAttributes<NxDialog> & { heading?: string };
      "nx-agent": HTMLAttributes<NxAgent> & { endpoint?: string };
      "nx-command": HTMLAttributes<NxCommand>;
      "nx-explain": HTMLAttributes<NxExplain> & { endpoint?: string };
      "nx-inbox": HTMLAttributes<NxInbox> & { heading?: string };
      "nx-survey": HTMLAttributes<NxSurvey> & { heading?: string };
      "nx-number": HTMLAttributes<NxNumber> & { label?: string; placeholder?: string };
      "nx-kanban": HTMLAttributes<NxKanban> & { heading?: string };
      "nx-date-range": HTMLAttributes<NxDateRange> & { label?: string; placeholder?: string };
      "nx-history": HTMLAttributes<NxHistory> & { heading?: string; source?: string };
      "nx-paste-fill": HTMLAttributes<NxPasteFill> & { endpoint?: string; for?: string };
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
      on:nx-change={(e) => local.onChange?.(e as CustomEvent<SelectChangeDetail>)}
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
  /** Casillas para seleccionar filas; las acciones van como hijo con `slot="bulk"`. */
  selectable?: boolean;
  selected?: string[];
  height?: number;
  filename?: string;
  /** Formato de números, montos, fechas y orden (`es-CO`, `en-US`…). Por defecto, el `lang` de la página. */
  locale?: string;
  labels?: Partial<GridLabels>;
  onFilter?: (e: CustomEvent<GridFilterDetail>) => void;
  /** Cancelable: con `preventDefault()` la edición no se aplica. */
  onChange?: (e: CustomEvent<{ changes: GridChange[] }>) => void;
  onColumns?: (e: CustomEvent<{ columns: GridColumn[] }>) => void;
  onSelection?: (e: CustomEvent<{ ids: string[]; count: number }>) => void;
  /** Clic en una columna `link` o Enter en una fila: el detalle (p. ej. un `<Dialog mode="panel">`). */
  onOpen?: (e: CustomEvent<{ id: string; row: GridRow; key: string; origin: HTMLElement | null }>) => void;
  children?: JSX.Element;
}

export function Grid(props: GridProps): JSX.Element {
  const [local, rest] = splitProps(props, ["columns", "rows", "source", "aiEndpoint", "nlEndpoint", "filters", "sort", "groupBy", "rowKey", "facetsOpen", "height", "filename", "locale", "labels", "onFilter", "onChange", "onColumns", "selectable", "selected", "onSelection", "onOpen", "children"]);
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
      on:nx-grid-selection={(e) => local.onSelection?.(e)}
      on:nx-grid-open={(e) => local.onOpen?.(e)}
      prop:selected={local.selected}
      bool:selectable={!!local.selectable}
    >
      {local.children}
    </nx-grid>
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

export interface AgentProps extends JSX.HTMLAttributes<NxAgent> {
  /** URL del agente AG-UI (POST de un `RunAgentInput`, eventos en streaming). */
  endpoint: string;
  /** Id de un `<nx-grid>` que el agente puede filtrar y seleccionar. */
  for?: string;
  heading?: string;
  placeholder?: string;
  suggestions?: string[];
  /** Herramientas propias de la app; se atienden en `onTool` llamando a `e.detail.respond(...)`. */
  tools?: AguiTool[];
  context?: AguiContext[];
  labels?: Partial<AgentLabels>;
  onTool?: (e: CustomEvent<AgentToolDetail>) => void;
  onState?: (e: CustomEvent<{ state: unknown }>) => void;
  onEvent?: (e: CustomEvent<AguiEvent>) => void;
}

export function Agent(props: AgentProps): JSX.Element {
  const [local, rest] = splitProps(props, ["endpoint", "for", "heading", "placeholder", "suggestions", "tools", "context", "labels", "onTool", "onState", "onEvent"]);
  return (
    <nx-agent
      {...rest}
      attr:endpoint={local.endpoint}
      attr:for={local.for}
      attr:heading={local.heading}
      attr:placeholder={local.placeholder}
      prop:suggestions={local.suggestions}
      prop:tools={local.tools}
      prop:context={local.context}
      prop:labels={local.labels}
      on:nx-agent-tool={(e) => {
        // Quien pasa `onTool` atiende la herramienta: se marca para que no responda «no disponible».
        if (local.onTool) {
          e.preventDefault();
          local.onTool(e);
        }
      }}
      on:nx-agent-state={(e) => local.onState?.(e)}
      on:nx-agent-event={(e) => local.onEvent?.(e)}
    />
  );
}

export interface CommandProps extends Omit<JSX.HTMLAttributes<NxCommand>, "onSelect"> {
  /** Entradas propias: acciones, enlaces y submenús. */
  items?: CommandItem[];
  /** Id de un `<nx-sidemenu>`: sus pantallas entran en la paleta. */
  menu?: string;
  /** Búsqueda en el servidor: `GET source?q=…` → entradas. */
  source?: string;
  /** Id de un `<nx-agent>` al que se le pregunta lo que no se encuentra. */
  agent?: string;
  /** Atajo global (`"mod+k"`); `"none"` lo quita. */
  hotkey?: string;
  placeholder?: string;
  storage?: string;
  labels?: Partial<CommandLabels>;
  /** Cancelable: la paleta se queda abierta y no navega. */
  onSelect?: (e: CustomEvent<CommandSelectDetail>) => void;
  onAsk?: (e: CustomEvent<{ query: string }>) => void;
}

export function Command(props: CommandProps): JSX.Element {
  const [local, rest] = splitProps(props, ["items", "menu", "source", "agent", "hotkey", "placeholder", "storage", "labels", "onSelect", "onAsk"]);
  return (
    <nx-command
      {...rest}
      prop:items={local.items}
      prop:labels={local.labels}
      attr:menu={local.menu}
      attr:source={local.source}
      attr:agent={local.agent}
      attr:hotkey={local.hotkey}
      attr:placeholder={local.placeholder}
      attr:storage={local.storage}
      on:nx-command-select={(e) => local.onSelect?.(e)}
      on:nx-command-ask={(e) => local.onAsk?.(e)}
    />
  );
}

export interface ExplainProps extends JSX.HTMLAttributes<NxExplain> {
  /** URL del desglose (eventos en streaming). */
  endpoint?: string;
  method?: "GET" | "POST";
  /** El desglose ya armado, sin servidor. */
  explanation?: ExplainEvent[];
  context?: unknown;
  locale?: string;
  labels?: Partial<ExplainLabels>;
  /** La cifra. */
  children?: JSX.Element;
}

export function Explain(props: ExplainProps): JSX.Element {
  const [local, rest] = splitProps(props, ["endpoint", "method", "explanation", "context", "locale", "labels", "children"]);
  return (
    <nx-explain
      {...rest}
      attr:endpoint={local.endpoint}
      attr:method={local.method}
      attr:locale={local.locale}
      prop:explanation={local.explanation}
      prop:context={local.context}
      prop:labels={local.labels}
    >
      {local.children}
    </nx-explain>
  );
}

export interface InboxProps extends JSX.HTMLAttributes<NxInbox> {
  items: InboxItem[];
  heading?: string;
  /** Milisegundos para deshacer (7000); 0 registra al instante. */
  undo?: number;
  requireReason?: boolean;
  locale?: string;
  labels?: Partial<InboxLabels>;
  /** Cancelable: la decisión no se aplica. */
  onDecide?: (e: CustomEvent<InboxDecisionDetail>) => void;
  /** Pasó el tiempo de deshacer: aquí se registra en el backend. */
  onCommit?: (e: CustomEvent<InboxDecisionDetail>) => void;
  onUndo?: (e: CustomEvent<InboxDecisionDetail>) => void;
  onActive?: (e: CustomEvent<{ id: string; item: InboxItem }>) => void;
}

export function Inbox(props: InboxProps): JSX.Element {
  const [local, rest] = splitProps(props, ["items", "heading", "undo", "requireReason", "locale", "labels", "onDecide", "onCommit", "onUndo", "onActive"]);
  return (
    <nx-inbox
      {...rest}
      prop:items={local.items}
      prop:labels={local.labels}
      attr:heading={local.heading}
      attr:undo={local.undo === undefined ? undefined : String(local.undo)}
      attr:locale={local.locale}
      bool:require-reason={!!local.requireReason}
      on:nx-inbox-decide={(e) => local.onDecide?.(e)}
      on:nx-inbox-commit={(e) => local.onCommit?.(e)}
      on:nx-inbox-undo={(e) => local.onUndo?.(e)}
      on:nx-inbox-active={(e) => local.onActive?.(e)}
    />
  );
}

export interface SurveyProps extends Omit<JSX.HTMLAttributes<NxSurvey>, "onSubmit" | "onChange"> {
  questions: SurveyQuestionInput[];
  heading?: string;
  description?: string;
  /** Recibe `POST {answers, ms}`; puede responder con los resultados. */
  action?: string;
  /** Clave de `localStorage` para el borrador. */
  storage?: string;
  results?: SurveyResults | null;
  /** `focus`, `sheet`, `cards` o `chat`. */
  layout?: "focus" | "sheet" | "cards" | "chat";
  /** Cómo respondieron los demás, tras cada respuesta (necesita `results`). */
  echo?: boolean;
  locale?: string;
  labels?: Partial<SurveyLabels>;
  /** Cancelable: no se envía a `action`. */
  onSubmit?: (e: CustomEvent<SurveySubmitDetail>) => void;
  onChange?: (e: CustomEvent<{ id: string; value: unknown; answers: SurveyAnswers }>) => void;
}

export function Survey(props: SurveyProps): JSX.Element {
  const [local, rest] = splitProps(props, ["questions", "heading", "description", "action", "storage", "results", "layout", "echo", "locale", "labels", "onSubmit", "onChange"]);
  return (
    <nx-survey
      {...rest}
      prop:questions={local.questions}
      prop:results={local.results}
      prop:labels={local.labels}
      attr:heading={local.heading}
      attr:description={local.description}
      attr:action={local.action}
      attr:storage={local.storage}
      attr:layout={local.layout}
      bool:echo={!!local.echo}
      attr:locale={local.locale}
      on:nx-survey-submit={(e) => local.onSubmit?.(e)}
      on:nx-survey-change={(e) => local.onChange?.(e)}
    />
  );
}

export interface NumberInputProps extends Omit<JSX.HTMLAttributes<NxNumber>, "onChange" | "onInput"> {
  /** `number | null`. En `percent`, la fracción (0,19 es 19 %). */
  value?: number | null;
  format?: NumberFormat;
  /** Con `money`: ISO («COP», «USD») o un símbolo («$»). */
  currency?: string;
  decimals?: number;
  min?: number;
  max?: number;
  /** Lo que suman ↑/↓, en las unidades que se ven (puntos en `percent`). */
  step?: number;
  /** El monto en letras debajo, para cheques y documentos. */
  words?: boolean;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  placeholder?: string;
  align?: NumberAlign;
  /** Nombre accesible (si no hay un `<label>`). */
  label?: string;
  locale?: string;
  labels?: Partial<NumberLabels>;
  /** Mientras se escribe, cada vez que cambia el número (`e.currentTarget.value`). */
  onInput?: (e: Event & { currentTarget: NxNumber }) => void;
  /** Al confirmar (salir o Enter): `{value, text}`. */
  onChange?: (e: CustomEvent<NumberChangeDetail>) => void;
}

export function NumberInput(props: NumberInputProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "value",
    "format",
    "currency",
    "decimals",
    "min",
    "max",
    "step",
    "words",
    "name",
    "required",
    "disabled",
    "readonly",
    "placeholder",
    "align",
    "label",
    "locale",
    "labels",
    "onInput",
    "onChange",
  ]);
  const str = (n: number | undefined) => (n === undefined ? undefined : String(n));
  return (
    <nx-number
      {...rest}
      prop:value={local.value}
      prop:labels={local.labels}
      attr:format={local.format}
      attr:currency={local.currency}
      attr:decimals={str(local.decimals)}
      attr:min={str(local.min)}
      attr:max={str(local.max)}
      attr:step={str(local.step)}
      attr:name={local.name}
      attr:placeholder={local.placeholder}
      attr:align={local.align}
      attr:label={local.label}
      attr:locale={local.locale}
      bool:words={!!local.words}
      bool:required={!!local.required}
      bool:disabled={!!local.disabled}
      bool:readonly={!!local.readonly}
      on:input={(e) => local.onInput?.(e as unknown as Event & { currentTarget: NxNumber })}
      on:nx-change={(e) => local.onChange?.(e as unknown as CustomEvent<NumberChangeDetail>)}
    />
  );
}

export interface KanbanProps extends JSX.HTMLAttributes<NxKanban> {
  columns: KanbanColumn[];
  cards: KanbanCard[];
  heading?: string;
  /** Milisegundos para deshacer un movimiento (7000); 0 registra al instante. */
  undo?: number;
  /** Cargando: columnas con tarjetas de relleno. */
  busy?: boolean;
  locale?: string;
  labels?: Partial<KanbanLabels>;
  /** Cancelable: la tarjeta vuelve a su lugar. */
  onMove?: (e: CustomEvent<KanbanMoveDetail>) => void;
  /** Pasó el tiempo de deshacer: aquí se registra en el backend. */
  onCommit?: (e: CustomEvent<KanbanMoveDetail>) => void;
  onUndo?: (e: CustomEvent<KanbanMoveDetail>) => void;
  onAdd?: (e: CustomEvent<{ column: string }>) => void;
  /** Cancelable: no se sigue el `href` de la tarjeta. */
  onOpen?: (e: CustomEvent<{ card: KanbanCard }>) => void;
}

export function Kanban(props: KanbanProps): JSX.Element {
  const [local, rest] = splitProps(props, ["columns", "cards", "heading", "undo", "busy", "locale", "labels", "onMove", "onCommit", "onUndo", "onAdd", "onOpen"]);
  return (
    <nx-kanban
      {...rest}
      prop:columns={local.columns}
      prop:cards={local.cards}
      prop:labels={local.labels}
      attr:heading={local.heading}
      attr:undo={local.undo === undefined ? undefined : String(local.undo)}
      attr:locale={local.locale}
      bool:busy={!!local.busy}
      on:nx-kanban-move={(e) => local.onMove?.(e)}
      on:nx-kanban-commit={(e) => local.onCommit?.(e)}
      on:nx-kanban-undo={(e) => local.onUndo?.(e)}
      on:nx-kanban-add={(e) => local.onAdd?.(e)}
      on:nx-kanban-open={(e) => local.onOpen?.(e)}
    />
  );
}

export interface HistoryProps extends JSX.HTMLAttributes<NxHistory> {
  /** El registro como está hoy. */
  record?: Record<string, unknown>;
  fields?: HistoryField[];
  events?: HistoryEvent[];
  /** URL que devuelve `{events, record?, more?}` y pagina con `?before=<id>`. */
  source?: string;
  /** Quién comenta y revierte desde aquí. */
  user?: HistoryActor;
  /** Milisegundos para deshacer una reversión (7000); 0 la registra al instante. */
  undo?: number;
  heading?: string;
  locale?: string;
  labels?: Partial<HistoryLabels>;
  /** Cancelable: la reversión no se aplica. */
  onRevert?: (e: CustomEvent<HistoryRevertDetail>) => void;
  /** Pasó el tiempo de deshacer: aquí se guarda en el backend. */
  onCommit?: (e: CustomEvent<HistoryCommitDetail>) => void;
  /** Cancelable: la nota no se agrega. */
  onComment?: (e: CustomEvent<{ text: string }>) => void;
  onTravel?: (e: CustomEvent<{ id: string | null; record: Record<string, HistoryValue> }>) => void;
}

export function History(props: HistoryProps): JSX.Element {
  const [local, rest] = splitProps(props, ["record", "fields", "events", "source", "user", "undo", "heading", "locale", "labels", "onRevert", "onCommit", "onComment", "onTravel"]);
  return (
    <nx-history
      {...rest}
      prop:record={local.record}
      prop:fields={local.fields}
      prop:events={local.events}
      prop:user={local.user}
      prop:labels={local.labels}
      attr:source={local.source}
      attr:heading={local.heading}
      attr:undo={local.undo === undefined ? undefined : String(local.undo)}
      attr:locale={local.locale}
      on:nx-history-revert={(e) => local.onRevert?.(e)}
      on:nx-history-commit={(e) => local.onCommit?.(e)}
      on:nx-history-comment={(e) => local.onComment?.(e)}
      on:nx-history-travel={(e) => local.onTravel?.(e)}
    />
  );
}

export interface DateRangeProps extends Omit<JSX.HTMLAttributes<NxDateRange>, "onChange"> {
  /** `{start, end}` (ISO) o «2026-07-01/2026-09-30». Sin él, `start`/`end` o `phrase` dan el inicial. */
  value?: DateRangeValue | string | null;
  start?: string;
  end?: string;
  /** Valor inicial como frase: «este trimestre», «últimos 30 días». */
  phrase?: string;
  /** Atajos: frases o `{label, phrase | start + end}`. */
  presets?: DateRangePresetInput[];
  /** `previous`, `year` o `none` (la opción visible sin comparar). Sin él no se ofrece comparar. */
  compare?: DateRangeCompare | "none";
  min?: string;
  max?: string;
  today?: string;
  /** Mes en que empieza el año fiscal (1–12). */
  fiscalStart?: number;
  /** Primer día de la semana, 1 (lunes) … 7 (domingo). */
  weekStart?: number;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Nombre accesible del campo. */
  label?: string;
  locale?: string;
  labels?: Partial<DateRangeLabels>;
  onChange?: (e: CustomEvent<DateRangeChangeDetail>) => void;
  onOpenChange?: (e: CustomEvent<OpenChangeDetail>) => void;
}

export function DateRange(props: DateRangeProps): JSX.Element {
  const [local, rest] = splitProps(props, ["value", "start", "end", "phrase", "presets", "compare", "min", "max", "today", "fiscalStart", "weekStart", "name", "required", "disabled", "placeholder", "label", "locale", "labels", "onChange", "onOpenChange"]);
  return (
    <nx-date-range
      {...rest}
      prop:value={local.value}
      prop:presets={local.presets}
      prop:labels={local.labels}
      attr:start={local.start}
      attr:end={local.end}
      attr:phrase={local.phrase}
      attr:compare={local.compare}
      attr:min={local.min}
      attr:max={local.max}
      attr:today={local.today}
      attr:fiscal-start={local.fiscalStart === undefined ? undefined : String(local.fiscalStart)}
      attr:week-start={local.weekStart === undefined ? undefined : String(local.weekStart)}
      attr:name={local.name}
      attr:placeholder={local.placeholder}
      attr:label={local.label}
      attr:locale={local.locale}
      bool:required={!!local.required}
      bool:disabled={!!local.disabled}
      on:nx-change={(e) => local.onChange?.(e as unknown as CustomEvent<DateRangeChangeDetail>)}
      on:nx-open-change={(e) => local.onOpenChange?.(e)}
    />
  );
}

export interface PasteFillProps extends JSX.HTMLAttributes<NxPasteFill> {
  /** Enriquece los campos leídos del formulario, por `name` (p. ej. `{ name: "monto", kind: "money" }`). */
  fields?: PasteFieldInput[];
  /** Recibe `POST {text, fields}` y responde con el protocolo en streaming (opcional). */
  endpoint?: string;
  /** Confianza bajo la cual un campo queda «Revisar» (0,8). */
  reviewBelow?: number;
  /** El `id` de un formulario que está en otra parte (sin él, el que envuelve). */
  for?: string;
  locale?: string;
  labels?: Partial<PasteFillLabels>;
  /** Cancelable: no se llena nada. */
  onStart?: (e: CustomEvent<{ text: string }>) => void;
  onDone?: (e: CustomEvent<PasteFillDoneDetail>) => void;
  onUndo?: (e: CustomEvent<{ values: Record<string, string> }>) => void;
  children?: JSX.Element;
}

export function PasteFill(props: PasteFillProps): JSX.Element {
  const [local, rest] = splitProps(props, ["fields", "endpoint", "reviewBelow", "for", "locale", "labels", "onStart", "onDone", "onUndo", "children"]);
  return (
    <nx-paste-fill
      {...rest}
      prop:fields={local.fields}
      prop:labels={local.labels}
      attr:endpoint={local.endpoint}
      attr:review-below={local.reviewBelow === undefined ? undefined : String(local.reviewBelow)}
      attr:for={local.for}
      attr:locale={local.locale}
      on:nx-paste-fill-start={(e) => local.onStart?.(e)}
      on:nx-paste-fill-done={(e) => local.onDone?.(e)}
      on:nx-paste-fill-undo={(e) => local.onUndo?.(e)}
    >
      {local.children}
    </nx-paste-fill>
  );
}

export interface PresenceProps extends Omit<JSX.HTMLAttributes<NxPresence>, "onChange"> {
  /** La persona actual `{id, name, avatar?}`. Sin ella, solo escucha. */
  me?: PresenceUser | null;
  /** Canal entre pestañas del mismo navegador (`BroadcastChannel`). */
  channel?: string;
  /** URL de un `EventSource` (SSE) con los eventos de los demás. */
  source?: string;
  /** `id` del formulario cuyos campos se comparten. */
  for?: string;
  /** Milisegundos sin actividad para «inactivo» (120000). */
  idle?: number;
  /** Círculos en la pila, contando «+N» (4). */
  max?: number;
  locale?: string;
  labels?: Partial<PresenceLabels>;
  /** Quiénes están, cada vez que algo cambia. */
  onChange?: (e: CustomEvent<{ users: PresenceState[] }>) => void;
  /** Lo que hace la persona actual: aquí se manda al servidor. */
  onLocal?: (e: CustomEvent<PresenceEvent>) => void;
}

export function Presence(props: PresenceProps): JSX.Element {
  const [local, rest] = splitProps(props, ["me", "channel", "source", "for", "idle", "max", "locale", "labels", "onChange", "onLocal"]);
  return (
    <nx-presence
      {...rest}
      prop:me={local.me}
      prop:labels={local.labels}
      attr:channel={local.channel}
      attr:source={local.source}
      attr:for={local.for}
      attr:idle={local.idle === undefined ? undefined : String(local.idle)}
      attr:max={local.max === undefined ? undefined : String(local.max)}
      attr:locale={local.locale}
      on:nx-presence-change={(e) => local.onChange?.(e)}
      on:nx-presence-local={(e) => local.onLocal?.(e)}
    />
  );
}
