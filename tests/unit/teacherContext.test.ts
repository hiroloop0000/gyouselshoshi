import { describe, expect, it } from "vitest";
import { buildAnswerTutorPrompt } from "../../src/client/teacherContext";

describe("answer tutor context", () => {
  it("carries the question, learner answer, model answer and explanation to AI teacher", () => {
    const prompt = buildAnswerTutorPrompt({
      stem: "行政処分の理由提示について40字程度で記述しなさい。",
      userAnswer: "処分と同時に理由を示す。",
      modelAnswer: "行政庁は拒否処分と同時に、その理由を申請者へ提示する。",
      explanation: "理由提示は不服申立ての便宜と恣意抑制のために必要である。",
      judgmentPoint: "時期と相手方を落とさない。",
    });
    expect(prompt).toContain("【問題文】行政処分の理由提示");
    expect(prompt).toContain("【自分の回答】処分と同時に理由を示す。");
    expect(prompt).toContain("【解答例】行政庁は拒否処分と同時に");
    expect(prompt).toContain("【解説】理由提示は不服申立ての便宜");
    expect(prompt).toContain("【判断ポイント】時期と相手方");
  });

  it("omits empty sections and respects the AI endpoint length limit", () => {
    const prompt = buildAnswerTutorPrompt({ stem: "取消訴訟".repeat(400) });
    expect(prompt).toHaveLength(1000);
    expect(prompt).not.toContain("【自分の回答】");
  });
});
