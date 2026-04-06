"use client";

import { motion } from "framer-motion";

export function GenerationLoader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-[var(--radius)] border border-border bg-white/80 px-6 py-10 text-center">
      <motion.div
        animate={{ rotate: 360, scale: [1, 1.08, 1] }}
        transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
        className="h-20 w-20 rounded-full border-4 border-accent border-t-transparent shadow-[0_18px_30px_rgba(255,107,53,0.25)]"
      />
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Generating exam</p>
        <p className="text-sm text-ink-soft">{label ?? "Building the paper and answer key."}</p>
      </div>
    </div>
  );
}
