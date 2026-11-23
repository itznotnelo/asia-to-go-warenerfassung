import { describe, expect, it } from "vitest";
import { unitRuleIssues } from "./unit-rules";

describe("unitRuleIssues", () => {
  it("treats null (as stored in the DB and seed) like undefined", () => {
    expect(unitRuleIssues({ unitType: "piece", contentAmount: null, contentUnit: null })).toEqual([]);
    expect(unitRuleIssues({ unitType: "piece", contentAmount: 510, contentUnit: null })).toEqual([
      { path: "contentUnit", message: "Einheit fehlt zur Inhaltsmenge" },
    ]);
  });

  it("accepts a prepacked 510 g sauce as piece (the old seed had it as weight)", () => {
    expect(unitRuleIssues({ unitType: "piece", contentAmount: 510, contentUnit: "g" })).toEqual([]);
  });

  it("accepts loose rice priced per kg", () => {
    expect(unitRuleIssues({ unitType: "weight", contentAmount: 1, contentUnit: "kg" })).toEqual([]);
  });

  it("rejects a 5-pack marked as sold by weight", () => {
    expect(unitRuleIssues({ unitType: "weight", contentAmount: 5, contentUnit: "stk" })).toEqual([
      { path: "contentUnit", message: "Offen nach Gewicht braucht g oder kg" },
    ]);
  });
});
