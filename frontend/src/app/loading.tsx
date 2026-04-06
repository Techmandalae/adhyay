export default function GlobalLoading() {
  return (
    <div className="app-shell min-h-screen px-6 py-16">
      <div className="mx-auto max-w-3xl rounded-[var(--radius)] bg-surface px-8 py-12 shadow-[var(--shadow)]">
        <p className="text-sm font-medium text-foreground">Loading...</p>
        <p className="mt-2 text-sm text-ink-soft">Preparing the next screen.</p>
      </div>
    </div>
  );
}
