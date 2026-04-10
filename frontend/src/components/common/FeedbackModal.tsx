"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { StatusBlock } from "@/components/ui/StatusBlock";
import type { AuthUser } from "@/types/auth";

type FeedbackModalProps = {
  open: boolean;
  onClose: () => void;
  token: string | null;
  user: AuthUser | null;
};

export default function FeedbackModal({
  open,
  onClose,
  token,
  user
}: FeedbackModalProps) {
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setMessage("");
      setRating(5);
      setError(null);
      setLoading(false);
    }
  }, [open]);

  if (!open || !user) {
    return null;
  }

  const handleSubmit = async () => {
    if (!message.trim()) {
      setError("Feedback message is required.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          message: message.trim(),
          rating
        })
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Feedback submission failed");
      }

      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Feedback submission failed"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        className="w-full max-w-md rounded-[var(--radius)] border border-border bg-white p-6 shadow-[var(--shadow)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="feedback-title" className="text-lg font-semibold text-foreground">
          Share your feedback
        </h2>
        <p className="mt-2 text-sm text-ink-soft">
          Tell us what is working well and what should improve.
        </p>

        <div className="mt-4 grid gap-4">
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-foreground">Message</span>
            <textarea
              placeholder="Tell us your experience..."
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={2000}
              className="min-h-32 rounded-2xl border border-border bg-surface px-4 py-3 text-sm outline-none transition focus:border-accent"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-foreground">Rating</span>
            <select
              value={rating}
              onChange={(event) => setRating(Number(event.target.value))}
              className="rounded-2xl border border-border bg-surface px-4 py-2 text-sm outline-none transition focus:border-accent"
            >
              <option value={5}>Excellent</option>
              <option value={4}>Good</option>
              <option value={3}>Average</option>
              <option value={2}>Poor</option>
              <option value={1}>Bad</option>
            </select>
          </label>

          {error ? (
            <StatusBlock tone="negative" title="Unable to submit" description={error} />
          ) : null}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={loading || message.trim().length === 0}
          >
            {loading ? "Submitting..." : "Submit"}
          </Button>
        </div>
      </div>
    </div>
  );
}
