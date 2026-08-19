import { describe, expect, it } from "vitest";
import { rankLectureContexts, type LectureSearchContext } from "../../src/worker/ai";

const contexts: LectureSearchContext[] = [
  {
    title: "取消訴訟を五つの箱で整理する",
    body: "取消訴訟の訴訟要件と出訴期間を整理します。",
    objective_title: "取消訴訟の基本構造を説明する",
    topic_name: "行政事件訴訟法",
    subject_name: "行政法",
  },
  {
    title: "審査請求期間の二重の時計",
    body: "行政不服審査法上の審査請求期間を整理します。",
    objective_title: "審査請求の期間を判断する",
    topic_name: "行政不服審査法",
    subject_name: "行政法",
  },
  {
    title: "株主総会の権限と招集",
    body: "会社法上の株主総会を扱います。",
    objective_title: "株主総会の権限と招集を判断する",
    topic_name: "会社法",
    subject_name: "商法・会社法",
  },
];

describe("AI lecture grounding", () => {
  it("finds Japanese legal topics without requiring an exact sentence match", () => {
    const ranked = rankLectureContexts("取消訴訟と審査請求の違いを教えてください", contexts);
    const titles = ranked.map((item) => item.title);
    expect(titles).toHaveLength(2);
    expect(titles).toEqual(expect.arrayContaining(["取消訴訟を五つの箱で整理する", "審査請求期間の二重の時計"]));
    expect(titles).not.toContain("株主総会決議の基本");
  });

  it("does not return an unrelated lecture", () => {
    expect(rankLectureContexts("審査請求の期間はいつまでですか", contexts)[0]?.title).toBe("審査請求期間の二重の時計");
    expect(rankLectureContexts("未知の宇宙法制度", contexts)).toEqual([]);
  });
});
