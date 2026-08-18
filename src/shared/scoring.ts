export interface ScoreSectionRule {
  maxPoints: number | null;
  thresholdRatio: number;
}

export interface ExamScoreRules {
  legal: ScoreSectionRule;
  basicKnowledge: ScoreSectionRule;
  total: ScoreSectionRule;
}

export interface ExamScores {
  legal: number;
  basicKnowledge: number;
  total: number;
}

export interface ScoreEvaluation {
  determinable: boolean;
  legalPassed: boolean | null;
  basicKnowledgePassed: boolean | null;
  totalPassed: boolean | null;
  allCriteriaPassed: boolean | null;
}

function sectionPassed(score: number, rule: ScoreSectionRule): boolean | null {
  if (rule.maxPoints === null || rule.maxPoints <= 0) return null;
  return score >= rule.maxPoints * rule.thresholdRatio;
}

export function evaluateExamScore(scores: ExamScores, rules: ExamScoreRules): ScoreEvaluation {
  const legalPassed = sectionPassed(scores.legal, rules.legal);
  const basicKnowledgePassed = sectionPassed(scores.basicKnowledge, rules.basicKnowledge);
  const totalPassed = sectionPassed(scores.total, rules.total);
  const values = [legalPassed, basicKnowledgePassed, totalPassed];
  const determinable = values.every((value) => value !== null);
  return {
    determinable,
    legalPassed,
    basicKnowledgePassed,
    totalPassed,
    allCriteriaPassed: determinable ? values.every(Boolean) : null,
  };
}
