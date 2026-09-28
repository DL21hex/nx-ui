import { define } from "../../core/define";
import { NxCards } from "./cards";

define("nx-cards", NxCards);

export { NxCards, CARDS_LABELS } from "./cards";
export { formatField as formatCardsField, groupRows as groupCards, matchRow as matchCard, sortRows as sortCards, stepLevel, weightRanks } from "./logic";
export type { CardsAction, CardsActionDetail, CardsField, CardsFieldType, CardsLabels, CardsLayout, CardsLevel, CardsOpenDetail, CardsOption, CardsRelated, CardsRow, CardsTone } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-cards": NxCards;
  }
  interface HTMLElementEventMap {
    "nx-cards-open": CustomEvent<import("./types").CardsOpenDetail>;
    "nx-cards-action": CustomEvent<import("./types").CardsActionDetail>;
    "nx-cards-level": CustomEvent<{ level: import("./types").CardsLevel }>;
  }
}
