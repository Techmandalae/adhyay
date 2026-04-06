export default function ProtectedLoading() {
  return (
    <div className="app-shell min-h-screen px-6 py-16">
      <div className="mx-auto max-w-4xl rounded-[var(--radius)] bg-surface px-8 py-12 shadow-[var(--shadow)]">
        <p className="text-sm font-medium text-foreground">Loading workspace...</p>
        <p className="mt-2 text-sm text-ink-soft">Fetching the latest dashboard data.</p>
      </div>
    </div>
  );
}
