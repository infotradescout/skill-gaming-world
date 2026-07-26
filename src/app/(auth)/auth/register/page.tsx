import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Create Account" };

export default function RegisterPage() {
  return (
    <section className="auth-card surface">
      <p className="eyebrow">Skill Gaming World</p>
      <h1>Create your account.</h1>
      <p className="muted">
        One account for Monetaire Play. Prize and casino eligibility are separate and
        currently unavailable.
      </p>
      <AuthForm mode="register" />
    </section>
  );
}
