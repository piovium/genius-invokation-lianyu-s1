import { AxiosError } from "axios";

export interface ApiProblem {
  statusCode?: number;
  code?: string;
  message?: string | string[];
  details?: Record<string, unknown>;
}

const messages: Record<string, string> = {
  QQ_NOT_IN_GROUP: "该 QQ 当前不在赛事群内",
  QQ_ALREADY_REGISTERED: "该 QQ 已注册",
  REGISTRATION_CLOSED: "报名已经截止",
  DUPLICATE_CHARACTER_SET: "已有角色构成相同的比赛牌组",
  COMPETITION_DECK_LOCKED: "比赛牌组已锁定",
  COMPETITION_DECK_CHARACTERS_LOCKED: "比赛牌组不能增删角色",
  COMPETITION_DECK_LIMIT_REACHED: "已达到比赛牌组数量上限",
  USER_IN_RUNNING_GAME: "当前仍有开放对局，请先完成对局或联系管理员",
  EVENT_PHASE_MISMATCH: "场次阶段已变化，请刷新后重试",
  NO_USABLE_COMPETITION_DECK: "该牌组不可用于本局",
  USER_ALREADY_IN_ACTIVE_EVENT: "部分选手已在其他活跃场次中",
  MATCH_ALREADY_HAS_OPEN_GAME: "该盘已有开放对局",
};

export function apiProblem(error: unknown): ApiProblem | null {
  if (!(error instanceof AxiosError)) return null;
  const data = error.response?.data;
  return data && typeof data === "object" ? (data as ApiProblem) : null;
}

export function errorMessage(error: unknown): string {
  const problem = apiProblem(error);
  if (problem?.code && messages[problem.code]) return messages[problem.code]!;
  if (Array.isArray(problem?.message)) return problem.message.join("；");
  if (typeof problem?.message === "string") return problem.message;
  return error instanceof Error ? error.message : String(error);
}
