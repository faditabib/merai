"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Shared email+password form for login and signup. Supabase error messages
 * are shown as-is for now (English) — mapping them to translated messages is
 * tracked as a deferred item in PROGRESS.md.
 */
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);

    try {
      const supabase = createClient();

      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { locale },
            emailRedirectTo: `${window.location.origin}/auth/confirm`,
          },
        });
        if (signUpError) throw signUpError;
        if (data.session) {
          router.push("/dashboard");
          router.refresh();
        } else {
          // Email confirmation is enabled on the Supabase project.
          setNotice(t("checkEmail"));
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("email")}
        <input
          type="email"
          required
          autoComplete="email"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-start outline-none focus:border-accent"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("password")}
        <input
          type="password"
          required
          minLength={8}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          dir="ltr"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent"
        />
        {mode === "signup" && (
          <span className="text-xs font-normal text-muted">
            {t("passwordHint")}
          </span>
        )}
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-accent">
          {notice}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        {pending
          ? t("pending")
          : mode === "signup"
            ? t("signupButton")
            : t("loginButton")}
      </button>

      <p className="text-center text-sm text-muted">
        {mode === "signup" ? t("haveAccount") : t("noAccount")}{" "}
        <Link
          href={mode === "signup" ? "/login" : "/signup"}
          className="font-medium text-accent hover:underline"
        >
          {mode === "signup" ? t("loginTitle") : t("signupTitle")}
        </Link>
      </p>
    </form>
  );
}
