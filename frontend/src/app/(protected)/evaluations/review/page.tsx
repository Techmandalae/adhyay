"use client";

import { RequireRole } from "@/components/auth/RequireRole";
import { TeacherReviewWorkspace } from "@/components/evaluations/TeacherReviewWorkspace";

export default function ReviewEvaluationsPage() {
  return (
    <RequireRole roles={["TEACHER"]}>
      <TeacherReviewWorkspace />
    </RequireRole>
  );
}
