"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  FileText,
  Upload,
  Trash2,
  FileImage,
  FileType,
  File,
  X,
  CheckCircle2,
  Loader2,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Brain,
  Tag,
} from "lucide-react";

type CvTag = "professional" | "part-time" | "role-specific" | "general";

type CvFile = {
  name: string;
  originalName?: string;
  size: number;
  uploadedAt: string;
  ext: string;
  tag: CvTag;
  label: string | null;
};

const CV_TAGS: { value: CvTag; label: string; color: string }[] = [
  { value: "professional", label: "Professional", color: "bg-violet-100 text-violet-700 border-violet-200" },
  { value: "part-time", label: "Part-time", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "role-specific", label: "Role-specific", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "general", label: "General", color: "bg-slate-100 text-slate-600 border-slate-200" },
];

type ProfileStatus = {
  hasProfile: boolean;
  lastUpdated: string | null;
  profileLength: number;
  hasSummary: boolean;
  profilePreview: string | null;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CvFileIcon({ ext, size = "md" }: { ext: string; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "h-8 w-8" : size === "sm" ? "h-4 w-4" : "h-5 w-5";
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"].includes(ext))
    return <FileImage className={`${cls} text-emerald-500`} />;
  if ([".doc", ".docx"].includes(ext))
    return <FileType className={`${cls} text-blue-500`} />;
  if (ext === ".pdf")
    return <FileText className={`${cls} text-red-500`} />;
  return <File className={`${cls} text-slate-400`} />;
}

function typeLabel(ext: string) {
  if (ext === ".pdf") return "PDF";
  if (ext === ".doc") return "Word 97-2003";
  if (ext === ".docx") return "Word Document";
  if ([".jpg", ".jpeg"].includes(ext)) return "JPEG Image";
  if (ext === ".png") return "PNG Image";
  if (ext === ".webp") return "WebP Image";
  if (ext === ".gif") return "GIF Image";
  if (ext === ".bmp") return "Bitmap Image";
  return ext.toUpperCase().slice(1);
}

export default function CvPage() {
  const [files, setFiles] = useState<CvFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingNames, setUploadingNames] = useState<Set<string>>(new Set());
  const [processingNames, setProcessingNames] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [reprocessingName, setReprocessingName] = useState<string | null>(null);
  const [taggingName, setTaggingName] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus | null>(null);
  const [profileExpanded, setProfileExpanded] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const loadFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/cv");
      if (res.ok) {
        const data = (await res.json()) as { files: CvFile[] };
        setFiles(data.files ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProfileStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/cv/process");
      if (res.ok) {
        const data = (await res.json()) as ProfileStatus;
        setProfileStatus(data);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    void loadFiles();
    void loadProfileStatus();
  }, [loadFiles, loadProfileStatus]);

  const uploadFile = async (file: File) => {
    setError(null);
    setUploadingNames((prev) => new Set([...prev, file.name]));
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/cv", { method: "POST", body: form });
      const data = (await res.json()) as { error?: string; file?: { name: string }; processing?: boolean };
      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        return;
      }

      await loadFiles();

      // Show processing indicator for this file
      if (data.processing && data.file?.name) {
        setProcessingNames((prev) => new Set([...prev, data.file!.name]));
        showToast(`Uploading done! Atlas is reading your CV…`);

        // Poll profile status until updated (max 30s)
        let attempts = 0;
        const pollInterval = setInterval(async () => {
          attempts++;
          await loadProfileStatus();
          if (attempts >= 15) {
            clearInterval(pollInterval);
            setProcessingNames((prev) => {
              const next = new Set(prev);
              next.delete(data.file!.name);
              return next;
            });
            showToast("✅ Profile updated from your CV", "success");
          }
        }, 2000);

        // Also check on next profile status load
        setTimeout(async () => {
          clearInterval(pollInterval);
          await loadProfileStatus();
          setProcessingNames((prev) => {
            const next = new Set(prev);
            next.delete(data.file!.name);
            return next;
          });
          showToast("✅ Atlas has read your CV and updated your profile!", "success");
        }, 8000);
      }
    } catch {
      setError("Upload failed. Check network.");
    } finally {
      setUploadingNames((prev) => {
        const next = new Set(prev);
        next.delete(file.name);
        return next;
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    for (const file of Array.from(e.target.files)) void uploadFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    for (const file of Array.from(e.dataTransfer.files)) void uploadFile(file);
  };

  const handleDelete = async (name: string) => {
    setDeletingName(name);
    try {
      const res = await fetch(`/api/cv?name=${encodeURIComponent(name)}`, { method: "DELETE" });
      if (res.ok) setFiles((prev) => prev.filter((f) => f.name !== name));
      else setError("Delete failed.");
    } catch {
      setError("Delete failed.");
    } finally {
      setDeletingName(null);
    }
  };

  const handleTagChange = async (name: string, tag: CvTag) => {
    setTaggingName(name);
    try {
      await fetch("/api/cv", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, tag }) });
      setFiles((prev) => prev.map((f) => f.name === name ? { ...f, tag } : f));
    } catch {
      showToast("Failed to update tag", "error");
    } finally {
      setTaggingName(null);
    }
  };

  const handleReprocess = async (name: string) => {
    setReprocessingName(name);
    try {
      const res = await fetch(`/api/cv/process?name=${encodeURIComponent(name)}`, { method: "POST" });
      const data = (await res.json()) as { success: boolean; profileSummary?: string; error?: string };
      if (res.ok && data.success) {
        await loadProfileStatus();
        showToast(`✅ Profile re-built: ${data.profileSummary?.slice(0, 80) ?? "Done"}`);
      } else {
        showToast(data.error ?? "Reprocess failed", "error");
      }
    } catch {
      showToast("Reprocess failed. Check network.", "error");
    } finally {
      setReprocessingName(null);
    }
  };

  const isUploading = uploadingNames.size > 0;
  const isProcessing = processingNames.size > 0;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-8">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-3 rounded-2xl border px-5 py-3 text-sm font-medium shadow-xl backdrop-blur transition-all ${
            toast.type === "success"
              ? "border-emerald-100 bg-emerald-50 text-emerald-800"
              : "border-red-100 bg-red-50 text-red-700"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 flex-none" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-none" />
          )}
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 flex-none opacity-60 hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900">My CV</h1>
        <p className="mt-1 text-sm text-muted">
          Upload your CVs in any format. Atlas reads them, builds your profile, scores jobs against it, and gives upgrade tips.
        </p>
      </div>

      {/* Profile Status */}
      {(profileStatus?.hasProfile || isProcessing) && (
        <div className={`rounded-2xl border p-4 ${isProcessing ? "border-cyan-100 bg-cyan-50/60" : "border-emerald-100 bg-emerald-50/60"}`}>
          <button
            onClick={() => setProfileExpanded((v) => !v)}
            className="flex w-full items-center justify-between"
          >
            <div className="flex items-center gap-2.5">
              {isProcessing ? (
                <Loader2 className="h-5 w-5 text-cyan-500 animate-spin" />
              ) : (
                <Brain className="h-5 w-5 text-emerald-500" />
              )}
              <div className="text-left">
                <p className={`text-sm font-bold ${isProcessing ? "text-cyan-800" : "text-emerald-800"}`}>
                  {isProcessing ? "Atlas is reading your CV…" : "✅ Profile Active"}
                </p>
                {profileStatus?.lastUpdated && !isProcessing && (
                  <p className="text-xs text-emerald-600">
                    Last updated {formatDate(profileStatus.lastUpdated)}
                  </p>
                )}
              </div>
            </div>
            {profileStatus?.profilePreview && (
              profileExpanded ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />
            )}
          </button>
          {profileExpanded && profileStatus?.profilePreview && (
            <div className="mt-3 rounded-xl bg-white/70 border border-emerald-100 px-4 py-3 max-h-96 overflow-y-auto">
              <p className="text-xs text-slate-600 font-mono leading-relaxed whitespace-pre-wrap">
                {profileStatus.profilePreview}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-8 py-12 transition-all duration-200 ${
          isDragging
            ? "border-cyan-400 bg-cyan-50/80 scale-[1.01]"
            : "border-slate-200 bg-white/60 hover:border-cyan-300 hover:bg-cyan-50/30"
        }`}
      >
        <div className={`rounded-2xl p-4 ${isDragging ? "bg-cyan-100" : "bg-slate-100"}`}>
          <Upload className={`h-8 w-8 ${isDragging ? "text-cyan-500" : "text-slate-400"}`} />
        </div>
        <div className="text-center">
          <p className={`text-base font-semibold ${isDragging ? "text-cyan-700" : "text-slate-700"}`}>
            {isUploading ? (
              <span className="text-cyan-600">Uploading… please wait</span>
            ) : (
              <>
                Drop your CV here, or{" "}
                <span className="text-cyan-600 underline underline-offset-2">browse files</span>
              </>
            )}
          </p>
          <p className="mt-1 text-xs text-muted">PDF · DOC · DOCX · JPG · PNG · WebP · GIF · up to 10 MB</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.gif,.bmp"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          <X className="h-4 w-4 mt-0.5 flex-none" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="flex-none text-red-400 hover:text-red-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Uploading indicator */}
      {isUploading && (
        <div className="space-y-1.5">
          {[...uploadingNames].map((name) => (
            <div key={name} className="flex items-center gap-3 rounded-xl border border-cyan-100 bg-cyan-50/60 px-4 py-3 text-sm">
              <Loader2 className="h-4 w-4 text-cyan-500 animate-spin" />
              <span className="font-medium text-cyan-700 truncate">{name}</span>
              <span className="text-xs text-cyan-500 ml-auto">Uploading…</span>
            </div>
          ))}
        </div>
      )}

      {/* File list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700">
            Uploaded Files
            {files.length > 0 && (
              <span className="ml-2 rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-semibold text-cyan-700">
                {files.length}
              </span>
            )}
          </h2>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/50 py-12 text-center">
            <FileText className="h-10 w-10 text-slate-300" />
            <div>
              <p className="font-semibold text-slate-500">No CVs uploaded yet</p>
              <p className="mt-1 text-xs text-muted">Upload your first CV above to get started</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {files.map((f) => {
              const isFileProcessing = processingNames.has(f.name);
              return (
                <div
                  key={f.name}
                  className="group flex items-center gap-4 rounded-2xl border border-white/60 bg-white/70 px-5 py-4 shadow-sm backdrop-blur transition hover:shadow-md"
                >
                  <div className="flex-none">
                    <CvFileIcon ext={f.ext} size="lg" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900 truncate">
                        {f.originalName ?? f.name}
                      </p>
                      {isFileProcessing && (
                        <span className="flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-semibold text-cyan-700">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Reading…
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-muted flex-wrap">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                        {typeLabel(f.ext)}
                      </span>
                      <span>·</span>
                      <span>{formatBytes(f.size)}</span>
                      <span>·</span>
                      <span>Uploaded {formatDate(f.uploadedAt)}</span>
                    </div>
                    {/* Tag selector */}
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      <Tag className="h-3 w-3 text-muted flex-none" />
                      {CV_TAGS.map((t) => (
                        <button
                          key={t.value}
                          onClick={() => void handleTagChange(f.name, t.value)}
                          disabled={taggingName === f.name}
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-all ${
                            f.tag === t.value
                              ? t.color + " shadow-sm scale-105"
                              : "bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600"
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => void handleReprocess(f.name)}
                      disabled={reprocessingName === f.name}
                      title="Re-read this CV to update profile"
                      className="rounded-xl border border-transparent p-2.5 text-muted hover:border-cyan-100 hover:bg-cyan-50 hover:text-cyan-600 transition-all disabled:opacity-50"
                    >
                      {reprocessingName === f.name ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => void handleDelete(f.name)}
                      disabled={deletingName === f.name}
                      title="Delete CV"
                      className="rounded-xl border border-transparent p-2.5 text-muted hover:border-red-100 hover:bg-red-50 hover:text-red-500 transition-all disabled:opacity-50"
                    >
                      {deletingName === f.name ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Atlas hint */}
      <div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 px-5 py-4 text-sm text-cyan-800 space-y-2">
        <p className="font-semibold">🤖 How Atlas uses your CV</p>
        <ul className="text-xs text-cyan-700 leading-relaxed space-y-1 ml-2">
          <li>• <strong>Auto-Profile:</strong> Extracts your skills, experience & goals into a structured profile</li>
          <li>• <strong>Job Scoring:</strong> Scores every discovered job 1-100 against your background</li>
          <li>• <strong>Upgrade Tips:</strong> After every search, highlights skills that appear in jobs but are missing from your CV</li>
          <li>• <strong>Smart Injection:</strong> Full profile shared at the start of every chat and every 7th message</li>
        </ul>
      </div>
    </div>
  );
}
