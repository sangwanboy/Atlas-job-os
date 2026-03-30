export default function Loading() {
  return (
    <div className="flex h-full w-full animate-pulse flex-col gap-4 p-6">
      <div suppressHydrationWarning className="h-8 w-48 rounded-lg bg-white/60" />
      <div suppressHydrationWarning className="h-4 w-72 rounded bg-white/50" />
      <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div suppressHydrationWarning key={i} className="h-24 rounded-2xl bg-white/60" />
        ))}
      </div>
      <div suppressHydrationWarning className="mt-2 h-64 rounded-2xl bg-white/60" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div suppressHydrationWarning className="h-48 rounded-2xl bg-white/60" />
        <div suppressHydrationWarning className="h-48 rounded-2xl bg-white/60" />
      </div>
    </div>
  );
}
