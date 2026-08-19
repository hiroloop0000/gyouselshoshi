import { describe, expect, it } from "vitest";
import {
  buildMission,
  calculateMastery,
  calculateQuestionProgress,
  calculateReadiness,
  calculateReviewPriority,
  canActivateUser,
  classifyErrorDna,
  getAiGuardState,
  nextReviewIntervalDays,
  scoreWritingAnswer,
  validateInvitationSnapshot,
} from "../../src/shared/learning";

describe("review priority", () => {
  const weights = { importance: 1.2, forgetting: 1.4, misunderstanding: 1.6, confusion: 1.3, urgency: 1.1 };

  it("prioritizes a high-confidence misunderstanding near the exam", () => {
    const urgent = calculateReviewPriority(
      { importance: 1, forgettingRisk: 0.9, misunderstandingDepth: 1, confusionScore: 0.8, daysUntilExam: 14 },
      weights,
    );
    const stable = calculateReviewPriority(
      { importance: 0.5, forgettingRisk: 0.2, misunderstandingDepth: 0.1, confusionScore: 0.1, daysUntilExam: 180 },
      weights,
    );
    expect(urgent).toBeGreaterThan(stable);
    expect(urgent).toBeLessThanOrEqual(100);
  });

  it("returns zero if all weights are disabled", () => {
    expect(
      calculateReviewPriority(
        { importance: 1, forgettingRisk: 1, misunderstandingDepth: 1, confusionScore: 1, daysUntilExam: 1 },
        { importance: 0, forgetting: 0, misunderstanding: 0, confusion: 0, urgency: 0 },
      ),
    ).toBe(0);
  });
});

describe("error DNA and review interval", () => {
  const base = {
    isCorrect: false,
    confidence: "EXPLAIN" as const,
    elapsedRatio: 0.8,
    hintUsed: false,
    priorCorrect: 3,
    priorIncorrect: 0,
    transferAccuracy: 0.3,
    reverseLectureScore: 0.2,
    comparisonAccuracy: 0.3,
  };

  it("flags confident mistakes as emergencies", () => {
    expect(classifyErrorDna(base)).toEqual(expect.arrayContaining(["HIGH_CONFIDENCE_ERROR", "APPLICATION_ERROR", "CONFUSION"]));
    expect(nextReviewIntervalDays(base)).toBe(1);
  });

  it("does not classify correct answers as errors", () => {
    expect(classifyErrorDna({ ...base, isCorrect: true })).toEqual([]);
  });
});

describe("mastery and readiness", () => {
  it("keeps readiness conservative until enough verified evidence exists", () => {
    const metrics = calculateMastery({
      verifiedAccuracy: 1,
      spacedAccuracy: 1,
      noHintAccuracy: 1,
      comparisonAccuracy: 1,
      transferAccuracy: 1,
      writingScore: 1,
      explanationScore: 1,
      timedAccuracy: 1,
      verifiedAttempts: 3,
    });
    expect(calculateReadiness(metrics)).toBe(25);
  });

  it("can reach full mastery with sufficient diverse evidence", () => {
    const metrics = calculateMastery({
      verifiedAccuracy: 1,
      spacedAccuracy: 1,
      noHintAccuracy: 1,
      comparisonAccuracy: 1,
      transferAccuracy: 1,
      writingScore: 1,
      explanationScore: 1,
      timedAccuracy: 1,
      verifiedAttempts: 12,
    });
    expect(calculateReadiness(metrics)).toBe(100);
  });
});

describe("40-character writing scorer", () => {
  const rubric = {
    groups: [["拒否処分", "拒否"], ["同時"], ["理由"], ["示さ", "提示"]],
    minimumRatio: 0.7,
    minLength: 20,
    maxLength: 60,
  };

  it("passes an answer that contains the required legal elements in range", () => {
    const result = scoreWritingAnswer("行政庁は拒否処分と同時に、その理由を申請者へ提示しなければならない。", rubric);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.lengthOk).toBe(true);
  });

  it("rejects an answer that is too short even when it contains keywords", () => {
    const result = scoreWritingAnswer("拒否と同時に理由提示", rubric);
    expect(result.passed).toBe(false);
    expect(result.lengthOk).toBe(false);
  });
});

describe("invitation and user limits", () => {
  it("accepts only active, unexpired invitations with uses left", () => {
    const now = new Date("2026-08-18T00:00:00Z");
    expect(validateInvitationSnapshot({ active: true, usedCount: 0, maxUses: 1, expiresAt: "2026-08-19T00:00:00Z", now })).toBe(true);
    expect(validateInvitationSnapshot({ active: true, usedCount: 1, maxUses: 1, expiresAt: null, now })).toBe(false);
    expect(validateInvitationSnapshot({ active: true, usedCount: 0, maxUses: 1, expiresAt: "2026-08-17T00:00:00Z", now })).toBe(false);
  });

  it("enforces the active-user cap", () => {
    expect(canActivateUser(99, 100)).toBe(true);
    expect(canActivateUser(100, 100)).toBe(false);
  });
});

describe("AI cost guard and mission", () => {
  it("changes guard states at 80, 90 and 100 percent", () => {
    expect(getAiGuardState(79, 100)).toBe("NORMAL");
    expect(getAiGuardState(80, 100)).toBe("CACHE_FIRST");
    expect(getAiGuardState(90, 100)).toBe("LIMITED");
    expect(getAiGuardState(100, 100)).toBe("STOP_GENERATION");
  });

  it("creates a short comeback mission after two missed days", () => {
    const mission = buildMission({ availableMinutes: 30, daysSinceStudy: 3, dueReviews: 8, highConfidenceErrors: 2, weakTopic: "行政法", writingDue: true });
    expect(mission.comebackMode).toBe(true);
    expect(mission.estimatedMinutes).toBeLessThanOrEqual(8);
    expect(mission.items.length).toBeGreaterThan(0);
  });

  it("reports unique question-bank completion without exceeding the total", () => {
    expect(calculateQuestionProgress(4010, 123)).toEqual({
      totalQuestions: 4010,
      answeredQuestions: 123,
      remainingQuestions: 3887,
      completionRate: 3.1,
    });
    expect(calculateQuestionProgress(10, 14)).toMatchObject({ answeredQuestions: 10, remainingQuestions: 0, completionRate: 100 });
    expect(calculateQuestionProgress(0, 0).completionRate).toBe(0);
  });
});
