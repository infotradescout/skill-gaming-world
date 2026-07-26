import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Log In" };

export default function LoginPage() {
  return (
    <section className="auth-card surface">
      <p className="eyebrow">Account access</p>
      <h1>Welcome back.</h1>
      <p className="muted">
        Log in to resume practice, view your records, and manage player controls.
      </p>
      <AuthForm mode="login" />
    </section>
  );
}
