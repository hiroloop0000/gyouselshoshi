export type Confidence = "EXPLAIN" | "PROBABLE" | "GUESS";
export type ErrorDnaCode =
  | "KNOWLEDGE_GAP"
  | "CONFUSION"
  | "SUBJECT_CONFUSION"
  | "EXCEPTION_MISS"
  | "NUMBER_TIME_CONFUSION"
  | "REQUIREMENT_MISS"
  | "READING_ERROR"
  | "APPLICATION_ERROR"
  | "TIME_PRESSURE"
  | "HIGH_CONFIDENCE_ERROR";

export type ContentStatus = "DRAFT" | "REVIEWED" | "VERIFIED";

export interface MasteryMetrics {
  knowledgeRetention: number;
  recallStability: number;
  distinctionSkill: number;
  transferSkill: number;
  writingSkill: number;
  evidenceExplanation: number;
  answerSpeed: number;
  examReproducibility: number;
}

export interface MissionItem {
  type: "REVIEW" | "ONE_WORD" | "HIGH_CONFIDENCE" | "LECTURE" | "WRITING" | "TRANSFER" | "REVERSE_LECTURE";
  title: string;
  minutes: number;
  targetId?: string;
}

export interface PublicExamConfig {
  examYear: number;
  examDate: string;
  lawReferenceDate: string;
  legalQuestionCount: number;
  knowledgeQuestionCount: number;
  scoringPublished: boolean;
  scoringThresholds: {
    legal: number;
    basicKnowledge: number;
    total: number;
  };
  officialSourceUrl: string;
}
