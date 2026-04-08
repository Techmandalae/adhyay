"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/Input";
import { buildUsernameSuggestions, generateUsername, sanitizeUsername } from "@/lib/username";

type UsernameResponse = {
  available: boolean;
  suggestions?: string[];
};

export function UsernameField({
  sourceName,
  label = "Username",
  disabled = false,
  onValueChange
}: {
  sourceName: string;
  label?: string;
  disabled?: boolean;
  onValueChange?: (value: string) => void;
}) {
  const generatedUsername = useMemo(() => generateUsername(sourceName), [sourceName]);
  const [manualUsername, setManualUsername] = useState("");
  const [hasManualOverride, setHasManualOverride] = useState(false);
  const [availability, setAvailability] = useState<{
    state: "idle" | "checking" | "available" | "unavailable" | "error";
    suggestions: string[];
  }>({
    state: "idle",
    suggestions: []
  });
  const username = hasManualOverride ? manualUsername : generatedUsername;
  const lastUsername = useRef(username);

  useEffect(() => {
    onValueChange?.(username);
  }, [onValueChange, username]);

  useEffect(() => {
    if (!username) {
      lastUsername.current = username;
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      if (lastUsername.current !== username) {
        setAvailability((current) => ({
          state: "checking",
          suggestions: current.suggestions
        }));
      }
      lastUsername.current = username;

      try {
        const response = await fetch(
          `/api/auth/check-username?username=${encodeURIComponent(username)}`,
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal
          }
        );
        const payload = (await response.json()) as UsernameResponse;
        setAvailability({
          state: payload.available ? "available" : "unavailable",
          suggestions: payload.suggestions ?? buildUsernameSuggestions(username)
        });
      } catch {
        if (controller.signal.aborted) {
          return;
        }
        setAvailability({
          state: "error",
          suggestions: buildUsernameSuggestions(username)
        });
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [username]);

  return (
    <div className="space-y-2">
      <Input
        label={label}
        value={username}
        onChange={(event) => {
          setHasManualOverride(true);
          setManualUsername(sanitizeUsername(event.target.value));
          setAvailability({ state: "idle", suggestions: [] });
        }}
        disabled={disabled}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder={generatedUsername || "username"}
        helperText="Generated from your name. You can edit it."
      />
      {availability.state === "checking" ? (
        <p className="text-xs text-ink-soft">Checking username availability...</p>
      ) : null}
      {availability.state === "available" && username ? (
        <p className="text-xs text-emerald-700">Username is available</p>
      ) : null}
      {availability.state === "unavailable" ? (
        <div className="space-y-2">
          <p className="text-xs text-rose-700">Username already exists</p>
          <div className="flex flex-wrap gap-2">
            {availability.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-foreground transition hover:border-accent"
                onClick={() => {
                  setHasManualOverride(true);
                  setManualUsername(suggestion);
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {availability.state === "error" ? (
        <p className="text-xs text-ink-soft">
          Availability check is temporarily unavailable. You can still continue.
        </p>
      ) : null}
    </div>
  );
}
