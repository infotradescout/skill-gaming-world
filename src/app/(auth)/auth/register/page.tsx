import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Create Account" };

export default function RegisterPage() {
  return (
    <section className="auth-card surface">
      <p className="eyebrow">Skill Gaming World</p>
      <h1>Create your account.</h1>
      <p className="muted">
        Play the real game systems now with free, valueless Play Coins. If real-money
        play launches where legally permitted, the rules, odds, scoring, and fairness
        system stay the same—the value layer is what changes.
      </p>
      <AuthForm mode="register" />
    </section>
  );
}
