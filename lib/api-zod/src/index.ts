export * from "./generated/api";
export { SaveWholeBookingBody } from "./generated/api";
export * from "./generated/types";

// The `*Body` request schemas are generated BOTH as zod values (in
// `./generated/api`) and as TS interfaces of the same name (in
// `./generated/types`). Star-exporting both makes those names ambiguous
// (TS2308), so explicitly re-export the zod values here — the only form any
// consumer uses (runtime validation in api-server). An explicit named export
// overrides the wildcard exports for these names and resolves the ambiguity.
export {
  SetFlightDiscountBody,
  SetPageLayoutBody,
  CreateAgentBody,
  CreateAgencyGroupBody,
  CreateAgencyGroupRuleBody,
  CreateBookingBody,
  CreateFlightBody,
  CreatePassengerBody,
  CreatePaymentBody,
  RefundPaymentBody,
  ToggleFlightSalesBody,
  UpdateAgentBody,
  UpdateAgencyGroupBody,
  UpdateAgencyGroupRuleBody,
  UpdateBookingBody,
  UpdateFlightBody,
  UpdatePassengerBody,
  UpdatePaymentBody,
} from "./generated/api";
