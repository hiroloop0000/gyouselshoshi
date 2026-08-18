import type { Confidence, ErrorDnaCode, MasteryMetrics, MissionItem } from "./types";

export interface ReviewPriorityInput {
  importance: number;
  forgettingRisk: number;
  misunderstandingDepth: number;
  confusionScore: number;
  daysUntilExam: number;
}

export interface ReviewWeights {
  importance: number;
  forgetting: number;
  misunderstanding: number;
  confusion: number;
  urgency: number;
}

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));

export function examUrgency(daysUntilExam: number): number {
  if (daysUntilExam <= 0) return 1;
  return clamp(1 - daysUntilExam / 240);
}

export function calculateReviewPriority(input: ReviewPriorityInput, weights: ReviewWeights): number {
  const weighted =
    clamp(input.importance) * weights.importance +
    clamp(input.forgettingRisk) * weights.forgetting +
    clamp(input.misunderstandingDepth) * weights.misunderstanding +
    clamp(input.confusionScore) * weights.confusion +
    examUrgency(input.daysUntilExam) * weights.urgency;
  const maxWeight = [weights.importance, weights.forgetting, weights.misunderstanding, weights.confusion, weights.urgency].reduce((sum, value) => sum + Math.max(0, value), 0);
  return maxWeight === 0 ? 0 : Math.round((weighted / maxWeight) * 1000) / 10;
}

export interface ReviewOutcome {
  isCorrect: boolean;
  confidence: Confidence;
  elapsedRatio: number;
  hintUsed: boolean;
  priorCorrect: number;
  priorIncorrect: number;
  transferAccuracy: number;
  reverseLectureScore: number;
  comparisonAccuracy: number;
}

export function classifyErrorDna(outcome: ReviewOutcome): ErrorDnaCode[] {
  if (outcome.isCorrect) return [];
  const result = new Set<ErrorDnaCode>();
  if (outcome.confidence === "EXPLAIN") result.add("HIGH_CONFIDENCE_ERROR");
  if (outcome.elapsedRatio > 1.25) result.add("TIME_PRESSURE");
  if (outcome.priorCorrect === 0 || outcome.hintUsed) result.add("KNOWLEDGE_GAP");
  if (outcome.transferAccuracy < 0.45 && outcome.priorCorrect > 0) result.add("APPLICATION_ERROR");
  if (outcome.comparisonAccuracy < 0.45) result.add("CONFUSION");
  if (result.size === 0) result.add("REQUIREMENT_MISS");
  return [...result];
}

export function nextReviewIntervalDays(outcome: ReviewOutcome): number {
  if (!outcome.isCorrect) return outcome.confidence === "EXPLAIN" ? 1 : 0.5;
  const evidenceBoost = outcome.reverseLectureScore >= 0.7 ? 1.35 : 1;
  const transferBoost = outcome.transferAccuracy >= 0.7 ? 1.3 : 1;
  const confidenceBoost = outcome.confidence === "EXPLAIN" ? 1.35 : outcome.confidence === "PROBABLE" ? 1 : 0.65;
  const hintPenalty = outcome.hintUsed ? 0.5 : 1;
  const historyBase = Math.min(30, 1.8 ** Math.max(1, outcome.priorCorrect + 1));
  return Math.round(Math.max(1, historyBase * evidenceBoost * transferBoost * confidenceBoost * hintPenalty) * 10) / 10;
}

export interface MasteryEvidence {
  verifiedAccuracy: number;
  spacedAccuracy: number;
  noHintAccuracy: number;
  comparisonAccuracy: number;
  transferAccuracy: number;
  writingScore: number;
  explanationScore: number;
  timedAccuracy: number;
  verifiedAttempts: number;
}

export function calculateMastery(evidence: MasteryEvidence): MasteryMetrics {
  const reliability = clamp(evidence.verifiedAttempts / 12);
  const conservative = (value: number): number => Math.round(clamp(value) * reliability * 100);
  return {
    knowledgeRetention: conservative(evidence.verifiedAccuracy * 0.45 + evidence.noHintAccuracy * 0.25 + evidence.spacedAccuracy * 0.3),
    recallStability: conservative(evidence.spacedAccuracy * 0.7 + evidence.noHintAccuracy * 0.3),
    distinctionSkill: conservative(evidence.comparisonAccuracy),
    transferSkill: conservative(evidence.transferAccuracy),
    writingSkill: conservative(evidence.writingScore),
    evidenceExplanation: conservative(evidence.explanationScore),
    answerSpeed: conservative(evidence.timedAccuracy),
    examReproducibility: conservative(
      evidence.spacedAccuracy * 0.25 +
        evidence.noHintAccuracy * 0.15 +
        evidence.comparisonAccuracy * 0.15 +
        evidence.transferAccuracy * 0.2 +
        evidence.explanationScore * 0.1 +
        evidence.timedAccuracy * 0.15,
    ),
  };
}

export function calculateReadiness(metrics: MasteryMetrics): number {
  const weighted =
    metrics.knowledgeRetention * 0.18 +
    metrics.recallStability * 0.17 +
    metrics.distinctionSkill * 0.12 +
    metrics.transferSkill * 0.16 +
    metrics.writingSkill * 0.1 +
    metrics.evidenceExplanation * 0.1 +
    metrics.answerSpeed * 0.07 +
    metrics.examReproducibility * 0.1;
  return Math.round(weighted);
}

export type AiGuardState = "NORMAL" | "CACHE_FIRST" | "LIMITED" | "STOP_GENERATION";

export function getAiGuardState(usedBudget: number, monthlyBudget: number): AiGuardState {
  if (monthlyBudget <= 0 || usedBudget >= monthlyBudget) return "STOP_GENERATION";
  const ratio = usedBudget / monthlyBudget;
  if (ratio >= 0.9) return "LIMITED";
  if (ratio >= 0.8) return "CACHE_FIRST";
  return "NORMAL";
}

export interface MissionSignals {
  availableMinutes: number;
  daysSinceStudy: number;
  dueReviews: number;
  highConfidenceErrors: number;
  weakTopic?: string;
  writingDue: boolean;
}

export function buildMission(signals: MissionSignals): { comebackMode: boolean; items: MissionItem[]; estimatedMinutes: number } {
  const comebackMode = signals.daysSinceStudy >= 2;
  const budget = comebackMode ? Math.min(signals.availableMinutes, 8) : Math.max(10, signals.availableMinutes);
  const candidates: MissionItem[] = [
    { type: "REVIEW", title: `忘れかけ問題 ${Math.min(5, Math.max(1, signals.dueReviews))}問`, minutes: 6 },
    ...(signals.highConfidenceErrors > 0 ? [{ type: "HIGH_CONFIDENCE" as const, title: "高確信誤答を1件修正", minutes: 5 }] : []),
    { type: "ONE_WORD", title: "一語差ドリル 4問", minutes: 4 },
    { type: "LECTURE", title: `${signals.weakTopic ?? "最優先論点"} ミニ講義`, minutes: 6 },
    ...(signals.writingDue ? [{ type: "WRITING" as const, title: "40字記述 1問", minutes: 6 }] : []),
    { type: "TRANSFER", title: "初見転移問題 2問", minutes: 5 },
    { type: "REVERSE_LECTURE", title: "AI反転講義 1テーマ", minutes: 3 },
  ];
  const items: MissionItem[] = [];
  let used = 0;
  for (const item of candidates) {
    if (items.length > 0 && used + item.minutes > budget) continue;
    items.push(item);
    used += item.minutes;
  }
  return { comebackMode, items, estimatedMinutes: used };
}

export function validateInvitationSnapshot(input: {
  active: boolean;
  usedCount: number;
  maxUses: number;
  expiresAt: string | null;
  now: Date;
}): boolean {
  return (
    input.active &&
    input.usedCount < input.maxUses &&
    (input.expiresAt === null || Date.parse(input.expiresAt) > input.now.getTime())
  );
}

export function canActivateUser(activeUsers: number, maxActiveUsers: number): boolean {
  return maxActiveUsers > 0 && activeUsers < maxActiveUsers;
}
