import type { SyncedAgentProfile } from "@/lib/services/agent/agent-profile-sync";
import type { LlmProvider } from "@/types/settings";

export type AgentRuntimeContext = {
  agentId: string;
  sessionId?: string;
  userId?: string;
  message: string;
  preferredProvider?: LlmProvider;
  preferredModel?: string;
  apiKey?: string;
  strictAgentResponseMode?: boolean;
  onUpdate?: (update: AgentTurnUpdate) => void;
};

export type AgentTurnUpdate = {
  type: "status" | "tool_start" | "tool_end" | "session_id";
  status?: string;
  tool?: string;
  parameters?: any;
  result?: any;
  sessionId?: string;
};

export type AgentRuntimeResponse = {
  reply: string;
  sessionId?: string;
  shouldWriteSummary: boolean;
  loopPrevented: boolean;
  onboardingCompleted?: boolean;
  tokenBudgetWarning?: string;
  profileSnapshot?: SyncedAgentProfile;
  continuitySynced?: boolean;
  rehydrated?: boolean;
  toolLogs?: Array<{ tool: string; parameters: any; result: string }>;
  pendingJobs?: Array<{ title: string; company: string; location: string; url: string; salary?: string; source?: string }> | null;
};

export type RegisteredAgent = {
  id: string;
  userId?: string;
  key: string;
  soulMission: string;
  identityName: string;
  communicationStyle: string;
  model: string;
  onboardingCompleted: boolean;
  responseBudgetTokens: number;
  memoryBudgetTokens: number;
};
