"use client";

import { useState } from "react";
import { Input, type InputProps } from "@/components/ui";

/** Password input with a Show / Hide button. The button is a real 44 px target and says what it does. */
export function PasswordField({ label = "Password", ...rest }: Omit<InputProps, "type" | "trailing" | "label"> & { label?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <Input
      {...rest}
      label={label}
      type={shown ? "text" : "password"}
      trailing={
        <button
          type="button"
          className="auth__toggle"
          aria-pressed={shown}
          aria-label={shown ? "Hide password" : "Show password"}
          onClick={() => setShown((v) => !v)}
        >
          {shown ? "Hide" : "Show"}
        </button>
      }
    />
  );
}
