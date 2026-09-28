/**
 * Adaptador para SolidJS: tipos JSX de las etiquetas y envoltorios (`<SideMenu>`, `<Button>`,
 * `<Select>`, `<AIAnswer>`, `<DocCapture>`, `<Grid>`, `<Dialog>`, `<Agent>`, `<Command>`, `<Explain>`,
 * `<Inbox>`, `<Survey>`, `<NumberInput>`, `<Kanban>`, `<History>`, `<DateRange>`,
 * `<PasteFill>`, `<Presence>`, `<WhatIf>`, `<Trend>`, `<Scan>`, `<Sync>`, `<Import>`,
 * `<Keytips>`, `<Guard>`, `<Handoff>`, `<Award>`, `<Account>`, `<Launcher>`, `<Cards>`, `<Print>`, `<Signature>`, `<Planner>`, `<Review>`, `<Voice>`, `<Thread>`, `<Checklist>`, `<Recurrence>`, `<Jobs>`), y `nxToast` / `nxConfirm` / `nxSync`.
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
export { nxSync } from "../components/sync/logic";
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
import "../components/what-if/index";
import type { NxWhatIf } from "../components/what-if/what-if";
import type { WhatIfChangeDetail, WhatIfComputeDetail, WhatIfInput, WhatIfLabels, WhatIfMetric, WhatIfSaveDetail, WhatIfScenario, WhatIfSeries, WhatIfValues } from "../components/what-if/types";
import "../components/trend/index";
import type { NxTrend } from "../components/trend/trend";
import type { TrendAnomaly, TrendFormat, TrendKind, TrendLabels, TrendSeries, TrendWhyDetail } from "../components/trend/types";
import "../components/scan/index";
import type { NxScan } from "../components/scan/scan";
import type { ScanCountDetail, ScanDetail, ScanItem, ScanLabels, ScanMode, ScanProblem, ScanWedge } from "../components/scan/types";
import "../components/sync/index";
import type { NxSync } from "../components/sync/sync";
import type { SyncChangeDetail, SyncField, SyncLabels, SyncOp } from "../components/sync/types";
import "../components/date-range/index";
import type { NxDateRange } from "../components/date-range/date-range";
import type { DateRangeChangeDetail, DateRangeCompare, DateRangeLabels, DateRangePresetInput, DateRangeValue } from "../components/date-range/types";
import "../components/import/index";
import type { NxImport } from "../components/import/import";
import type { ImportColumnInput, ImportDoneDetail, ImportErrorDetail, ImportLabels, ImportMappedDetail, ImportParsedDetail, ImportState } from "../components/import/types";
import "../components/keytips/index";
import type { NxKeytips } from "../components/keytips/keytips";
import type { KeytipAssignment, KeytipDetail, KeytipsLabels } from "../components/keytips/types";
import "../components/guard/index";
import type { NxGuard } from "../components/guard/guard";
import type { GuardFields, GuardFinding, GuardLabels, GuardMode } from "../components/guard/types";
import "../components/handoff/index";
import type { NxHandoff } from "../components/handoff/handoff";
import type { HandoffDoneDetail, HandoffItemDetail, HandoffKind, HandoffLabels, HandoffPhoneLabels, HandoffSide, HandoffState } from "../components/handoff/types";
import "../components/award/index";
import type { NxAward } from "../components/award/award";
import type { AwardAdviseDetail, AwardChangeDetail, AwardChoice, AwardCriterion, AwardEvent, AwardItem, AwardLabels, AwardLens, AwardQuote, AwardSubmitDetail, AwardSupplier } from "../components/award/types";
import "../components/account/index";
import type { NxAccount } from "../components/account/account";
import type { AccountItem, AccountLabels, AccountLocale, AccountLogoutDetail, AccountPalette, AccountPerson, AccountSession, AccountStatus, AccountStatusDetail, AccountSwitchDetail, AccountTenant, AccountThemeDetail, AccountUser, AccountViewAsDetail } from "../components/account/types";
import "../components/cards/index";
import type { NxCards } from "../components/cards/cards";
import type { CardsAction, CardsActionDetail, CardsField, CardsLabels, CardsLayout, CardsLevel, CardsOpenDetail, CardsRow } from "../components/cards/types";
import "../components/launcher/index";
import type { NxLauncher } from "../components/launcher/launcher";
import type { LauncherItem, LauncherLabels, LauncherProgress, LauncherSelectDetail, LauncherSignal, LauncherTone, LauncherView } from "../components/launcher/types";
import "../components/print/index";
import type { NxPrint } from "../components/print/print";
import type { PrintLabels, PrintOrientation, PrintPaginateDetail, PrintZoom } from "../components/print/types";
import "../components/signature/index";
import type { NxSignature } from "../components/signature/signature";
import type { SignatureDoneDetail, SignatureFormat, SignatureLabels, SignatureMeta, SignatureValue } from "../components/signature/types";
import "../components/planner/index";
import type { NxPlanner } from "../components/planner/planner";
import type { PlannerBooking, PlannerChangeDetail, PlannerCreateDetail, PlannerDeleteDetail, PlannerLabels, PlannerRangeDetail, PlannerResource, PlannerView } from "../components/planner/types";
import "../components/review/index";
import type { NxReview } from "../components/review/review";
import type { ReviewChange, ReviewConfirmDetail, ReviewDirtyDetail, ReviewLabels, ReviewMode, ReviewOpenDetail } from "../components/review/types";
import "../components/voice/index";
import type { NxVoice } from "../components/voice/voice";
import type { VoiceEndDetail, VoiceEngine, VoiceErrorDetail, VoiceLabels, VoiceLayout, VoiceTextDetail } from "../components/voice/types";
import "../components/thread/index";
import type { NxThread } from "../components/thread/thread";
import type { ThreadComment, ThreadErrorDetail, ThreadLabels, ThreadMentionDetail, ThreadPostDetail, ThreadRef, ThreadUser } from "../components/thread/types";
import "../components/checklist/index";
import type { NxChecklist } from "../components/checklist/checklist";
import type { ChecklistSequence } from "../components/checklist/logic";
import type { ChecklistChangeDetail, ChecklistCompleteDetail, ChecklistErrorDetail, ChecklistLabels, ChecklistMode, ChecklistOpenDetail, ChecklistPerson, ChecklistState, ChecklistStep, ChecklistSummaryItem } from "../components/checklist/types";
import "../components/recurrence/index";
import type { NxRecurrence } from "../components/recurrence/recurrence";
import type { RecurrenceChangeDetail, RecurrenceErrorDetail, RecurrenceHolidayMode, RecurrenceLabels, RecurrenceRule, RecurrenceValue, RecurrenceValueFormat } from "../components/recurrence/types";
import "../components/jobs/index";
import type { NxJobs } from "../components/jobs/jobs";
import type { Job, JobEvent, JobResult, JobSpec, JobStatus, JobsErrorDetail, JobsLabels } from "../components/jobs/types";
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
export type { NxWhatIf, WhatIfChangeDetail, WhatIfComputeDetail, WhatIfInput, WhatIfLabels, WhatIfMetric, WhatIfSaveDetail, WhatIfScenario, WhatIfSeries, WhatIfValues };
export type { NxTrend, TrendAnomaly, TrendFormat, TrendKind, TrendLabels, TrendSeries, TrendWhyDetail };
export type { NxScan, ScanCountDetail, ScanDetail, ScanItem, ScanLabels, ScanMode, ScanProblem, ScanWedge };
export type { NxSync, SyncChangeDetail, SyncField, SyncLabels, SyncOp };
export type { NxImport, ImportColumnInput, ImportDoneDetail, ImportErrorDetail, ImportLabels, ImportMappedDetail, ImportParsedDetail, ImportState };
export type { NxKeytips, KeytipAssignment, KeytipDetail, KeytipsLabels };
export type { NxGuard, GuardFields, GuardFinding, GuardLabels, GuardMode };
export type { NxAward, AwardAdviseDetail, AwardChangeDetail, AwardChoice, AwardCriterion, AwardEvent, AwardItem, AwardLabels, AwardLens, AwardQuote, AwardSubmitDetail, AwardSupplier };
export type { NxHandoff, HandoffDoneDetail, HandoffItemDetail, HandoffKind, HandoffLabels, HandoffPhoneLabels, HandoffSide, HandoffState };
export type { NxCards, CardsAction, CardsActionDetail, CardsField, CardsLabels, CardsLayout, CardsLevel, CardsOpenDetail, CardsRow };
export type { NxLauncher, LauncherItem, LauncherLabels, LauncherProgress, LauncherSelectDetail, LauncherSignal, LauncherTone, LauncherView };
export type { NxAccount, AccountItem, AccountLabels, AccountLocale, AccountLogoutDetail, AccountPalette, AccountPerson, AccountSession, AccountStatus, AccountStatusDetail, AccountSwitchDetail, AccountTenant, AccountThemeDetail, AccountUser, AccountViewAsDetail };
export type { NxPrint, PrintLabels, PrintOrientation, PrintPaginateDetail, PrintZoom };
export type { NxSignature, SignatureDoneDetail, SignatureFormat, SignatureLabels, SignatureMeta, SignatureValue };
export type { NxPlanner, PlannerBooking, PlannerChangeDetail, PlannerCreateDetail, PlannerDeleteDetail, PlannerLabels, PlannerRangeDetail, PlannerResource, PlannerView };
export type { NxReview, ReviewChange, ReviewConfirmDetail, ReviewDirtyDetail, ReviewLabels, ReviewMode, ReviewOpenDetail };
export type { NxVoice, VoiceEndDetail, VoiceEngine, VoiceErrorDetail, VoiceLabels, VoiceLayout, VoiceTextDetail };
export type { NxThread, ThreadComment, ThreadErrorDetail, ThreadLabels, ThreadMentionDetail, ThreadPostDetail, ThreadRef, ThreadUser };
export type { NxChecklist, ChecklistChangeDetail, ChecklistCompleteDetail, ChecklistErrorDetail, ChecklistLabels, ChecklistMode, ChecklistOpenDetail, ChecklistPerson, ChecklistState, ChecklistStep, ChecklistSummaryItem };
export type { NxRecurrence, RecurrenceChangeDetail, RecurrenceErrorDetail, RecurrenceHolidayMode, RecurrenceLabels, RecurrenceRule, RecurrenceValue, RecurrenceValueFormat };
export type { NxJobs, Job, JobEvent, JobResult, JobSpec, JobStatus, JobsErrorDetail, JobsLabels };
export type { NxSurvey, SurveyAnswers, SurveyLabels, SurveyQuestionInput, SurveyResults, SurveySubmitDetail };

type GridFilterDetail = { filters: GridFilter[]; sort: GridSort | null; groupBy: string; count: number };

declare module "solid-js" {
  namespace JSX {
    interface ExplicitProperties {
      steps: ChecklistStep[] | undefined;
      state: ChecklistState | undefined;
      sequential: ChecklistSequence | undefined;
      anchors: string[] | undefined;
      refPatterns: string[] | undefined;
      comments: ThreadComment[] | undefined;
      initial: Record<string, unknown> | null | undefined;
      resources: PlannerResource[] | undefined;
      bookings: PlannerBooking[] | undefined;
      workdays: number[] | undefined;
      holidays: string[] | undefined;
      query: string | undefined;
      layout: CardsLayout | null | undefined;
      actions: CardsAction[] | undefined;
      suppliers: AwardSupplier[] | undefined;
      quotes: AwardQuote[] | undefined;
      criteria: AwardCriterion[] | undefined;
      advice: AwardEvent[] | undefined;
      choices: AwardChoice[] | undefined;
      excluded: string[] | undefined;
      reasons: string[] | undefined;
      formats: string[] | undefined;
      anomalies: TrendAnomaly[] | undefined;
      values: WhatIfValues | undefined;
      scenarios: WhatIfScenario[] | undefined;
      series: WhatIfSeries[] | TrendSeries[] | undefined;
      outputs: WhatIfMetric[] | undefined;
      inputs: WhatIfInput[] | undefined;
      me: PresenceUser | ChecklistPerson | null | undefined;
      items: MenuItem[] | CommandItem[] | InboxItem[] | ScanItem[] | AwardItem[] | AccountItem[] | LauncherItem[] | ChecklistSummaryItem[] | undefined;
      labels: Partial<SidemenuLabels> | Partial<ButtonLabels> | Partial<SelectLabels> | Partial<AiLabels> | Partial<CaptureLabels> | Partial<GridLabels> | Partial<DialogLabels> | Partial<AgentLabels> | Partial<CommandLabels> | Partial<ExplainLabels> | Partial<InboxLabels> | Partial<SurveyLabels> | Partial<NumberLabels> | Partial<KanbanLabels> | Partial<HistoryLabels> | Partial<DateRangeLabels> | Partial<PasteFillLabels> | Partial<PresenceLabels> | Partial<WhatIfLabels> | Partial<TrendLabels> | Partial<ScanLabels> | Partial<SyncLabels> | Partial<ImportLabels> | Partial<KeytipsLabels> | Partial<GuardLabels> | Partial<HandoffLabels & HandoffPhoneLabels> | Partial<AwardLabels> | Partial<AccountLabels> | Partial<LauncherLabels> | Partial<CardsLabels> | Partial<PrintLabels> | Partial<SignatureLabels> | Partial<PlannerLabels> | Partial<ReviewLabels> | Partial<VoiceLabels> | Partial<ThreadLabels> | Partial<ChecklistLabels> | Partial<RecurrenceLabels> | Partial<JobsLabels> | undefined;
      schema: CaptureSchemaItem[] | undefined;
      suggestions: string[] | undefined;
      context: unknown;
      progress: number | null | undefined;
      options: SelectOption[];
      fields: SelectField[] | HistoryField[] | PasteFieldInput[] | SyncField[] | GuardFields | CardsField[] | undefined;
      record: Record<string, unknown> | undefined;
      events: HistoryEvent[] | undefined;
      user: HistoryActor | AccountUser | null | undefined;
      tenants: AccountTenant[] | undefined;
      palettes: (string | AccountPalette)[] | undefined;
      locales: AccountLocale[] | undefined;
      session: AccountSession | null | undefined;
      viewAs: AccountPerson | null | undefined;
      value: string | string[] | number | DateRangeValue | SignatureValue | null | undefined;
      presets: DateRangePresetInput[] | undefined;
      selection: SelectOption[] | undefined;
      columns: GridColumn[] | KanbanColumn[] | ImportColumnInput[];
      cards: KanbanCard[] | undefined;
      rows: GridRow[] | CardsRow[] | undefined;
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
      recent: string | undefined;
      "holidays-mode": "add" | "replace" | undefined;
      count: string | undefined;
      record: string | undefined;
      poll: string | undefined;
      presence: string | undefined;
      "people-source": string | undefined;
      "refs-source": string | undefined;
      engine: VoiceEngine | undefined;
      "max-seconds": string | undefined;
      silence: string | undefined;
      commands: "false" | undefined;
      threshold: string | undefined;
      "max-silent": string | undefined;
      empty: "notice" | undefined;
      rebase: "false" | undefined;
      view: PlannerView | undefined;
      date: string | undefined;
      snap: string | undefined;
      hours: string | undefined;
      summary: string | undefined;
      document: string | undefined;
      handoff: string | undefined;
      "value-format": SignatureFormat | RecurrenceValueFormat | undefined;
      "pen-color": string | undefined;
      orientation: PrintOrientation | undefined;
      margin: string | undefined;
      zoom: string | undefined;
      toolbar: "false" | undefined;
      level: CardsLevel | undefined;
      group: string | undefined;
      sort: string | undefined;
      columns: string | undefined;
      "heading-level": string | undefined;
      scenario: string | undefined;
      lens: AwardLens | undefined;
      side: HandoffSide | undefined;
      session: string | undefined;
      token: string | undefined;
      scope: string | undefined;
      key: string | undefined;
      batch: string | undefined;
      accept: string | undefined;
      "max-size": string | undefined;
      memory: string | undefined;
      ping: string | undefined;
      wedge: ScanWedge | undefined;
      "explain-endpoint": string | undefined;
      detect: string | undefined;
      kind: TrendKind | HandoffKind | undefined;
      debounce: string | undefined;
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
      mode: DialogMode | ScanMode | GuardMode | ReviewMode | ChecklistMode | undefined;
      size: DialogSize | string | undefined;
      url: string | undefined;
      hold: string | undefined;
      for: string | undefined;
      menu: string | undefined;
      account: string | undefined;
      current: string | undefined;
      status: AccountStatus | undefined;
      "apply-locale": string | undefined;
      "expires-at": string | undefined;
      "warn-before": string | undefined;
      "view-as-source": string | undefined;
      "lock-endpoint": string | undefined;
      "lock-after": string | undefined;
      "logout-url": string | undefined;
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
      notify: boolean;
      always: boolean;
      hold: boolean;
      "ask-name": boolean;
      "ask-id": boolean;
      geo: boolean;
      auto: boolean;
      search: boolean;
      lock: boolean;
      autostart: boolean;
      muted: boolean;
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
      "require-review": boolean;
      echo: boolean;
      words: boolean;
      readonly: boolean;
    }
    interface CustomEvents {
      "nx-jobs-change": CustomEvent<{ jobs: Job[] }>;
      "nx-jobs-done": CustomEvent<{ job: Job }>;
      "nx-jobs-error": CustomEvent<JobsErrorDetail>;
      "nx-recurrence-error": CustomEvent<RecurrenceErrorDetail>;
      "nx-checklist-change": CustomEvent<ChecklistChangeDetail>;
      "nx-checklist-complete": CustomEvent<ChecklistCompleteDetail>;
      "nx-checklist-open": CustomEvent<ChecklistOpenDetail>;
      "nx-checklist-error": CustomEvent<ChecklistErrorDetail>;
      "nx-thread-post": CustomEvent<ThreadPostDetail>;
      "nx-thread-change": CustomEvent<{ comments: ThreadComment[] }>;
      "nx-thread-mention": CustomEvent<ThreadMentionDetail>;
      "nx-thread-error": CustomEvent<ThreadErrorDetail>;
      "nx-voice-start": CustomEvent<Record<string, never>>;
      "nx-voice-partial": CustomEvent<{ text: string }>;
      "nx-voice-text": CustomEvent<VoiceTextDetail>;
      "nx-voice-end": CustomEvent<VoiceEndDetail>;
      "nx-voice-error": CustomEvent<VoiceErrorDetail>;
      "nx-voice-unavailable": CustomEvent<Record<string, never>>;
      "nx-review-open": CustomEvent<ReviewOpenDetail>;
      "nx-review-confirm": CustomEvent<ReviewConfirmDetail>;
      "nx-review-cancel": CustomEvent<{ changes: ReviewChange[] }>;
      "nx-review-dirty": CustomEvent<ReviewDirtyDetail>;
      "nx-planner-change": CustomEvent<PlannerChangeDetail>;
      "nx-planner-create": CustomEvent<PlannerCreateDetail>;
      "nx-planner-delete": CustomEvent<PlannerDeleteDetail>;
      "nx-planner-select": CustomEvent<{ booking: PlannerBooking }>;
      "nx-planner-range": CustomEvent<PlannerRangeDetail>;
      "nx-signature-change": CustomEvent<{ empty: boolean }>;
      "nx-signature-done": CustomEvent<SignatureDoneDetail>;
      "nx-print-paginate": CustomEvent<PrintPaginateDetail>;
      "nx-print-before": CustomEvent<PrintPaginateDetail>;
      "nx-print-after": CustomEvent<PrintPaginateDetail>;
      "nx-launcher-select": CustomEvent<LauncherSelectDetail>;
      "nx-cards-open": CustomEvent<CardsOpenDetail>;
      "nx-cards-action": CustomEvent<CardsActionDetail>;
      "nx-cards-level": CustomEvent<{ level: CardsLevel }>;
      "nx-award-advise": CustomEvent<AwardAdviseDetail>;
      "nx-award-change": CustomEvent<AwardChangeDetail>;
      "nx-award-submit": CustomEvent<AwardSubmitDetail>;
      "nx-account-switch": CustomEvent<AccountSwitchDetail>;
      "nx-account-status": CustomEvent<AccountStatusDetail>;
      "nx-account-theme": CustomEvent<AccountThemeDetail>;
      "nx-account-locale": CustomEvent<{ locale: string }>;
      "nx-account-select": CustomEvent<{ id: string }>;
      "nx-account-view-as": CustomEvent<AccountViewAsDetail>;
      "nx-account-extend": CustomEvent<{ session: AccountSession | null }>;
      "nx-account-expired": CustomEvent<{ expiresAt: number | null }>;
      "nx-account-logout": CustomEvent<AccountLogoutDetail>;
      "nx-handoff-state": CustomEvent<{ state: HandoffState }>;
      "nx-handoff-item": CustomEvent<HandoffItemDetail>;
      "nx-handoff-done": CustomEvent<HandoffDoneDetail>;
      "nx-handoff-error": CustomEvent<{ message: string }>;
      "nx-guard-warn": CustomEvent<{ field: string; finding: GuardFinding }>;
      "nx-guard-fix": CustomEvent<{ field: string; from: number | string | null; to: number | string }>;
      "nx-guard-ack": CustomEvent<{ field: string; value: number | string | null }>;
      "nx-guard-block": CustomEvent<{ findings: GuardFinding[] }>;
      "nx-keytip": CustomEvent<KeytipDetail>;
      "nx-import-parsed": CustomEvent<ImportParsedDetail>;
      "nx-import-mapped": CustomEvent<ImportMappedDetail>;
      "nx-import-done": CustomEvent<ImportDoneDetail>;
      "nx-import-error": CustomEvent<ImportErrorDetail>;
      "nx-sync-done": CustomEvent<{ op: SyncOp; data: unknown }>;
      "nx-sync-change": CustomEvent<SyncChangeDetail>;
      "nx-sync-auth": CustomEvent<{ op: SyncOp }>;
      "nx-scan-error": CustomEvent<{ problem: ScanProblem }>;
      "nx-scan-count": CustomEvent<ScanCountDetail>;
      "nx-scan": CustomEvent<ScanDetail>;
      "nx-trend-toggle": CustomEvent<{ id: string; visible: boolean }>;
      "nx-trend-why": CustomEvent<TrendWhyDetail>;
      "nx-what-if-change": CustomEvent<WhatIfChangeDetail>;
      "nx-what-if-save": CustomEvent<WhatIfSaveDetail>;
      "nx-what-if-compute": CustomEvent<WhatIfComputeDetail>;
      "nx-presence-local": CustomEvent<PresenceEvent>;
      "nx-presence-change": CustomEvent<{ users: PresenceState[] }>;
      "nx-select": CustomEvent<SelectDetail>;
      "nx-toggle": CustomEvent<ToggleDetail>;
      "nx-open-change": CustomEvent<OpenChangeDetail>;
      "nx-done": CustomEvent<DoneDetail>;
      "nx-change": CustomEvent<SelectChangeDetail | DateRangeChangeDetail | RecurrenceChangeDetail>;
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
      "nx-jobs": HTMLAttributes<NxJobs>;
      "nx-recurrence": HTMLAttributes<NxRecurrence>;
      "nx-checklist": HTMLAttributes<NxChecklist>;
      "nx-thread": HTMLAttributes<NxThread>;
      "nx-voice": HTMLAttributes<NxVoice>;
      "nx-review": HTMLAttributes<NxReview>;
      "nx-planner": HTMLAttributes<NxPlanner>;
      "nx-signature": HTMLAttributes<NxSignature>;
      "nx-print": HTMLAttributes<NxPrint> & { heading?: string };
      "nx-award": HTMLAttributes<NxAward> & { heading?: string; endpoint?: string };
      "nx-account": HTMLAttributes<NxAccount>;
      "nx-launcher": HTMLAttributes<NxLauncher>;
      "nx-cards": HTMLAttributes<NxCards>;
      "nx-handoff": HTMLAttributes<NxHandoff> & { endpoint?: string; for?: string };
      "nx-guard": HTMLAttributes<NxGuard> & { endpoint?: string };
      "nx-import": HTMLAttributes<NxImport> & { endpoint?: string };
      "nx-keytips": HTMLAttributes<NxKeytips>;
      "nx-sync": HTMLAttributes<NxSync> & { ping?: string };
      "nx-scan": HTMLAttributes<NxScan> & { source?: string };
      "nx-trend": HTMLAttributes<NxTrend> & { heading?: string };
      "nx-what-if": HTMLAttributes<NxWhatIf> & { heading?: string; endpoint?: string };
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
  locale?: string;
  labels?: Partial<SurveyLabels>;
  /** Cancelable: no se envía a `action`. */
  onSubmit?: (e: CustomEvent<SurveySubmitDetail>) => void;
  onChange?: (e: CustomEvent<{ id: string; value: unknown; answers: SurveyAnswers }>) => void;
}

export function Survey(props: SurveyProps): JSX.Element {
  const [local, rest] = splitProps(props, ["questions", "heading", "description", "action", "storage", "results", "locale", "labels", "onSubmit", "onChange"]);
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

export interface WhatIfProps extends Omit<JSX.HTMLAttributes<NxWhatIf>, "onChange"> {
  /** Los supuestos: `value` es la base; en `percent`, la fracción. */
  inputs: WhatIfInput[];
  /** Las métricas (`better: "up" | "down"` colorea la diferencia). */
  outputs?: WhatIfMetric[];
  /** Series del gráfico de líneas (base punteada vs. escenario). */
  series?: WhatIfSeries[];
  /** Los escenarios guardados; la app los persiste con `onSave`. */
  scenarios?: WhatIfScenario[];
  /** Los supuestos de ahora (para cargar un escenario desde fuera). */
  values?: WhatIfValues;
  /** `POST {inputs}` → NDJSON. Sin él, `onCompute`. */
  endpoint?: string;
  /** Espera en ms entre el último cambio y el cálculo (250). */
  debounce?: number;
  heading?: string;
  locale?: string;
  labels?: Partial<WhatIfLabels>;
  /** Sin `endpoint`: calcula `e.detail.inputs` y llama `e.detail.respond(events)` (o `preventDefault()` y responde después). */
  onCompute?: (e: CustomEvent<WhatIfComputeDetail>) => void;
  /** Cancelable: guardar, renombrar o borrar; `e.detail.scenarios` es la lista nueva. */
  onSave?: (e: CustomEvent<WhatIfSaveDetail>) => void;
  onChange?: (e: CustomEvent<WhatIfChangeDetail>) => void;
}

export function WhatIf(props: WhatIfProps): JSX.Element {
  const [local, rest] = splitProps(props, ["inputs", "outputs", "series", "scenarios", "values", "endpoint", "debounce", "heading", "locale", "labels", "onCompute", "onSave", "onChange"]);
  return (
    <nx-what-if
      {...rest}
      prop:inputs={local.inputs}
      prop:outputs={local.outputs}
      prop:series={local.series}
      prop:scenarios={local.scenarios}
      prop:values={local.values}
      prop:labels={local.labels}
      attr:endpoint={local.endpoint}
      attr:debounce={local.debounce === undefined ? undefined : String(local.debounce)}
      attr:heading={local.heading}
      attr:locale={local.locale}
      on:nx-what-if-compute={(e) => local.onCompute?.(e)}
      on:nx-what-if-save={(e) => local.onSave?.(e)}
      on:nx-what-if-change={(e) => local.onChange?.(e)}
    />
  );
}

export interface TrendProps extends Omit<JSX.HTMLAttributes<NxTrend>, "onToggle"> {
  /** `{id, label, points: {x, y}[], format?, currency?, kind?, muted?, hidden?}`. */
  series: TrendSeries[];
  /** `{series, x, label?}`: anillo que late y etiqueta corta. */
  anomalies?: TrendAnomaly[];
  heading?: string;
  /** Por defecto de las series: `line` (por defecto) o `bar`. */
  kind?: TrendKind;
  format?: TrendFormat;
  /** Con `money`: ISO («COP») o un símbolo. */
  currency?: string;
  /** Alto en px, con el eje x (260). */
  height?: number;
  /** Detección automática: `true` (3 desviaciones robustas) o un número. */
  detect?: boolean | number;
  /** Protocolo de IA que contesta «¿por qué?» (POST `{question, context}`). */
  explainEndpoint?: string;
  busy?: boolean;
  locale?: string;
  labels?: Partial<TrendLabels>;
  /** Clic o Enter en un punto (cancelable: no se abre el popover). */
  onWhy?: (e: CustomEvent<TrendWhyDetail>) => void;
  /** La leyenda mostró u ocultó una serie. */
  onToggle?: (e: CustomEvent<{ id: string; visible: boolean }>) => void;
}

export function Trend(props: TrendProps): JSX.Element {
  const [local, rest] = splitProps(props, ["series", "anomalies", "heading", "kind", "format", "currency", "height", "detect", "explainEndpoint", "busy", "locale", "labels", "onWhy", "onToggle"]);
  return (
    <nx-trend
      {...rest}
      prop:series={local.series}
      prop:anomalies={local.anomalies}
      prop:labels={local.labels}
      attr:heading={local.heading}
      attr:kind={local.kind}
      attr:format={local.format}
      attr:currency={local.currency}
      attr:height={local.height === undefined ? undefined : String(local.height)}
      attr:detect={local.detect === true ? "" : local.detect ? String(local.detect) : undefined}
      attr:explain-endpoint={local.explainEndpoint}
      attr:locale={local.locale}
      bool:busy={!!local.busy}
      on:nx-trend-why={(e) => local.onWhy?.(e)}
      on:nx-trend-toggle={(e) => local.onToggle?.(e)}
    />
  );
}

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
  onScan?: (e: CustomEvent<ScanDetail>) => void;
  /** La lista después de cada cambio: `{items}`. */
  onCount?: (e: CustomEvent<ScanCountDetail>) => void;
  /** Sin cámara: `{problem}`. */
  onError?: (e: CustomEvent<{ problem: ScanProblem }>) => void;
}

export function Scan(props: ScanProps): JSX.Element {
  const [local, rest] = splitProps(props, ["mode", "formats", "source", "items", "muted", "autostart", "wedge", "locale", "labels", "onScan", "onCount", "onError"]);
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
      on:nx-scan={(e) => local.onScan?.(e)}
      on:nx-scan-count={(e) => local.onCount?.(e)}
      on:nx-scan-error={(e) => local.onError?.(e)}
    />
  );
}

export interface SyncProps extends Omit<JSX.HTMLAttributes<NxSync>, "onChange"> {
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
}

export function Sync(props: SyncProps): JSX.Element {
  const [local, rest] = splitProps(props, ["ping", "fields", "locale", "labels", "onChange", "onDone", "onAuth"]);
  return (
    <nx-sync
      {...rest}
      prop:fields={local.fields}
      prop:labels={local.labels}
      attr:ping={local.ping}
      attr:locale={local.locale}
      on:nx-sync-change={(e) => local.onChange?.(e)}
      on:nx-sync-done={(e) => local.onDone?.(e)}
      on:nx-sync-auth={(e) => local.onAuth?.(e)}
    />
  );
}

export interface ImportProps extends Omit<JSX.HTMLAttributes<NxImport>, "onError"> {
  /** Los campos de destino: `{key, label, type?, required?, unique?, options?, aliases?, min?, max?, pattern?, hint?}`. */
  columns: ImportColumnInput[];
  /** Recibe `POST {rows, offset}` por lotes y puede responder `{errors: [{row, field?, message}]}`. Sin él, solo `onDone`. */
  endpoint?: string;
  /** Filas por lote (500). */
  batch?: number;
  accept?: string;
  /** Tamaño máximo del archivo: bytes o «20MB» (por defecto 20 MB). */
  maxSize?: number | string;
  /** Clave para recordar el mapeo (sin ella, el `id`). */
  memory?: string;
  locale?: string;
  labels?: Partial<ImportLabels>;
  disabled?: boolean;
  onParsed?: (e: CustomEvent<ImportParsedDetail>) => void;
  onMapped?: (e: CustomEvent<ImportMappedDetail>) => void;
  /** `{rows, skipped, mapping, fixed, headers}`: las filas ya normalizadas. */
  onDone?: (e: CustomEvent<ImportDoneDetail>) => void;
  onError?: (e: CustomEvent<ImportErrorDetail>) => void;
}

export function Import(props: ImportProps): JSX.Element {
  const [local, rest] = splitProps(props, ["columns", "endpoint", "batch", "accept", "maxSize", "memory", "locale", "labels", "disabled", "onParsed", "onMapped", "onDone", "onError"]);
  return (
    <nx-import
      {...rest}
      prop:columns={local.columns}
      prop:labels={local.labels}
      attr:endpoint={local.endpoint}
      attr:batch={local.batch === undefined ? undefined : String(local.batch)}
      attr:accept={local.accept}
      attr:max-size={local.maxSize === undefined ? undefined : String(local.maxSize)}
      attr:memory={local.memory}
      attr:locale={local.locale}
      bool:disabled={!!local.disabled}
      on:nx-import-parsed={(e) => local.onParsed?.(e)}
      on:nx-import-mapped={(e) => local.onMapped?.(e)}
      on:nx-import-done={(e) => local.onDone?.(e)}
      on:nx-import-error={(e) => local.onError?.(e)}
    />
  );
}

export interface KeytipsProps extends JSX.HTMLAttributes<NxKeytips> {
  /** Selector de la región con atajos (por defecto, toda la página). */
  scope?: string;
  /** La tecla que los muestra: `Alt` (por defecto), `Control`, `Shift` o `Meta`; `none`: solo con `show()`. */
  trigger?: string;
  disabled?: boolean;
  labels?: Partial<KeytipsLabels>;
  /** Antes de ejecutar una acción: `{key, target, name}`. Cancelable. */
  onKeytip?: (e: CustomEvent<KeytipDetail>) => void;
  onOpenChange?: (e: CustomEvent<OpenChangeDetail>) => void;
}

/** `<nx-keytips>`: la tecla va como `trigger` (en JSX, `key` es de otros). */
export function Keytips(props: KeytipsProps): JSX.Element {
  const [local, rest] = splitProps(props, ["scope", "trigger", "disabled", "labels", "onKeytip", "onOpenChange"]);
  return (
    <nx-keytips
      {...rest}
      prop:labels={local.labels}
      attr:scope={local.scope}
      attr:key={local.trigger}
      bool:disabled={!!local.disabled}
      on:nx-keytip={(e) => local.onKeytip?.(e)}
      on:nx-open-change={(e) => local.onOpenChange?.(e)}
    />
  );
}

export interface GuardProps extends JSX.HTMLAttributes<NxGuard> {
  /** La configuración por `name`: `{precio: {history: [...], format: "money", currency: "COP"}}`. */
  fields?: GuardFields;
  /** `warn` (por defecto: nunca bloquea) o `confirm` (el primer envío con avisos se detiene). */
  mode?: GuardMode;
  /** Recibe `POST {field, value, values}` y responde `{findings: [...]}` (opcional). */
  endpoint?: string;
  locale?: string;
  labels?: Partial<GuardLabels>;
  disabled?: boolean;
  onWarn?: (e: CustomEvent<{ field: string; finding: GuardFinding }>) => void;
  onFix?: (e: CustomEvent<{ field: string; from: number | string | null; to: number | string }>) => void;
  onAck?: (e: CustomEvent<{ field: string; value: number | string | null }>) => void;
  /** Cancelable: cancelarlo deja pasar el envío. */
  onBlock?: (e: CustomEvent<{ findings: GuardFinding[] }>) => void;
  children?: JSX.Element;
}

export function Guard(props: GuardProps): JSX.Element {
  const [local, rest] = splitProps(props, ["fields", "mode", "endpoint", "locale", "labels", "disabled", "onWarn", "onFix", "onAck", "onBlock", "children"]);
  return (
    <nx-guard
      {...rest}
      prop:fields={local.fields}
      prop:labels={local.labels}
      attr:mode={local.mode}
      attr:endpoint={local.endpoint}
      attr:locale={local.locale}
      bool:disabled={!!local.disabled}
      on:nx-guard-warn={(e) => local.onWarn?.(e)}
      on:nx-guard-fix={(e) => local.onFix?.(e)}
      on:nx-guard-ack={(e) => local.onAck?.(e)}
      on:nx-guard-block={(e) => local.onBlock?.(e)}
    >
      {local.children}
    </nx-guard>
  );
}

export interface HandoffProps extends Omit<JSX.HTMLAttributes<NxHandoff>, "onError"> {
  /** `desktop` (por defecto): botón, QR y escucha. `phone`: la página que abre el QR. */
  side?: HandoffSide;
  /** Base de las rutas de la sesión (`/api/handoff`). Mismo origen o uno de `allowOrigins()`. */
  endpoint: string;
  /** `id` del elemento que recibe: `<nx-doc-capture>`, `<nx-scan>`, `<input type=file>` o un campo de texto. */
  for?: string;
  /** `photo` (por defecto), `file` o `scan`. */
  kind?: HandoffKind;
  accept?: string;
  multiple?: boolean;
  /** Viaja al servidor al crear la sesión (`{ doc: "OC-2291" }`). */
  context?: unknown;
  /** Lado celular: si no vienen, se leen de `?s=` y `?t=`. */
  session?: string;
  token?: string;
  disabled?: boolean;
  locale?: string;
  labels?: Partial<HandoffLabels & HandoffPhoneLabels>;
  onState?: (e: CustomEvent<{ state: HandoffState }>) => void;
  /** Cancelable: con `preventDefault()` no se entrega al destino (la app se encarga). */
  onItem?: (e: CustomEvent<HandoffItemDetail>) => void;
  onDone?: (e: CustomEvent<HandoffDoneDetail>) => void;
  onError?: (e: CustomEvent<{ message: string }>) => void;
}

export function Handoff(props: HandoffProps): JSX.Element {
  const [local, rest] = splitProps(props, ["side", "endpoint", "for", "kind", "accept", "multiple", "context", "session", "token", "disabled", "locale", "labels", "onState", "onItem", "onDone", "onError"]);
  return (
    <nx-handoff
      {...rest}
      prop:context={local.context}
      prop:labels={local.labels}
      attr:side={local.side}
      attr:endpoint={local.endpoint}
      attr:for={local.for}
      attr:kind={local.kind}
      attr:accept={local.accept}
      attr:session={local.session}
      attr:token={local.token}
      attr:locale={local.locale}
      bool:multiple={!!local.multiple}
      bool:disabled={!!local.disabled}
      on:nx-handoff-state={(e) => local.onState?.(e)}
      on:nx-handoff-item={(e) => local.onItem?.(e)}
      on:nx-handoff-done={(e) => local.onDone?.(e)}
      on:nx-handoff-error={(e) => local.onError?.(e)}
    />
  );
}

export interface AwardProps extends Omit<JSX.HTMLAttributes<NxAward>, "onChange" | "onSubmit"> {
  /** Los proveedores `{id, name, detail?, alert?}`, en el orden de las columnas. */
  suppliers: AwardSupplier[];
  /** Los artículos `{id, name, qty, unit?, code?, group?}`. */
  items: AwardItem[];
  /** Las cotizaciones `{item, supplier, price, leadTime?, original?, note?}`; `price` es el unitario comparable. */
  quotes: AwardQuote[];
  /** `{id, label, weight}`: la leyenda del puntaje y los deslizadores de «Criterios». */
  criteria?: AwardCriterion[];
  /** Sin `endpoint`: la recomendación como eventos del protocolo. */
  advice?: AwardEvent[];
  /** Lo que el comprador ya eligió a mano (un borrador guardado). */
  choices?: AwardChoice[];
  excluded?: string[];
  /** Los motivos que se sugieren al apartarse de la IA. */
  reasons?: string[];
  scenario?: string;
  /** Lo que muestran las celdas: `price` (por defecto), `total`, `lead` o `score`. */
  lens?: AwardLens;
  /** `POST {weights, excluded}` → NDJSON. Sin él, `onAdvise`. */
  endpoint?: string;
  heading?: string;
  /** Moneda de los precios: ISO («COP») o un símbolo. */
  currency?: string;
  readonly?: boolean;
  requireReason?: boolean;
  requireReview?: boolean;
  locale?: string;
  labels?: Partial<AwardLabels>;
  /** Sin `endpoint`: recomienda con `e.detail.weights` y `e.detail.excluded` y llama `e.detail.respond(events)` (o `preventDefault()` y responde después). */
  onAdvise?: (e: CustomEvent<AwardAdviseDetail>) => void;
  onChange?: (e: CustomEvent<AwardChangeDetail>) => void;
  /** Las órdenes por proveedor, con los cambios frente a la IA y su motivo. */
  onSubmit?: (e: CustomEvent<AwardSubmitDetail>) => void;
}

export function Award(props: AwardProps): JSX.Element {
  const [local, rest] = splitProps(props, ["suppliers", "items", "quotes", "criteria", "advice", "choices", "excluded", "reasons", "scenario", "lens", "endpoint", "heading", "currency", "readonly", "requireReason", "requireReview", "locale", "labels", "onAdvise", "onChange", "onSubmit"]);
  return (
    <nx-award
      {...rest}
      prop:suppliers={local.suppliers}
      prop:items={local.items}
      prop:quotes={local.quotes}
      prop:criteria={local.criteria}
      prop:advice={local.advice}
      prop:choices={local.choices}
      prop:excluded={local.excluded}
      prop:reasons={local.reasons}
      prop:labels={local.labels}
      attr:scenario={local.scenario}
      attr:lens={local.lens}
      attr:endpoint={local.endpoint}
      attr:heading={local.heading}
      attr:currency={local.currency}
      attr:locale={local.locale}
      bool:readonly={!!local.readonly}
      bool:require-reason={!!local.requireReason}
      bool:require-review={!!local.requireReview}
      on:nx-award-advise={(e) => local.onAdvise?.(e)}
      on:nx-award-change={(e) => local.onChange?.(e)}
      on:nx-award-submit={(e) => local.onSubmit?.(e)}
    />
  );
}

export interface AccountProps extends Omit<JSX.HTMLAttributes<NxAccount>, "onSelect"> {
  user: AccountUser;
  tenants?: AccountTenant[];
  current?: string;
  status?: AccountStatus;
  items?: AccountItem[];
  palettes?: (string | AccountPalette)[];
  locales?: AccountLocale[];
  storage?: string;
  applyLocale?: boolean;
  session?: AccountSession | null;
  warnBefore?: number;
  viewAs?: AccountPerson | null;
  viewAsSource?: string;
  lock?: boolean;
  lockEndpoint?: string;
  lockAfter?: number;
  logoutUrl?: string;
  labels?: Partial<AccountLabels>;
  locale?: string;
  disabled?: boolean;
  onSwitch?: (e: CustomEvent<AccountSwitchDetail>) => void;
  onStatus?: (e: CustomEvent<AccountStatusDetail>) => void;
  onTheme?: (e: CustomEvent<AccountThemeDetail>) => void;
  onLocale?: (e: CustomEvent<{ locale: string }>) => void;
  onSelect?: (e: CustomEvent<{ id: string }>) => void;
  onViewAs?: (e: CustomEvent<AccountViewAsDetail>) => void;
  onExtend?: (e: CustomEvent<{ session: AccountSession | null }>) => void;
  onExpired?: (e: CustomEvent<{ expiresAt: number | null }>) => void;
  onLogout?: (e: CustomEvent<AccountLogoutDetail>) => void;
}

export function Account(props: AccountProps): JSX.Element {
  const [local, rest] = splitProps(props, ["user", "tenants", "current", "status", "items", "palettes", "locales", "storage", "applyLocale", "session", "warnBefore", "viewAs", "viewAsSource", "lock", "lockEndpoint", "lockAfter", "logoutUrl", "labels", "locale", "disabled", "onSwitch", "onStatus", "onTheme", "onLocale", "onSelect", "onViewAs", "onExtend", "onExpired", "onLogout"]);
  return (
    <nx-account
      {...rest}
      prop:user={local.user}
      prop:tenants={local.tenants}
      prop:items={local.items}
      prop:palettes={local.palettes}
      prop:locales={local.locales}
      prop:session={local.session}
      prop:viewAs={local.viewAs}
      prop:labels={local.labels}
      attr:current={local.current}
      attr:status={local.status}
      attr:storage={local.storage}
      attr:apply-locale={local.applyLocale === false ? "false" : undefined}
      attr:warn-before={local.warnBefore === undefined ? undefined : String(local.warnBefore)}
      attr:view-as-source={local.viewAsSource}
      attr:lock-endpoint={local.lockEndpoint}
      attr:lock-after={local.lockAfter === undefined ? undefined : String(local.lockAfter)}
      attr:logout-url={local.logoutUrl}
      attr:locale={local.locale}
      bool:lock={!!local.lock}
      bool:disabled={!!local.disabled}
      on:nx-account-switch={(e) => local.onSwitch?.(e)}
      on:nx-account-status={(e) => local.onStatus?.(e)}
      on:nx-account-theme={(e) => local.onTheme?.(e)}
      on:nx-account-locale={(e) => local.onLocale?.(e)}
      on:nx-account-select={(e) => local.onSelect?.(e)}
      on:nx-account-view-as={(e) => local.onViewAs?.(e)}
      on:nx-account-extend={(e) => local.onExtend?.(e)}
      on:nx-account-expired={(e) => local.onExpired?.(e)}
      on:nx-account-logout={(e) => local.onLogout?.(e)}
    />
  );
}

export interface LauncherProps extends Omit<JSX.HTMLAttributes<NxLauncher>, "onSelect"> {
  /** Las tarjetas `{id, label, href?, icon?, description?, section?, views?, signal?, featured?, eyebrow?, progress?}`. */
  items: LauncherItem[];
  /** Muestra el buscador «Ir a» (lo que no coincide se apaga en su sitio; `Enter` abre la primera). */
  search?: boolean;
  /** Lo escrito en el buscador (también filtra sin él). */
  query?: string;
  /** Máximo de columnas (4 por defecto). */
  columns?: number;
  /** Nivel de los títulos de sección (2 por defecto). */
  headingLevel?: number;
  locale?: string;
  labels?: Partial<LauncherLabels>;
  /** Una tarjeta o una vista elegida. Cancelable: `preventDefault()` y la app navega (p. ej. dentro de `startViewTransition`). */
  onSelect?: (e: CustomEvent<LauncherSelectDetail>) => void;
}

export function Launcher(props: LauncherProps): JSX.Element {
  const [local, rest] = splitProps(props, ["items", "search", "query", "columns", "headingLevel", "locale", "labels", "onSelect"]);
  return (
    <nx-launcher
      {...rest}
      prop:items={local.items}
      prop:query={local.query}
      prop:labels={local.labels}
      attr:columns={local.columns === undefined ? undefined : String(local.columns)}
      attr:heading-level={local.headingLevel === undefined ? undefined : String(local.headingLevel)}
      attr:locale={local.locale}
      bool:search={!!local.search}
      on:nx-launcher-select={(e) => local.onSelect?.(e)}
    />
  );
}

export interface CardsProps extends JSX.HTMLAttributes<NxCards> {
  /** Los campos `{key, label, type?, currency?, unit?, options?, sort?, group?, search?, good?, bad?}`. */
  fields: CardsField[];
  /** Dónde va cada campo: `{title, subtitle?, status?, note?, value?, delta?, trend?, weight?, brief?, facts?, related?, href?}`. */
  layout: CardsLayout;
  rows: CardsRow[];
  /** Botones de la tarjeta abierta → `onAction`. */
  actions?: CardsAction[];
  /** `map`, `cards` (por defecto) o `detail`. */
  level?: CardsLevel;
  group?: string;
  /** `campo` o `campo:asc` / `campo:desc`. */
  sort?: string;
  rowKey?: string;
  query?: string;
  locale?: string;
  labels?: Partial<CardsLabels>;
  onOpen?: (e: CustomEvent<CardsOpenDetail>) => void;
  onAction?: (e: CustomEvent<CardsActionDetail>) => void;
  onLevel?: (e: CustomEvent<{ level: CardsLevel }>) => void;
}

export function Cards(props: CardsProps): JSX.Element {
  const [local, rest] = splitProps(props, ["fields", "layout", "rows", "actions", "level", "group", "sort", "rowKey", "query", "locale", "labels", "onOpen", "onAction", "onLevel"]);
  return (
    <nx-cards
      {...rest}
      prop:fields={local.fields}
      prop:layout={local.layout}
      prop:rows={local.rows}
      prop:actions={local.actions}
      prop:query={local.query}
      prop:labels={local.labels}
      attr:level={local.level}
      attr:group={local.group}
      attr:sort={local.sort}
      attr:row-key={local.rowKey}
      attr:locale={local.locale}
      on:nx-cards-open={(e) => local.onOpen?.(e)}
      on:nx-cards-action={(e) => local.onAction?.(e)}
      on:nx-cards-level={(e) => local.onLevel?.(e)}
    />
  );
}

export interface PrintProps extends JSX.HTMLAttributes<NxPrint> {
  /** `letter` (por defecto), `a4`, `a5`, `legal`, `oficio`, `half-letter` o «216mm 140mm». */
  size?: string;
  orientation?: PrintOrientation;
  /** Uno a cuatro valores, como en CSS (12 mm). */
  margin?: string;
  /** Título del documento: el nombre sugerido del PDF. */
  heading?: string;
  currency?: string;
  /** `"fit"` (por defecto) o un factor (1 = tamaño real). */
  zoom?: PrintZoom;
  locale?: string;
  labels?: Partial<PrintLabels>;
  toolbar?: boolean;
  onPaginate?: (e: CustomEvent<PrintPaginateDetail>) => void;
  onBeforePrint?: (e: CustomEvent<PrintPaginateDetail>) => void;
  onAfterPrint?: (e: CustomEvent<PrintPaginateDetail>) => void;
  children?: JSX.Element;
}

export function Print(props: PrintProps): JSX.Element {
  const [local, rest] = splitProps(props, ["size", "orientation", "margin", "heading", "currency", "zoom", "locale", "labels", "toolbar", "onPaginate", "onBeforePrint", "onAfterPrint", "children"]);
  return (
    <nx-print
      {...rest}
      prop:labels={local.labels}
      attr:size={local.size}
      attr:orientation={local.orientation}
      attr:margin={local.margin}
      attr:heading={local.heading}
      attr:currency={local.currency}
      attr:zoom={local.zoom === undefined ? undefined : String(local.zoom)}
      attr:locale={local.locale}
      attr:toolbar={local.toolbar === false ? "false" : undefined}
      on:nx-print-paginate={(e) => local.onPaginate?.(e)}
      on:nx-print-before={(e) => local.onBeforePrint?.(e)}
      on:nx-print-after={(e) => local.onAfterPrint?.(e)}
    >
      {local.children}
    </nx-print>
  );
}

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

export interface PlannerProps extends Omit<JSX.HTMLAttributes<NxPlanner>, "onChange" | "onSelect"> {
  resources: PlannerResource[];
  bookings?: PlannerBooking[];
  view?: PlannerView;
  /** El día a la vista (ISO). Controlable: cambiarlo lleva la vista a ese período. */
  date?: string;
  /** Minutos de la rejilla (15 en día, 30 en semana; en mes, un día). */
  snap?: number;
  /** Horario laboral: "07:00-18:00". */
  hours?: string;
  workdays?: number[];
  holidays?: string[];
  /** Fila de ocupación; un texto nombra lo que se cuenta («equipos»). */
  summary?: boolean | string;
  source?: string;
  endpoint?: string;
  readonly?: boolean;
  locale?: string;
  labels?: Partial<PlannerLabels>;
  /** Cancelable: vuelve a su lugar (con `e.detail.message` como motivo del aviso). */
  onChange?: (e: CustomEvent<PlannerChangeDetail>) => void;
  /** Cancelable: la reserva provisional se quita sin aviso (la app abre su formulario con el rango). */
  onCreate?: (e: CustomEvent<PlannerCreateDetail>) => void;
  onDelete?: (e: CustomEvent<PlannerDeleteDetail>) => void;
  onSelect?: (e: CustomEvent<{ booking: PlannerBooking }>) => void;
  onRange?: (e: CustomEvent<PlannerRangeDetail>) => void;
}

export function Planner(props: PlannerProps): JSX.Element {
  const [local, rest] = splitProps(props, ["resources", "bookings", "view", "date", "snap", "hours", "workdays", "holidays", "summary", "source", "endpoint", "readonly", "locale", "labels", "onChange", "onCreate", "onDelete", "onSelect", "onRange"]);
  return (
    <nx-planner
      {...rest}
      prop:resources={local.resources}
      prop:bookings={local.bookings}
      prop:workdays={local.workdays}
      prop:holidays={local.holidays}
      prop:labels={local.labels}
      attr:view={local.view}
      attr:date={local.date}
      attr:snap={local.snap === undefined ? undefined : String(local.snap)}
      attr:hours={local.hours}
      attr:summary={local.summary === true ? "" : local.summary || undefined}
      attr:source={local.source}
      attr:endpoint={local.endpoint}
      attr:locale={local.locale}
      bool:readonly={!!local.readonly}
      on:nx-planner-change={(e) => local.onChange?.(e)}
      on:nx-planner-create={(e) => local.onCreate?.(e)}
      on:nx-planner-delete={(e) => local.onDelete?.(e)}
      on:nx-planner-select={(e) => local.onSelect?.(e)}
      on:nx-planner-range={(e) => local.onRange?.(e)}
    />
  );
}

export interface ReviewProps extends Omit<JSX.HTMLAttributes<NxReview>, "onCancel"> {
  /** `significant` (por defecto), `always` o `never` (solo con `review()`). */
  mode?: ReviewMode;
  /** Desde qué porcentaje un monto es importante (20). */
  threshold?: number;
  /** Más de cuántos cambios se muestra aunque nada sea importante (5). */
  maxSilent?: number;
  /** `notice`: al enviar sin cambios, «No hay cambios que guardar» y no envía. */
  empty?: "notice";
  /** La base: el registro como se cargó (`{campo: valor}`, filas anidadas o planas). */
  initial?: Record<string, unknown> | null;
  /** `false`: después de guardar, la base no cambia. */
  rebase?: boolean;
  locale?: string;
  labels?: Partial<ReviewLabels>;
  disabled?: boolean;
  /** Cancelable: cancelarlo envía directo. */
  onOpen?: (e: CustomEvent<ReviewOpenDetail>) => void;
  onConfirm?: (e: CustomEvent<ReviewConfirmDetail>) => void;
  onCancel?: (e: CustomEvent<{ changes: ReviewChange[] }>) => void;
  onDirty?: (e: CustomEvent<ReviewDirtyDetail>) => void;
  children?: JSX.Element;
}

export function Review(props: ReviewProps): JSX.Element {
  const [local, rest] = splitProps(props, ["mode", "threshold", "maxSilent", "empty", "initial", "rebase", "locale", "labels", "disabled", "onOpen", "onConfirm", "onCancel", "onDirty", "children"]);
  return (
    <nx-review
      {...rest}
      prop:initial={local.initial}
      prop:labels={local.labels}
      attr:mode={local.mode}
      attr:threshold={local.threshold === undefined ? undefined : String(local.threshold)}
      attr:max-silent={local.maxSilent === undefined ? undefined : String(local.maxSilent)}
      attr:empty={local.empty}
      attr:rebase={local.rebase === false ? "false" : undefined}
      attr:locale={local.locale}
      bool:disabled={!!local.disabled}
      on:nx-review-open={(e) => local.onOpen?.(e)}
      on:nx-review-confirm={(e) => local.onConfirm?.(e)}
      on:nx-review-cancel={(e) => local.onCancel?.(e)}
      on:nx-review-dirty={(e) => local.onDirty?.(e)}
    >
      {local.children}
    </nx-review>
  );
}

export interface VoiceProps extends Omit<JSX.HTMLAttributes<NxVoice>, "onError"> {
  /** El `id` de un `<nx-paste-fill>`, un `<input>` o un `<textarea>` que recibe lo dictado. */
  for?: string;
  /** Recibe `POST` con el audio (`FormData`: `audio`, `lang`) y responde el texto. */
  endpoint?: string;
  /** `auto` (por defecto), `browser` o `server`. */
  engine?: VoiceEngine;
  /** Mantener para hablar (el botón o la barra espaciadora). */
  hold?: boolean;
  /** Atajo de página, p. ej. «Alt+V». */
  hotkey?: string;
  /** Tope de una toma, en segundos (30). */
  maxSeconds?: number;
  /** Silencio que termina una toma, en ms (2000). */
  silence?: number;
  /** `false` apaga «borrar eso» y «borra la última palabra». */
  commands?: boolean;
  layout?: VoiceLayout;
  locale?: string;
  labels?: Partial<VoiceLabels>;
  disabled?: boolean;
  onStart?: (e: CustomEvent<Record<string, never>>) => void;
  onPartial?: (e: CustomEvent<{ text: string }>) => void;
  /** Cancelable: no se entrega a `for`. */
  onText?: (e: CustomEvent<VoiceTextDetail>) => void;
  onEnd?: (e: CustomEvent<VoiceEndDetail>) => void;
  onError?: (e: CustomEvent<VoiceErrorDetail>) => void;
  onUnavailable?: (e: CustomEvent<Record<string, never>>) => void;
}

export function Voice(props: VoiceProps): JSX.Element {
  const [local, rest] = splitProps(props, ["for", "endpoint", "engine", "hold", "hotkey", "maxSeconds", "silence", "commands", "layout", "locale", "labels", "disabled", "onStart", "onPartial", "onText", "onEnd", "onError", "onUnavailable"]);
  return (
    <nx-voice
      {...rest}
      prop:labels={local.labels}
      attr:for={local.for}
      attr:endpoint={local.endpoint}
      attr:engine={local.engine}
      attr:hotkey={local.hotkey}
      attr:max-seconds={local.maxSeconds === undefined ? undefined : String(local.maxSeconds)}
      attr:silence={local.silence === undefined ? undefined : String(local.silence)}
      attr:commands={local.commands === false ? "false" : undefined}
      attr:layout={local.layout}
      attr:locale={local.locale}
      bool:hold={!!local.hold}
      bool:disabled={!!local.disabled}
      on:nx-voice-start={(e) => local.onStart?.(e)}
      on:nx-voice-partial={(e) => local.onPartial?.(e)}
      on:nx-voice-text={(e) => local.onText?.(e)}
      on:nx-voice-end={(e) => local.onEnd?.(e)}
      on:nx-voice-error={(e) => local.onError?.(e)}
      on:nx-voice-unavailable={(e) => local.onUnavailable?.(e)}
    />
  );
}

export interface ThreadProps extends Omit<JSX.HTMLAttributes<NxThread>, "onChange" | "onError"> {
  /** El registro («OC-2291»): de él cuelgan los comentarios, el borrador y lo leído. */
  record: string;
  /** `GET ?record=`, `POST`, `PATCH /{id}`, `DELETE /{id}`. Sin él, todo es local (`comments`). */
  endpoint?: string;
  /** SSE o NDJSON con los cambios en vivo. */
  stream?: string;
  /** Sin `stream`: segundos entre consultas (30; `0` no sondea). */
  poll?: number;
  peopleSource?: string;
  refsSource?: string;
  refPatterns?: string[];
  /** Quien escribe desde aquí. Sin él, solo se lee. */
  me?: ThreadUser | null;
  anchors?: string[];
  /** `id` del `<nx-presence>` del que se lee quién está viendo. */
  presence?: string;
  comments?: ThreadComment[];
  readonly?: boolean;
  disabled?: boolean;
  locale?: string;
  labels?: Partial<ThreadLabels>;
  onPost?: (e: CustomEvent<ThreadPostDetail>) => void;
  onChange?: (e: CustomEvent<{ comments: ThreadComment[] }>) => void;
  onMention?: (e: CustomEvent<ThreadMentionDetail>) => void;
  onError?: (e: CustomEvent<ThreadErrorDetail>) => void;
}

export function Thread(props: ThreadProps): JSX.Element {
  const [local, rest] = splitProps(props, ["record", "endpoint", "stream", "poll", "peopleSource", "refsSource", "refPatterns", "me", "anchors", "presence", "comments", "readonly", "disabled", "locale", "labels", "onPost", "onChange", "onMention", "onError"]);
  return (
    <nx-thread
      {...rest}
      prop:me={local.me}
      prop:anchors={local.anchors}
      prop:refPatterns={local.refPatterns}
      prop:comments={local.comments}
      prop:labels={local.labels}
      attr:record={local.record}
      attr:endpoint={local.endpoint}
      attr:stream={local.stream}
      attr:poll={local.poll === undefined ? undefined : String(local.poll)}
      attr:people-source={local.peopleSource}
      attr:refs-source={local.refsSource}
      attr:presence={local.presence}
      attr:locale={local.locale}
      bool:readonly={!!local.readonly}
      bool:disabled={!!local.disabled}
      on:nx-thread-post={(e) => local.onPost?.(e)}
      on:nx-thread-change={(e) => local.onChange?.(e)}
      on:nx-thread-mention={(e) => local.onMention?.(e)}
      on:nx-thread-error={(e) => local.onError?.(e)}
    />
  );
}

export interface ChecklistProps extends Omit<JSX.HTMLAttributes<NxChecklist>, "onChange" | "onError"> {
  /** Los pasos: `{id, title, hint?, section?, assignee?, due?, required?, evidence?, dependsOn?, canSkip?}`. */
  steps?: ChecklistStep[];
  /** El estado por `id`. Sin él (y con `endpoint`), `GET {endpoint}`. */
  state?: ChecklistState;
  endpoint?: string;
  /** Quien usa la pantalla: el «por» de cada paso. */
  me?: ChecklistPerson | null;
  /** `true`: todo en orden; una lista: solo esas secciones. */
  sequential?: boolean | string[];
  /** La base de `<nx-handoff>`: «Tomar con el celular» en las fotos. */
  handoff?: string;
  mode?: ChecklistMode;
  items?: ChecklistSummaryItem[];
  heading?: string;
  readonly?: boolean;
  disabled?: boolean;
  locale?: string;
  labels?: Partial<ChecklistLabels>;
  onChange?: (e: CustomEvent<ChecklistChangeDetail>) => void;
  /** Cancelable: cancelarlo no cierra el procedimiento. */
  onComplete?: (e: CustomEvent<ChecklistCompleteDetail>) => void;
  /** `mode="summary"`, cancelable (cancelarlo no sigue el `href`). */
  onOpen?: (e: CustomEvent<ChecklistOpenDetail>) => void;
  onError?: (e: CustomEvent<ChecklistErrorDetail>) => void;
}

export function Checklist(props: ChecklistProps): JSX.Element {
  const [local, rest] = splitProps(props, ["steps", "state", "endpoint", "me", "sequential", "handoff", "mode", "items", "heading", "readonly", "disabled", "locale", "labels", "onChange", "onComplete", "onOpen", "onError"]);
  return (
    <nx-checklist
      {...rest}
      prop:steps={local.steps}
      prop:state={local.state}
      prop:me={local.me}
      prop:items={local.items}
      prop:labels={local.labels}
      prop:sequential={local.sequential}
      attr:endpoint={local.endpoint}
      attr:handoff={local.handoff}
      attr:mode={local.mode}
      attr:heading={local.heading}
      attr:locale={local.locale}
      bool:readonly={!!local.readonly}
      bool:disabled={!!local.disabled}
      on:nx-checklist-change={(e) => local.onChange?.(e)}
      on:nx-checklist-complete={(e) => local.onComplete?.(e)}
      on:nx-checklist-open={(e) => local.onOpen?.(e)}
      on:nx-checklist-error={(e) => local.onError?.(e)}
    />
  );
}

export interface RecurrenceProps extends Omit<JSX.HTMLAttributes<NxRecurrence>, "onChange" | "onError"> {
  /** Una frase («los lunes a las 8») o una RRULE. */
  value?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  /** Desde cuándo (ISO); por defecto hoy. */
  start?: string;
  /** Festivos propios (ISO), sumados a los de Colombia o en su lugar. */
  holidays?: string[];
  holidaysMode?: "add" | "replace";
  /** Cuántas próximas fechas mostrar (5). */
  count?: number;
  valueFormat?: RecurrenceValueFormat;
  label?: string;
  locale?: string;
  labels?: Partial<RecurrenceLabels>;
  /** Al confirmar lo escrito o cambiar un control: `{value, rrule, text, next}`. */
  onChange?: (e: CustomEvent<RecurrenceChangeDetail>) => void;
  onError?: (e: CustomEvent<RecurrenceErrorDetail>) => void;
}

export function Recurrence(props: RecurrenceProps): JSX.Element {
  const [local, rest] = splitProps(props, ["value", "name", "required", "disabled", "readonly", "start", "holidays", "holidaysMode", "count", "valueFormat", "label", "locale", "labels", "onChange", "onError"]);
  return (
    <nx-recurrence
      {...rest}
      prop:value={local.value}
      prop:holidays={local.holidays}
      prop:labels={local.labels}
      attr:name={local.name}
      attr:start={local.start}
      attr:holidays-mode={local.holidaysMode}
      attr:count={local.count === undefined ? undefined : String(local.count)}
      attr:value-format={local.valueFormat}
      attr:label={local.label}
      attr:locale={local.locale}
      bool:required={!!local.required}
      bool:disabled={!!local.disabled}
      bool:readonly={!!local.readonly}
      on:nx-change={(e) => local.onChange?.(e as unknown as CustomEvent<RecurrenceChangeDetail>)}
      on:nx-recurrence-error={(e) => local.onError?.(e)}
    />
  );
}

export interface JobsProps extends Omit<JSX.HTMLAttributes<NxJobs>, "onChange" | "onError"> {
  /** Lista (`?active=1`), lanzar (`POST`), cada trabajo (`/{id}`), `/{id}/cancel`, `/{id}/retry`. */
  endpoint: string;
  /** SSE o NDJSON con los eventos de todos los trabajos. Sin él, sondeo. */
  stream?: string;
  /** Segundos entre consultas sin stream (3). */
  poll?: number;
  /** Notificación del sistema al terminar con la pestaña oculta (pide permiso al lanzar). */
  notify?: boolean;
  /** La píldora (tenue) también sin trabajos. */
  always?: boolean;
  /** Cuántos terminados quedan en «Recientes» (10). */
  recent?: number;
  locale?: string;
  labels?: Partial<JobsLabels>;
  disabled?: boolean;
  onChange?: (e: CustomEvent<{ jobs: Job[] }>) => void;
  onDone?: (e: CustomEvent<{ job: Job }>) => void;
  onError?: (e: CustomEvent<JobsErrorDetail>) => void;
  onOpenChange?: (e: CustomEvent<{ open: boolean }>) => void;
}

export function Jobs(props: JobsProps): JSX.Element {
  const [local, rest] = splitProps(props, ["endpoint", "stream", "poll", "notify", "always", "recent", "locale", "labels", "disabled", "onChange", "onDone", "onError", "onOpenChange"]);
  return (
    <nx-jobs
      {...rest}
      prop:labels={local.labels}
      attr:endpoint={local.endpoint}
      attr:stream={local.stream}
      attr:poll={local.poll === undefined ? undefined : String(local.poll)}
      attr:recent={local.recent === undefined ? undefined : String(local.recent)}
      attr:locale={local.locale}
      bool:notify={!!local.notify}
      bool:always={!!local.always}
      bool:disabled={!!local.disabled}
      on:nx-jobs-change={(e) => local.onChange?.(e)}
      on:nx-jobs-done={(e) => local.onDone?.(e)}
      on:nx-jobs-error={(e) => local.onError?.(e)}
      on:nx-open-change={(e) => local.onOpenChange?.(e as CustomEvent<{ open: boolean }>)}
    />
  );
}
