import { describe, expect, it } from "vitest";
import { evaluateExamScore } from "../../src/shared/scoring";

describe("year-configured exam scoring", () => {
  it("does not make a pass judgment before official maximum points are configured", () => {
    const result = evaluateExamScore(
      { legal: 0, basicKnowledge: 0, total: 0 },
      {
        legal: { maxPoints: null, thresholdRatio: 0.5 },
        basicKnowledge: { maxPoints: null, thresholdRatio: 0.4 },
        total: { maxPoints: null, thresholdRatio: 0.6 },
      },
    );
    expect(result.determinable).toBe(false);
    expect(result.allCriteriaPassed).toBeNull();
  });

  it("requires every configured ratio criterion to pass", () => {
    const rules = {
      legal: { maxPoints: 200, thresholdRatio: 0.5 },
      basicKnowledge: { maxPoints: 50, thresholdRatio: 0.4 },
      total: { maxPoints: 250, thresholdRatio: 0.6 },
    };
    expect(evaluateExamScore({ legal: 100, basicKnowledge: 20, total: 150 }, rules).allCriteriaPassed).toBe(true);
    expect(evaluateExamScore({ legal: 99, basicKnowledge: 30, total: 180 }, rules).allCriteriaPassed).toBe(false);
  });
});
