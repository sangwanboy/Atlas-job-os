"use client";

import React, { useEffect, useState, useRef } from "react";
import { 
  Globe, 
  ShieldAlert, 
  Eye, 
  EyeOff, 
  Activity, 
  MousePointer2, 
  Keyboard, 
  Timer,
  ChevronRight,
  ChevronLeft,
  XCircle,
  X,
  ExternalLink,
  Loader2,
  Play
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import type { BrowserObserverEvent, BrowserSessionStatus } from "@/lib/services/browser/types/browser-types";

interface BrowserObserverProps {
  sessionId: string;
  isOpen: boolean;
  onToggle: () => void;
  onResume?: () => void;
}

export const BrowserObserver: React.FC<BrowserObserverProps> = ({ 
  sessionId, 
  isOpen, 
  onToggle,
  onResume
}) => {
  const [events, setEvents] = useState<BrowserObserverEvent[]>([]);
  const [status, setStatus] = useState<BrowserSessionStatus>("active");
  const [lastScreenshot, setLastScreenshot] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [isResuming, setIsResuming] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionId) return;

    setIsConnecting(true);
    
    // Try to connect to standalone server directly if on localhost (faster, avoids proxy bottlenecks)
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const remoteUrl = `http://localhost:3001/api/browser/observe?sessionId=${sessionId}`;
    const localUrl = `/api/browser/observe?sessionId=${sessionId}`;
    
    console.log(`[BrowserObserver] Connecting to ${isLocal ? 'direct remote' : 'local proxy'} for session: ${sessionId}`);
    const eventSource = new EventSource(isLocal ? remoteUrl : localUrl);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "heartbeat") {
          setIsConnecting(false);
          return;
        }

        const obsEvent = data as BrowserObserverEvent;
        
        setEvents(prev => [obsEvent, ...prev].slice(0, 50));
        
        if (obsEvent.type === "status" && obsEvent.status) {
          setStatus(obsEvent.status);
        }

        if (obsEvent.type === "action") {
          setLastAction(obsEvent.action || null);
        }

        if (data.type === "media" && data.screenshot) {
          console.log("[BrowserObserver] Media event received:", data.screenshot);
          setLastScreenshot(`/api/browser/screenshot?path=${encodeURIComponent(data.screenshot)}`);
        }
      } catch (e) {
        console.error("[BrowserObserver] Failed to parse event", e);
      }
    };

    eventSource.onerror = (err) => {
      console.error("[BrowserObserver] SSE Error", err);
      setIsConnecting(false);
    };

    return () => {
      eventSource.close();
    };
  }, [sessionId]);

  const getStatusColor = (s: BrowserSessionStatus) => {
    switch (s) {
      case "active": return "text-emerald-500 bg-emerald-500/10";
      case "protected": return "text-amber-500 bg-amber-500/10 animate-pulse";
      case "takeover_required": return "text-rose-500 bg-rose-500/10 animate-bounce";
      case "error": return "text-red-600 bg-red-600/10";
      default: return "text-slate-400 bg-slate-400/10";
    }
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case "browser_navigate": return <Globe className="w-3 h-3" />;
      case "browser_click": return <MousePointer2 className="w-3 h-3" />;
      case "browser_type": return <Keyboard className="w-3 h-3" />;
      default: return <Activity className="w-3 h-3" />;
    }
  };

  const handleResume = async () => {
    setIsResuming(true);
    try {
      const response = await fetch("/api/browser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resume",
          sessionId,
        }),
      });
      const result = await response.json();
      if (result.status === "ok") {
        setStatus("active");
        if (onResume) onResume();
      }
    } catch (err) {
      console.error("[BrowserObserver] Failed to resume", err);
    } finally {
      setIsResuming(false);
    }
  };

  return (
    <div 
      className={cn(
        "fixed top-0 right-0 h-full z-50 transition-all duration-500 ease-in-out flex shadow-2xl overflow-hidden",
        isOpen ? "w-[400px]" : "w-0"
      )}
    >
      {/* Toggle Button Container */}
      <div 
        className={cn(
          "absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 transition-opacity duration-300",
          isOpen ? "opacity-0 pointer-events-none" : "opacity-100"
        )}
      >
        <button
          onClick={onToggle}
          className="bg-white/80 backdrop-blur-md border border-white/60 p-2 rounded-l-xl shadow-lg hover:bg-white transition-colors group"
        >
          {sessionId ? <Eye className="text-cyan-600 w-5 h-5 group-hover:scale-110 transition-transform" /> : <EyeOff className="text-slate-400 w-5 h-5" />}
        </button>
      </div>

      {/* Main Panel Content */}
      <div className="w-full h-full bg-white/70 backdrop-blur-2xl border-l border-white/40 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-none p-4 border-b border-white/40 flex items-center justify-between bg-white/30">
          <div className="flex items-center gap-3">
            <div className={cn("p-1.5 rounded-lg bg-cyan-500/10 text-cyan-600")}>
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Live Observation</h3>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Session: {sessionId.slice(0, 8)}...</p>
            </div>
          </div>
          <button 
            onClick={onToggle}
            className="p-1.5 hover:bg-slate-200/50 rounded-lg transition-colors text-slate-400"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Live Status Bar */}
        <div className="flex-none px-4 py-2 border-b border-white/40 flex items-center justify-between text-[11px] font-bold uppercase tracking-tight">
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full", status === "active" ? "bg-emerald-500 animate-pulse" : "bg-amber-500")} />
            <span className={cn("px-2 py-0.5 rounded-full", getStatusColor(status))}>
              {status.replace("_", " ")}
            </span>
          </div>
          {isConnecting && (
            <div className="flex items-center gap-1.5 text-cyan-600">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Linking...</span>
            </div>
          )}
        </div>

        {/* Browser Viewport (Snapshot) */}
        <div className="flex-none p-4 pb-0">
          <div className="aspect-video w-full rounded-xl border border-white/60 bg-slate-900 overflow-hidden shadow-well group relative cursor-pointer">
            {lastScreenshot ? (
              <img 
                src={lastScreenshot} 
                alt="Browser View" 
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                <Globe className="w-8 h-8 opacity-20" />
                <span className="text-[10px] font-medium opacity-40">Awaiting visual synchronization...</span>
              </div>
            )}
            
            {/* Action Overlay */}
            {lastAction && (
              <div className="absolute bottom-2 left-2 right-2 bg-black/60 backdrop-blur-md border border-white/10 p-2 rounded-lg text-white text-[10px] flex items-center gap-2 animate-in slide-in-from-bottom-2 duration-300">
                <Activity className="w-3 h-3 text-cyan-400" />
                <span className="font-medium truncate">{lastAction}</span>
              </div>
            )}
            
            <div 
              className="absolute inset-0 bg-transparent group-hover:bg-cyan-500/5 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 duration-300"
              onClick={() => setShowFullscreen(true)}
            >
              <button className="bg-white/95 text-cyan-600 px-3 py-1.5 rounded-full text-[10px] font-bold shadow-lg flex items-center gap-1.5">
                <ExternalLink className="w-3 h-3" />
                Fullscreen View
              </button>
            </div>
          </div>
        </div>

        {/* Protection Alert / Takeover CTA */}
        {(status === "protected" || status === "takeover_required") && (
          <div className="flex-none p-4 pt-4">
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex flex-col gap-3 shadow-sm animate-in zoom-in-95 duration-300">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-rose-500 rounded-lg text-white">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-rose-800">Bot Shield Detected</p>
                  <p className="text-[10px] text-rose-600 leading-tight">The target site has triggered a CAPTCHA or consent wall. Manual intervention is required to proceed.</p>
                </div>
              </div>
              <button 
                onClick={handleResume}
                disabled={isResuming}
                className="w-full bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white py-2 rounded-lg text-xs font-bold shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {isResuming ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                {isResuming ? "Resuming Agent..." : "I've Resolved It - Resume Agent"}
              </button>
            </div>
          </div>
        )}

        {/* Event Timeline */}
        <div className="flex-1 min-h-0 p-4 pt-4 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-3 px-1">
            <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Activity Timeline</h4>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
              <span className="text-[9px] text-cyan-600 font-bold uppercase">Real-time</span>
            </div>
          </div>
          
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto pr-1 space-y-3 custom-scrollbar"
          >
            {events.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2 border-2 border-dashed border-slate-100 rounded-2xl">
                <Timer className="w-6 h-6 opacity-20" />
                <span className="text-[10px] font-medium opacity-40">No activity yet...</span>
              </div>
            ) : (
              events.map((ev, i) => (
                <div 
                  key={i} 
                  className={cn(
                    "relative pl-6 pb-4 border-l border-slate-100 last:pb-0 group",
                    ev.type === "protect" ? "border-rose-200" : ""
                  )}
                >
                  <div className={cn(
                    "absolute left-0 top-0 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-white shadow-sm transition-transform duration-300 group-hover:scale-125 z-10",
                    ev.type === "action" ? "bg-cyan-500" : 
                    ev.type === "protect" ? "bg-rose-500" : "bg-slate-300"
                  )} />
                  
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-700">
                      {getActionIcon(ev.action || ev.type)}
                      <span className="truncate">{ev.action?.replace("browser_", "") || ev.type}</span>
                    </div>
                    <span className="text-[8px] font-mono text-slate-400">{new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>
                  
                  {ev.detail && (
                    <p className="text-[10px] text-slate-500 leading-tight bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/50">
                      {ev.detail}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer Info */}
        <div className="flex-none p-3 border-t border-white/40 bg-slate-50/30 text-[9px] text-slate-400 font-medium text-center">
          Monitoring Engine active. Tracing enabled.
        </div>
      </div>

      {/* Fullscreen Modal */}
      {showFullscreen && lastScreenshot && (
        <div 
          className="fixed inset-0 z-[9999] bg-slate-900/90 backdrop-blur-xl flex items-center justify-center p-4 md:p-12 animate-in fade-in duration-300"
          onClick={() => setShowFullscreen(false)}
        >
          <div 
            className="relative w-full max-w-6xl aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/10 ring-1 ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <img 
              src={lastScreenshot} 
              alt="Browser Fullscreen" 
              className="w-full h-full object-contain"
            />
            
            <div className="absolute top-6 right-6 flex items-center gap-3">
              <button 
                onClick={() => setShowFullscreen(false)}
                className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-2xl text-white transition-all hover:scale-110 active:scale-95 border border-white/10"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="absolute bottom-6 left-6 right-6 p-4 bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl flex items-center justify-between text-white">
               <div className="flex items-center gap-3">
                 <Globe className="w-5 h-5 text-cyan-400" />
                 <span className="text-sm font-medium">Live Stream: {sessionId}</span>
               </div>
               <div className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-[10px] font-bold border border-emerald-500/30 animate-pulse">
                 LIVE SYNC
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
