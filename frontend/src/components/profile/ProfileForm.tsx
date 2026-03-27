"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBlock } from "@/components/ui/StatusBlock";
import {
  changePassword,
  getProfile,
  requestEmailVerification,
  updateProfile,
  type UserProfile
} from "@/lib/api";

type AsyncState<T> = {
  status: "idle" | "loading" | "error" | "success";
  data: T | null;
  error?: string;
};

type FormState = Record<string, string>;

function getInitialForm(role?: string): FormState {
  switch (role) {
    case "TEACHER":
      return {
        fullName: "",
        email: "",
        contact: "",
        subject: "",
        location: "",
        linkedin: "",
        experience: "",
        education: ""
      };
    case "STUDENT":
      return {
        fullName: "",
        className: "",
        section: "",
        rollNumber: "",
        phoneNumber: "",
        email: "",
        location: "",
        dob: ""
      };
    default:
      return {
        fullName: "",
        email: "",
        contact: "",
        location: ""
      };
  }
}

function toForm(profile: UserProfile | null, role?: string, name?: string, email?: string): FormState {
  if (!profile) {
    const form = getInitialForm(role);
    if ("fullName" in form) form.fullName = name ?? "";
    if ("email" in form) form.email = email ?? "";
    return form;
  }

  if (profile.role === "TEACHER") {
    return {
      fullName: profile.fullName,
      email: profile.email,
      contact: profile.contact,
      subject: profile.subject,
      location: profile.location,
      linkedin: profile.linkedin,
      experience: profile.experience,
      education: profile.education
    };
  }

  if (profile.role === "STUDENT") {
    return {
      fullName: profile.fullName,
      className: profile.className,
      section: profile.section,
      rollNumber: profile.rollNumber,
      phoneNumber: profile.phoneNumber,
      email: profile.email,
      location: profile.location,
      dob: profile.dob ? profile.dob.slice(0, 10) : ""
    };
  }

  return {
    fullName: profile.fullName,
    email: profile.email,
    contact: profile.contact,
    location: profile.location
  };
}

export function ProfileForm({
  title,
  subtitle
}: {
  title: string;
  subtitle: string;
}) {
  const { token, user } = useAuth();
  const [form, setForm] = useState<FormState>(() => getInitialForm(user?.role));
  const [profileState, setProfileState] = useState<AsyncState<UserProfile>>({
    status: "idle",
    data: null
  });
  const [saveState, setSaveState] = useState<AsyncState<null>>({
    status: "idle",
    data: null
  });
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [passwordState, setPasswordState] = useState<AsyncState<null>>({
    status: "idle",
    data: null
  });
  const [verificationState, setVerificationState] = useState<AsyncState<null>>({
    status: "idle",
    data: null
  });

  useEffect(() => {
    if (!token) return;
    let isActive = true;

    const loadProfile = async () => {
      setProfileState({ status: "loading", data: null });
      try {
        const profile = await getProfile(token);
        if (!isActive) return;
        setForm(toForm(profile, user?.role, user?.name, user?.email));
        setProfileState({ status: "success", data: profile });
      } catch (error) {
        if (!isActive) return;
        setProfileState({
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : "Failed to load profile"
        });
      }
    };

    void loadProfile();
    return () => {
      isActive = false;
    };
  }, [token, user?.email, user?.name, user?.role]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;

    setSaveState({ status: "loading", data: null });
    try {
      const profile = await updateProfile(token, form);
      setForm(toForm(profile, user?.role, user?.name, user?.email));
      setProfileState({ status: "success", data: profile });
      setSaveState({ status: "success", data: null });
    } catch (error) {
      setSaveState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to save profile"
      });
    }
  };

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordState({
        status: "error",
        data: null,
        error: "New password and confirmation do not match"
      });
      return;
    }

    setPasswordState({ status: "loading", data: null });
    try {
      await changePassword(token, {
        oldPassword: passwordForm.oldPassword,
        newPassword: passwordForm.newPassword
      });
      setPasswordForm({ oldPassword: "", newPassword: "", confirmPassword: "" });
      setPasswordState({ status: "success", data: null });
    } catch (error) {
      setPasswordState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to update password"
      });
    }
  };

  const handleRequestEmailVerification = async () => {
    if (!token) return;

    setVerificationState({ status: "loading", data: null });
    try {
      const response = await requestEmailVerification(token);
      setVerificationState({
        status: "success",
        data: null,
        error: response.message
      });
    } catch (error) {
      setVerificationState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to send verification email"
      });
    }
  };

  const currentProfile = profileState.data;
  const emailVerified = currentProfile?.emailVerified ?? user?.emailVerified ?? false;

  return (
    <Card className="mx-auto max-w-2xl space-y-6">
      <SectionHeader eyebrow="Profile" title={title} subtitle={subtitle} />
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <Input
          label="Full Name"
          value={form.fullName ?? ""}
          onChange={(event) => setForm({ ...form, fullName: event.target.value })}
          required
        />
        <Input
          label="Email"
          type="email"
          value={form.email ?? ""}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          required
        />

        {user?.role === "TEACHER" ? (
          <>
            <Input
              label="Contact"
              value={form.contact ?? ""}
              onChange={(event) => setForm({ ...form, contact: event.target.value })}
              required
            />
            <Input
              label="Subject"
              value={form.subject ?? ""}
              onChange={(event) => setForm({ ...form, subject: event.target.value })}
              required
            />
            <Input
              label="Location"
              value={form.location ?? ""}
              onChange={(event) => setForm({ ...form, location: event.target.value })}
              required
            />
            <Input
              label="LinkedIn"
              value={form.linkedin ?? ""}
              onChange={(event) => setForm({ ...form, linkedin: event.target.value })}
            />
            <Input
              label="Experience"
              value={form.experience ?? ""}
              onChange={(event) => setForm({ ...form, experience: event.target.value })}
              required
            />
            <Input
              label="Education"
              value={form.education ?? ""}
              onChange={(event) => setForm({ ...form, education: event.target.value })}
              required
            />
          </>
        ) : null}

        {user?.role === "STUDENT" ? (
          <>
            <Input
              label="Class"
              value={form.className ?? ""}
              onChange={(event) => setForm({ ...form, className: event.target.value })}
              required
            />
            <Input
              label="Section"
              value={form.section ?? ""}
              onChange={(event) => setForm({ ...form, section: event.target.value })}
              required
            />
            <Input
              label="Roll Number"
              value={form.rollNumber ?? ""}
              onChange={(event) => setForm({ ...form, rollNumber: event.target.value })}
              required
            />
            <Input
              label="Phone Number"
              value={form.phoneNumber ?? ""}
              onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })}
              required
            />
            <Input
              label="Location"
              value={form.location ?? ""}
              onChange={(event) => setForm({ ...form, location: event.target.value })}
              required
            />
            <Input
              label="Date of Birth"
              type="date"
              value={form.dob ?? ""}
              onChange={(event) => setForm({ ...form, dob: event.target.value })}
              required
            />
          </>
        ) : null}

        {user?.role === "ADMIN" || user?.role === "SUPER_ADMIN" || user?.role === "PARENT" ? (
          <>
            <Input
              label="Contact"
              value={form.contact ?? ""}
              onChange={(event) => setForm({ ...form, contact: event.target.value })}
              required
            />
            <Input
              label="Location"
              value={form.location ?? ""}
              onChange={(event) => setForm({ ...form, location: event.target.value })}
              required
            />
          </>
        ) : null}

        <Button type="submit" disabled={!token || saveState.status === "loading"}>
          {saveState.status === "loading" ? "Saving..." : "Save profile"}
        </Button>
      </form>

      {saveState.status === "success" ? (
        <StatusBlock
          tone="positive"
          title="Profile updated"
          description="Your profile changes have been saved."
        />
      ) : null}

      {saveState.status === "error" ? (
        <StatusBlock
          tone="negative"
          title="Profile update failed"
          description={saveState.error ?? ""}
        />
      ) : null}

      {profileState.status === "error" ? (
        <StatusBlock
          tone="negative"
          title="Profile load failed"
          description={profileState.error ?? ""}
        />
      ) : null}

      <div className="grid gap-4">
        <SectionHeader
          eyebrow="Verification"
          title="Email verification"
          subtitle="Track verification status and trigger a fresh verification when needed."
        />
        <StatusBlock
          tone={emailVerified ? "positive" : "neutral"}
          title={emailVerified ? "Email verified" : "Email not verified"}
          description={
            emailVerified
              ? "Your email address is verified."
              : "Send a fresh verification email to confirm your account."
          }
        />
        {!emailVerified ? (
          <Button
            type="button"
            variant="outline"
            onClick={handleRequestEmailVerification}
            disabled={!token || verificationState.status === "loading"}
          >
            Send verification email
          </Button>
        ) : null}

        {verificationState.status === "success" && verificationState.error ? (
          <StatusBlock
            tone="positive"
            title="Verification updated"
            description={verificationState.error}
          />
        ) : null}

        {verificationState.status === "error" ? (
          <StatusBlock
            tone="negative"
            title="Verification failed"
            description={verificationState.error ?? ""}
          />
        ) : null}
      </div>

      <div className="grid gap-4">
        <SectionHeader
          eyebrow="Security"
          title="Change password"
          subtitle="Update your current password without leaving the profile page."
        />
        <form className="grid gap-4" onSubmit={handleChangePassword}>
          <Input
            label="Current Password"
            type="password"
            value={passwordForm.oldPassword}
            onChange={(event) =>
              setPasswordForm({ ...passwordForm, oldPassword: event.target.value })
            }
            required
          />
          <Input
            label="New Password"
            type="password"
            value={passwordForm.newPassword}
            onChange={(event) =>
              setPasswordForm({ ...passwordForm, newPassword: event.target.value })
            }
            required
          />
          <Input
            label="Confirm Password"
            type="password"
            value={passwordForm.confirmPassword}
            onChange={(event) =>
              setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })
            }
            required
          />
          <Button type="submit" disabled={!token || passwordState.status === "loading"}>
            {passwordState.status === "loading" ? "Updating..." : "Change Password"}
          </Button>
        </form>

        {passwordState.status === "success" ? (
          <StatusBlock
            tone="positive"
            title="Password updated"
            description="Your password has been changed."
          />
        ) : null}

        {passwordState.status === "error" ? (
          <StatusBlock
            tone="negative"
            title="Password update failed"
            description={passwordState.error ?? ""}
          />
        ) : null}
      </div>
    </Card>
  );
}
