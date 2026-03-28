import type { MessageRole } from "@/lib/domain/enums";
import { prisma } from "@/lib/db";
import { localSessionStore } from "@/lib/services/agent/local-session-store";

export type AgentRecord = {
  id: string;
  userId: string;
  key: string;
  soulMission: string;
  identityName: string;
  communicationStyle: string;
  model: string;
  onboardingCompleted: boolean;
  responseBudgetTokens: number;
  memoryBudgetTokens: number;
};

export class AgentStore {
  private toRecord(agent: any): AgentRecord {
    return {
      id: agent.id,
      userId: agent.userId,
      key: agent.key,
      soulMission: agent.soul?.mission || "",
      identityName: agent.identity?.name || "",
      communicationStyle: agent.identity?.communicationStyle || "",
      model: agent.mindConfig?.model || "gemini-2.0-flash-preview",
      onboardingCompleted: agent.onboardingCompleted,
      responseBudgetTokens: agent.responseBudgetTokens,
      memoryBudgetTokens: agent.memoryBudgetTokens,
    };
  }

  async ensureUserAgent(userId: string, key = "atlas"): Promise<AgentRecord> {
    // Already exists for this user?
    const existing = await prisma.agent.findFirst({
      where: { key, userId },
      include: { soul: true, identity: true, mindConfig: true },
    });
    if (existing) return this.toRecord(existing);

    // Seed from admin's atlas agent as template
    const template = await prisma.agent.findFirst({
      where: { key, user: { role: "ADMIN" } },
      include: { soul: true, identity: true, mindConfig: true },
    });

    const agent = await prisma.agent.create({
      data: { userId, key },
      select: { id: true },
    });

    if (template?.soul) {
      const { id: _id, agentId: _aid, createdAt: _ca, updatedAt: _ua, ...soulData } = template.soul;
      await prisma.agentSoul.create({ data: { agentId: agent.id, ...soulData } });
    } else {
      await prisma.agentSoul.create({
        data: {
          agentId: agent.id,
          mission: "Help users discover and land their ideal job through intelligent search, scoring, and outreach.",
          longTermObjective: "Become the user's trusted career co-pilot.",
          principles: ["Always act in the user's career interest", "Be honest about job fit"],
          toneBoundaries: ["Professional", "Encouraging"],
          decisionPhilosophy: "Prioritise relevance and quality over quantity.",
          valuesRules: ["No spam outreach", "Respect user privacy"],
        },
      });
    }

    if (template?.identity) {
      const { id: _id, agentId: _aid, createdAt: _ca, updatedAt: _ua, ...identityData } = template.identity;
      await prisma.agentIdentity.create({ data: { agentId: agent.id, ...identityData } });
    } else {
      await prisma.agentIdentity.create({
        data: {
          agentId: agent.id,
          name: "Atlas",
          roleTitle: "AI Job Search Agent",
          specialization: "Job discovery, ranking, and outreach",
          communicationStyle: "Clear, concise, and encouraging",
          expertiseProfile: ["Job search", "CV matching", "Outreach"],
          strengths: ["Fast multi-platform search", "Score-based ranking"],
          cautionAreas: ["Do not apply without user confirmation"],
          description: "Atlas is your AI-powered job search operating system.",
        },
      });
    }

    if (template?.mindConfig) {
      const { id: _id, agentId: _aid, createdAt: _ca, updatedAt: _ua, ...mindData } = template.mindConfig;
      await prisma.agentMindConfig.create({ data: { agentId: agent.id, ...mindData } });
    } else {
      await prisma.agentMindConfig.create({
        data: {
          agentId: agent.id,
          provider: "VERTEX_AI" as any,
          model: "gemini-2.0-flash-preview",
          systemPromptTemplate: "",
          maxTurns: 12,
        },
      });
    }

    const created = await prisma.agent.findFirst({
      where: { id: agent.id },
      include: { soul: true, identity: true, mindConfig: true },
    });
    return this.toRecord(created!);
  }

  async findAgent(agentId: string, userId: string): Promise<AgentRecord | null> {
    try {
      // Try exact userId match first
      const agent = await prisma.agent.findFirst({
        where: { OR: [{ id: agentId }, { key: agentId }], userId },
        include: { soul: true, identity: true, mindConfig: true },
      });

      if (agent) return this.toRecord(agent);

      // Not found — auto-create for this user seeded from admin template
      const key = agentId.length < 30 ? agentId : "atlas";
      return await this.ensureUserAgent(userId, key);
    } catch (error) {
      console.error("[AgentStore] findAgent failed:", error);
      return null;
    }
  }

  async createOrReuseSession(input: {
    sessionId?: string;
    userId: string;
    agentId: string;
    message: string;
  }): Promise<string> {
    const fallbackId = input.sessionId || `local-${crypto.randomUUID()}`;
    try {
      if (input.sessionId) {
        const existing = await prisma.chatSession.findFirst({
          where: { id: input.sessionId, userId: input.userId, agentId: input.agentId },
          select: { id: true },
        });
        if (existing) return existing.id;
      }

      const created = await prisma.chatSession.create({
        data: {
          userId: input.userId,
          agentId: input.agentId,
          title: input.message.slice(0, 80),
        },
        select: { id: true },
      });

      return created.id;
    } catch (dbError) {
      console.warn("[AgentStore] DB failed in createOrReuseSession, using ID:", fallbackId);
      return fallbackId;
    }
  }

  async saveMessage(input: {
    sessionId: string;
    role: MessageRole;
    content: string;
    tokenEstimate: number;
    agentId?: string;
    userId?: string;
  }): Promise<void> {
    try {
      if (input.sessionId.startsWith("local-")) throw new Error("local session");
      await prisma.chatMessage.create({
        data: {
          sessionId: input.sessionId,
          role: input.role,
          content: input.content,
          tokenEstimate: input.tokenEstimate,
        },
      });
    } catch (dbError) {
      console.warn("[AgentStore] DB failed to save message:", dbError instanceof Error ? dbError.message : "Unknown error");
    }

    const agentId = input.agentId || "job_scout";
    const userId = input.userId || "unknown";

    try {
      await localSessionStore.saveMessage({
        sessionId: input.sessionId,
        agentId,
        userId,
        role: input.role,
        content: input.content,
      });
    } catch (localError) {
      console.error("[AgentStore] Local session save failed:", localError);
    }
  }

  async upsertOnboarding(agentId: string, completed: boolean): Promise<void> {}
  async applyConversationalOnboarding(agentId: string, data: any): Promise<void> {}
  async saveMemoryChunk(data: any): Promise<void> {}

  async listSessions(input: { agentId: string; userId?: string }): Promise<Array<{ id: string; title: string; updatedAt: Date }>> {
    if (!input.agentId) return [];

    const userId = input.userId;
    let resolvedAgentId = input.agentId;
    let resolvedAgentKey = input.agentId;

    try {
      const agent = await prisma.agent.findFirst({
        where: {
          OR: [{ id: input.agentId }, { key: input.agentId }],
          ...(userId ? { userId } : {}),
        },
        select: { id: true, key: true },
      });

      if (agent) {
        resolvedAgentId = agent.id;
        resolvedAgentKey = agent.key;
      }
    } catch (dbError) {
      console.warn("[AgentStore] DB error resolving agent in listSessions.");
    }

    const localSessions = await localSessionStore.list(resolvedAgentId, userId || "unknown", resolvedAgentKey);

    try {
      const dbSessions = await prisma.chatSession.findMany({
        where: { agentId: resolvedAgentId, userId, isArchived: false },
        select: { id: true, title: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      });

      const merged = [...dbSessions];
      for (const ls of localSessions) {
        if (!merged.find(s => s.id === ls.id)) {
          merged.push({ id: ls.id, title: ls.title, updatedAt: new Date(ls.updatedAt) });
        }
      }
      return merged.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    } catch (error) {
      console.warn("[AgentStore] DB error in listSessions, returning local only.");
      return localSessions.map(ls => ({ id: ls.id, title: ls.title, updatedAt: new Date(ls.updatedAt) }));
    }
  }

  async getSessionMessages(sessionId: string): Promise<Array<{ role: MessageRole; content: string; createdAt: Date }>> {
    try {
      const dbMessages = await prisma.chatMessage.findMany({
        where: { sessionId },
        select: { role: true, content: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });
      if (dbMessages.length > 0) return dbMessages;
    } catch (error) {
      console.warn("[AgentStore] DB error in getSessionMessages");
    }

    const local = await localSessionStore.get(sessionId);
    if (local) {
      return local.messages.map(m => ({
        role: m.role,
        content: m.content,
        createdAt: new Date(m.createdAt),
      }));
    }

    return [];
  }
}

export const agentStore = new AgentStore();
