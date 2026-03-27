"use client";

import { useEffect, useState } from "react";

import { RequireRole } from "@/components/auth/RequireRole";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { MetricGrid } from "@/components/analytics/MetricGrid";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBlock } from "@/components/ui/StatusBlock";
import {
  approveSchool,
  getPlatformOverview,
  listPlatformSchools,
  suspendSchool,
  type PlatformOverview,
  type PlatformSchool
} from "@/lib/api";

type AsyncState<T> = {
  status: "idle" | "loading" | "error" | "success";
  data: T | null;
  error?: string;
};

export default function PlatformDashboard() {
  const { token } = useAuth();
  const [schoolsState, setSchoolsState] = useState<AsyncState<PlatformSchool[]>>({
    status: "idle",
    data: null
  });
  const [overviewState, setOverviewState] = useState<AsyncState<PlatformOverview>>({
    status: "idle",
    data: null
  });
  const [limitOverrides, setLimitOverrides] = useState<Record<string, string>>({});

  const loadSchools = async () => {
    if (!token) return;
    setSchoolsState({ status: "loading", data: null });
    try {
      const response = await listPlatformSchools(token);
      setSchoolsState({ status: "success", data: response.items });
    } catch (error) {
      setSchoolsState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to load schools"
      });
    }
  };

  const loadOverview = async () => {
    if (!token) return;
    setOverviewState({ status: "loading", data: null });
    try {
      const response = await getPlatformOverview(token);
      setOverviewState({ status: "success", data: response });
    } catch (error) {
      setOverviewState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to load platform overview"
      });
    }
  };

  useEffect(() => {
    void loadSchools();
    void loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleApprove = async (schoolId: string) => {
    if (!token) return;
    const limitValue = limitOverrides[schoolId];
    const limit = limitValue ? Number(limitValue) : undefined;
    await approveSchool(token, schoolId, Number.isFinite(limit) ? limit : undefined);
    await loadSchools();
  };

  const handleSuspend = async (schoolId: string) => {
    if (!token) return;
    await suspendSchool(token, schoolId);
    await loadSchools();
  };

  return (
    <RequireRole roles={["SUPER_ADMIN"]}>
      <div className="mx-auto grid max-w-6xl gap-8">
        <SectionHeader
          eyebrow="Platform"
          title="Platform dashboard"
          subtitle="Approve schools and monitor platform-wide adoption and AI usage."
        />

        <Card className="space-y-4">
          <div className="flex gap-3">
            <Button onClick={loadOverview} disabled={!token}>
              Refresh overview
            </Button>
          </div>
          {overviewState.status === "error" ? (
            <StatusBlock tone="negative" title="Overview failed" description={overviewState.error ?? ""} />
          ) : null}
          {overviewState.data ? (
            <MetricGrid
              metrics={[
                { label: "Schools registered", value: overviewState.data.schoolsRegistered, tone: "accent" },
                { label: "Teachers registered", value: overviewState.data.teachersRegistered, tone: "cool" },
                { label: "Exams generated", value: overviewState.data.examsGenerated, tone: "warm" },
                { label: "AI requests", value: overviewState.data.aiUsage.totalRequests }
              ]}
            />
          ) : null}
          {overviewState.data ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-border bg-white/70 p-4 text-sm">
                <p className="font-semibold">Total AI tokens</p>
                <p className="mt-2 text-xl font-semibold">{overviewState.data.aiUsage.totalTokens}</p>
              </div>
              <div className="rounded-2xl border border-border bg-white/70 p-4 text-sm">
                <p className="font-semibold">Prompt tokens</p>
                <p className="mt-2 text-xl font-semibold">{overviewState.data.aiUsage.promptTokens}</p>
              </div>
              <div className="rounded-2xl border border-border bg-white/70 p-4 text-sm">
                <p className="font-semibold">Completion tokens</p>
                <p className="mt-2 text-xl font-semibold">{overviewState.data.aiUsage.completionTokens}</p>
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="space-y-4">
          <Button onClick={loadSchools} disabled={!token}>
            Refresh schools
          </Button>
          {schoolsState.status === "error" ? (
            <StatusBlock tone="negative" title="Load failed" description={schoolsState.error ?? ""} />
          ) : null}
          {schoolsState.data?.length ? (
            <div className="grid gap-3">
              {schoolsState.data.map((school) => (
                <div key={school.id} className="rounded-2xl border border-border bg-white/70 p-4">
                  <p className="text-sm font-semibold">{school.name}</p>
                  <p className="text-xs text-ink-soft">{school.email}</p>
                  <p className="mt-2 text-xs text-ink-soft">Status: {school.status}</p>
                  <p className="mt-1 text-xs text-ink-soft">
                    AI Monthly Limit: {school.aiMonthlyLimit}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                    <Input
                      label="AI limit"
                      type="number"
                      value={limitOverrides[school.id] ?? String(school.aiMonthlyLimit)}
                      onChange={(event) =>
                        setLimitOverrides({ ...limitOverrides, [school.id]: event.target.value })
                      }
                    />
                    <Button onClick={() => handleApprove(school.id)}>Approve</Button>
                    <Button variant="outline" onClick={() => handleSuspend(school.id)}>
                      Suspend
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-soft">No schools found.</p>
          )}
        </Card>
      </div>
    </RequireRole>
  );
}
