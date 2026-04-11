"use client";

import { motion } from "framer-motion";

export function GenerationLoader({ label }: { label?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
      animate={{ opacity: 1, backdropFilter: "blur(8px)" }}
      exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(245,242,237,0.72)] px-6"
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.32, ease: "easeOut" }}
        className="relative w-full max-w-lg overflow-hidden rounded-[calc(var(--radius)+10px)] border border-[rgba(228,217,204,0.9)] bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(245,237,229,0.96))] px-8 py-10 text-center shadow-[0_30px_80px_rgba(27,24,20,0.22)]"
      >
        <div className="pointer-events-none absolute inset-x-10 top-0 h-24 rounded-b-full bg-[radial-gradient(circle,rgba(15,139,141,0.16),transparent_70%)]" />
        <div className="pointer-events-none absolute -right-12 top-10 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(255,107,53,0.14),transparent_68%)]" />
        <div className="relative mx-auto flex w-fit flex-col items-center gap-6">
          <div className="exam-book-scene">
            <div className="exam-book-shadow" />
            <div className="exam-book">
              <div className="exam-book-spine" />
              <div className="exam-book-cover" />
              <div className="exam-book-page exam-book-page-one" />
              <div className="exam-book-page exam-book-page-two" />
              <div className="exam-book-page exam-book-page-three" />
              <div className="exam-book-scanline" />
            </div>
          </div>
          <div className="space-y-2">
            <p className="font-display text-2xl font-semibold text-foreground">
              Generating your exam...
            </p>
            <p className="text-sm text-ink-soft">
              {label ?? "Opening books, flipping pages, and assembling the paper."}
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
