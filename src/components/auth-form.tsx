"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type AuthMode = "login" | "register";

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const register = mode === "register";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");

    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("passwordConfirmation") ?? "");

    if (register && password !== confirmation) {
      setPending(false);
      setMessage("Passwords do not match.");
      return;
    }

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: String(data.get("email") ?? ""),
          password,
          displayName: register ? String(data.get("displayName") ?? "") : undefined,
          acceptPlayCoinTerms: register ? data.get("termsAccepted") === "on" : undefined,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string | { code?: string; message?: string }; message?: string }
          | null;
        const apiMessage =
          typeof body?.error === "object" ? body.error.message : body?.error;
        setMessage(body?.message ?? apiMessage ?? "Account access could not be completed.");
        return;
      }

      router.push(register ? "/app?welcome=1" : "/app");
      router.refresh();
    } catch {
      setMessage("Account services are not reachable. Your form was not submitted.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {register ? (
        <div className="field">
          <label htmlFor="displayName">Display name</label>
          <input id="displayName" name="displayName" autoComplete="nickname" required />
          <span className="field-hint">
            This is the name shown on your own account and future public rankings.
          </span>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <div className="password-field">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete={register ? "new-password" : "current-password"}
            minLength={12}
            required
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        {register ? <span className="field-hint">Use at least 12 characters.</span> : null}
      </div>
      {register ? (
        <>
          <div className="field">
            <label htmlFor="passwordConfirmation">Confirm password</label>
            <input
              id="passwordConfirmation"
              name="passwordConfirmation"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={12}
              required
            />
          </div>
          <label className="check-field">
            <input name="termsAccepted" type="checkbox" required />
            <span>
              I accept the <Link href="/legal/terms">platform terms</Link> and{" "}
              <Link href="/legal/play-coins">Play Coin terms</Link>.
            </span>
          </label>
        </>
      ) : (
        <div className="auth-form-meta">
          <span className="field-hint">
            Sessions use a fixed seven-day secure-cookie lifetime in safe demo.
          </span>
          <Link href="/account">Need account help?</Link>
        </div>
      )}
      {message ? (
        <p className="form-message" role="alert">
          {message}
        </p>
      ) : null}
      <button className="button button-primary" disabled={pending} type="submit">
        {pending ? "Working…" : register ? "Create account" : "Log in"}
      </button>
      <p className="auth-switch">
        {register ? "Already have an account?" : "New to Skill Gaming World?"}{" "}
        <Link href={register ? "/auth/login" : "/auth/register"}>
          {register ? "Log in" : "Create one"}
        </Link>
      </p>
    </form>
  );
}
