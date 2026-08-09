import type { LearningProgress } from "../../features/learning/model/types";

/** 学習進捗を端末へ読み書きし、初期状態へ戻すための公開契約。 */
export interface ProgressRepository {
  /** 保存済み進捗、または利用可能な保存がない場合の初期進捗を返す。 */
  load(): Promise<LearningProgress>;

  /** 進捗を永続化する。保存先の障害では学習セッションを中断しない。 */
  save(progress: LearningProgress): Promise<void>;

  /** すべての保存先から進捗を削除する。 */
  reset(): Promise<void>;
}
