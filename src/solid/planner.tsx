/** `<Planner>` para SolidJS: envuelve `<nx-planner>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/planner/index";
import type { NxPlanner } from "../components/planner/planner";
import type { PlannerBooking, PlannerChangeDetail, PlannerCreateDetail, PlannerDeleteDetail, PlannerLabels, PlannerRangeDetail, PlannerResource, PlannerView } from "../components/planner/types";

export type { NxPlanner, PlannerBooking, PlannerChangeDetail, PlannerCreateDetail, PlannerDeleteDetail, PlannerLabels, PlannerRangeDetail, PlannerResource, PlannerView };

export interface PlannerProps extends Omit<JSX.HTMLAttributes<NxPlanner>, "onChange" | "onSelect" | "children"> {
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
  /** Sin hijos: el componente pinta todo su contenido. */
  children?: never;
}

export function Planner(props: PlannerProps): JSX.Element {
  const [local, rest] = splitProps(props, ["resources", "bookings", "view", "date", "snap", "hours", "workdays", "holidays", "summary", "source", "endpoint", "readonly", "locale", "labels", "onChange", "onCreate", "onDelete", "onSelect", "onRange", "children"]);
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
      on:nx-planner-change={(e) => e.target === e.currentTarget && local.onChange?.(e)}
      on:nx-planner-create={(e) => e.target === e.currentTarget && local.onCreate?.(e)}
      on:nx-planner-delete={(e) => e.target === e.currentTarget && local.onDelete?.(e)}
      on:nx-planner-select={(e) => e.target === e.currentTarget && local.onSelect?.(e)}
      on:nx-planner-range={(e) => e.target === e.currentTarget && local.onRange?.(e)}
    />
  );
}
