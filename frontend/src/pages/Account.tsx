import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { KeyRound, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { ErrorNotice } from "../components/shared";
const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string().min(14, "Use at least 14 characters.").max(128),
    confirmation: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmation, {
    message: "The new passwords must match.",
    path: ["confirmation"],
  });
export function Account() {
  const { user } = useAuth();
  const [error, setError] = useState<unknown>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR ACCOUNT</p>
          <h1>Account settings</h1>
          <p className="muted">
            Manage your password and secure your local access.
          </p>
        </div>
      </div>
      <section className="card account-card">
        <div className="section-heading">
          <span>
            <KeyRound size={16} />
          </span>
          <div>
            <h2>Change password</h2>
            <p>{user?.email}</p>
          </div>
        </div>
        <form
          onSubmit={handleSubmit(async (data) => {
            setError(undefined);
            try {
              await api("/auth/password", {
                method: "POST",
                body: {
                  currentPassword: data.currentPassword,
                  newPassword: data.newPassword,
                },
              });
              window.dispatchEvent(new Event("auth-expired"));
            } catch (error) {
              setError(error);
            }
          })}
        >
          {Boolean(error) && <ErrorNotice error={error} />}
          <div className="form-field">
            <label htmlFor="current-password">Current password</label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              {...register("currentPassword")}
            />
            {errors.currentPassword && (
              <p className="field-error" role="alert">
                {errors.currentPassword.message}
              </p>
            )}
          </div>
          <div className="form-field">
            <label htmlFor="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              {...register("newPassword")}
            />
            {errors.newPassword && (
              <p className="field-error" role="alert">
                {errors.newPassword.message}
              </p>
            )}
          </div>
          <div className="form-field">
            <label htmlFor="confirm-password">Confirm new password</label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              {...register("confirmation")}
            />
            {errors.confirmation && (
              <p className="field-error" role="alert">
                {errors.confirmation.message}
              </p>
            )}
          </div>
          <p className="privacy-note">
            <ShieldCheck size={15} />
            Use at least 14 characters. Changing your password signs you out of
            every session.
          </p>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Updating…" : "Update password"}
          </Button>
        </form>
      </section>
    </>
  );
}
