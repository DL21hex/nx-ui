import { define } from "../../core/define";
import { NxOrg } from "./org";

define("nx-org", NxOrg);

export { NxOrg, ORG_LABELS } from "./org";
export { buildIndex as buildOrgIndex, chainOf, commonBoss, groupByTitle, squarify, topWithRest } from "./logic";
export type { OrgContact, OrgFocusDetail, OrgLabels, OrgMetric, OrgPage, OrgPerson, OrgRequest, OrgUnit, OrgView } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-org": NxOrg;
  }
  interface HTMLElementEventMap {
    "nx-org-focus": CustomEvent<import("./types").OrgFocusDetail>;
  }
}
