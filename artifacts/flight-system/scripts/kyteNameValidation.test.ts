import { strict as assert } from "node:assert";
import { kytePassengerName } from "../src/pages/kyte-booking-name-validation";

for (const value of ["John", "Anne-Marie", "O'Neil", "John DOE", "J. Doe"]) {
  assert.equal(kytePassengerName.safeParse(value).success, true, `${value} should be accepted`);
}
for (const value of ["Ëlira", "Façade", "Müller", "José", "John2", "---", ""]) {
  assert.equal(kytePassengerName.safeParse(value).success, false, `${value} should be rejected`);
}
console.log("Kyte passenger names accept A-Z and reject non-ASCII letters");