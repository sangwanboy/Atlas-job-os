"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import type { ChatMessageView } from "@/types/domain";
import { initialChat } from "@/lib/mock/data";

type JobPreview = {
  title: string;
  company: string;
  location: string;
  url: string;
  salary?: string;
  source?: string;
  description?: string;
  skills?: string;
  datePosted?: string;
  isAlreadyImported?: boolean;
};

type AgentContextType = {
  messages: ChatMessageView[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageView[]>>;
  sessionId: string | undefined;
  setSessionId: (id: string | undefined) => void;
  sessions: Array<{ id: string; title: string }>;
  setSessions: (sessions: Array<{ id: string; title: string }>) => void;
  pendingJobs: JobPreview[] | null;
  setPendingJobs: (jobs: JobPreview[] | null) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  initialLoading: boolean;
  setInitialLoading: (loading: boolean) => void;
};

const AgentContext = createContext<AgentContextType | undefined>(undefined);

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ChatMessageView[]>(initialChat);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [sessions, setSessions] = useState<Array<{ id: string; title: string }>>([]);
  const [pendingJobs, setPendingJobs] = useState<JobPreview[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(messages.length <= 1);

  return (
    <AgentContext.Provider
      value={{
        messages,
        setMessages,
        sessionId,
        setSessionId,
        sessions,
        setSessions,
        pendingJobs,
        setPendingJobs,
        loading,
        setLoading,
        initialLoading,
        setInitialLoading,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent() {
  const context = useContext(AgentContext);
  if (context === undefined) {
    throw new Error("useAgent must be used within an AgentProvider");
  }
  return context;
}
