"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

export function PageFade({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      {children}
    </motion.div>
  );
}
