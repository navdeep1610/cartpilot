"use client";

import { LockKeyhole } from "lucide-react";
import { useActionState } from "react";
import { loginMerchant, type MerchantLoginState } from "@/app/merchant/login/actions";

const initialState: MerchantLoginState = { error: null };

export function MerchantLoginForm({ destination, disabled }: { destination: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(loginMerchant, initialState);

  return (
    <form className="merchant-login-form" action={action}>
      <input type="hidden" name="next" value={destination} />
      <label>
        <span>Merchant email</span>
        <input name="email" type="email" autoComplete="username" required disabled={disabled || pending} />
      </label>
      <label>
        <span>Password</span>
        <input name="password" type="password" autoComplete="current-password" required disabled={disabled || pending} />
      </label>
      {state.error && <p className="merchant-login-error" role="alert">{state.error}</p>}
      <button type="submit" disabled={disabled || pending}>
        <LockKeyhole size={17} aria-hidden="true" />
        {pending ? "Checking securely..." : "Sign in to merchant portal"}
      </button>
    </form>
  );
}
