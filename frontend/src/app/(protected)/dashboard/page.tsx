"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/AuthProvider";
import { AdminDashboard } from "@/components/dashboards/AdminDashboard";
import { StudentDashboard } from "@/components/dashboards/StudentDashboard";
import { TeacherDashboard } from "@/components/dashboards/TeacherDashboard";
import { StatusBlock } from "@/components/ui/StatusBlock";

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user?.role === "PARENT") {
      router.replace("/parent");
    }
    if (user?.role === "SUPER_ADMIN") {
      router.replace("/platform");
    }
  }, [router, user?.role]);

  if (user?.role === "TEACHER") {
    return <TeacherDashboard />;
  }

  if (user?.role === "STUDENT") {
    return <StudentDashboard />;
  }

  if (user?.role === "ADMIN") {
    return <AdminDashboard />;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <StatusBlock
        title="Redirecting"
        description="Opening the correct workspace for your account."
      />
    </div>
  );
}
