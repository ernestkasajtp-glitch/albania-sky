import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SuspectFlightRecheck } from "./SuspectFlightRecheck";
const render = (outcome: "found" | "missing" | "error" | "empty", missingChecks = 0) =>
  renderToStaticMarkup(<SuspectFlightRecheck state={{ outcome, missingChecks, checkedAt: "2026-10-04T10:00:00Z" }} />);
assert.match(render("found"), /U gjet përsëri në Google/);
assert.match(render("found"), /bg-green-100/);
assert.match(render("missing", 3), /Mungon në 3 kontrolle Google/);
assert.doesNotMatch(render("missing", 4), /Mundësi anulimi|bg-red-100/);
assert.match(render("missing", 5), /Mundësi anulimi/);
assert.match(render("missing", 5), /bg-red-100/);
assert.doesNotMatch(render("error", 5), /Mundësi anulimi/);
assert.doesNotMatch(render("empty", 5), /Mundësi anulimi/);
assert.match(render("error"), /Kontrolli dështoi/);
assert.match(render("empty"), /Pa rezultat të besueshëm/);
assert.match(render("found"), /12:00/);
assert.match(renderToStaticMarkup(<SuspectFlightRecheck />), /në pritje të rikontrollit/);
console.log("PASS: recheck badge states, threshold, timestamp in Europe/Tirane, waiting state.");