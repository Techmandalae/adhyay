import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default async function SetPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  return <ResetPasswordForm token={params.token ?? null} />;
}
