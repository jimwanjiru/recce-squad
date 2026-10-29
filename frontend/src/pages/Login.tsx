import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, ArrowRight, LockKeyhole } from "lucide-react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { ErrorNotice } from "../components/shared";
export function Login() {
  const cache = useQueryClient();
  const [error, setError] = useState<unknown>();
  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = useForm<{ email: string; password: string }>();
  return (
    <main className="login">
      <section className="login-brand">
        <div className="brand-symbol">
          <ShieldCheck size={34} />
        </div>
        <p className="eyebrow">RECCE TACTICAL SUB-UNIT</p>
        <h1>
          People.
          <br />
          Service.
          <br />
          <span>Accountability.</span>
        </h1>
        <p>A clear, secure record of every officer’s service.</p>
        <div className="login-foot">
          <LockKeyhole size={16} /> Authorized personnel access only
        </div>
      </section>
      <section className="login-panel">
        <form
          onSubmit={handleSubmit(async (data) => {
            setError(undefined);
            try {
              await api("/auth/login", { method: "POST", body: data });
              await cache.invalidateQueries({ queryKey: ["session"] });
            } catch (error) {
              setError(error);
            }
          })}
        >
          <div className="login-emblem">
            <ShieldCheck size={27} />
          </div>
          <p className="eyebrow">PERSONNEL MANAGEMENT</p>
          <h2>Welcome back</h2>
          <p className="muted">Sign in to access the officers register.</p>
          {Boolean(error) && <ErrorNotice error={error} />}
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="you@organization.go.ke"
            {...register("email", { required: "Enter your email address." })}
          />
          {errors.email && (
            <span role="alert" className="field-error">
              {errors.email.message}
            </span>
          )}
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register("password", { required: "Enter your password." })}
          />
          {errors.password && (
            <span role="alert" className="field-error">
              {errors.password.message}
            </span>
          )}
          <Button type="submit" disabled={isSubmitting} className="w-full mt-6">
            {isSubmitting ? "Signing in…" : "Sign in securely"}
            <ArrowRight size={16} />
          </Button>
          <p className="login-help">
            Access is managed by your system administrator.
          </p>
        </form>
        <div className="login-copyright">RECCE · Personnel Register</div>
      </section>
    </main>
  );
}
