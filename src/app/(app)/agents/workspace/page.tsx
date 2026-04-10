import { AgentChatStarter } from "@/components/agents/agent-chat-starter";

export default function AgentWorkspacePage() {
  return (
    <div className="flex h-full max-h-full min-h-0 flex-col overflow-hidden p-1 md:p-2 lg:p-3">
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
        <AgentChatStarter />
      </div>
    </div>
  );
}
