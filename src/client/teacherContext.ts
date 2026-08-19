export interface AnswerTutorContext {
  stem: string;
  userAnswer?: string;
  modelAnswer?: string;
  explanation?: string;
  judgmentPoint?: string;
}

function clean(value: string | undefined): string {
  return value?.normalize("NFKC").trim() ?? "";
}

export function buildAnswerTutorPrompt(context: AnswerTutorContext, maxLength = 1000): string {
  const sections = [
    "次の問題と解答について、結論だけでなく判断の分岐、根拠、誤りやすい点を説明してください。",
    `【問題文】${clean(context.stem)}`,
    clean(context.userAnswer) ? `【自分の回答】${clean(context.userAnswer)}` : "",
    clean(context.modelAnswer) ? `【解答例】${clean(context.modelAnswer)}` : "",
    clean(context.explanation) ? `【解説】${clean(context.explanation)}` : "",
    clean(context.judgmentPoint) ? `【判断ポイント】${clean(context.judgmentPoint)}` : "",
  ].filter(Boolean);
  return sections.join("\n").slice(0, Math.max(1, maxLength));
}
