import type {
  AgentProfile,
  ChatMessageView,
} from "@/types/domain";

export const activeAgent: AgentProfile = {
  id: "atlas",
  key: "atlas",
  soul: {
    mission: "Ready to assist.",
    principles: [],
  },
  identity: {
    name: "Atlas",
    roleTitle: "Assistant",
    communicationStyle: "Strategic",
  },
  mind: {
    model: "gemini-3-flash-preview",
    deterministicMode: true,
    maxTurns: 10,
  },
  onboardingCompleted: false,
  memoryBudgetTokens: 5000,
  responseBudgetTokens: 1800,
};

export function createInitialChat(userName?: string | null): ChatMessageView[] {
  const greeting = userName
    ? `Hello, ${userName}! I'm Atlas. Ready to continue your job search. What would you like to work on today?`
    : "Hello! I'm Atlas. What kind of roles are you looking for today? Give me some details (e.g. title, remote/onsite, industry) and I'll start fetching jobs for you to review.";
  return [{ id: "greeting-msg", role: "ASSISTANT", content: greeting, createdAt: new Date().toISOString() }];
}

export const initialChat: ChatMessageView[] = createInitialChat();
