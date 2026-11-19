import type { AppErrorShape } from "@/contracts/errors";

export interface ErrorCopy {
  title: string;
  /** What failed. */
  message: string;
  /** Whether money moved, always stated (pack rule: failure copy). */
  moneyLine: string;
  /** What to do next, plus whether retrying is safe. */
  action: string;
  reference: string;
}

/** Turns a contract error into the four things every failure must say: what failed, whether money moved, what to do, whether retry is safe. */
export function describeError(error: AppErrorShape, title = "This did not load"): ErrorCopy {
  const moneyLine =
    error.moneyMoved === "no"
      ? "No money moved."
      : error.moneyMoved === "yes"
        ? "Money did move. Check your history before doing anything else."
        : "We are still checking whether money moved. Check your history before trying again.";
  const retry = error.retrySafe ? "It is safe to try again." : "Do not repeat this until you have checked.";
  return { title, message: error.message, moneyLine, action: `${error.action} ${retry}`, reference: error.reference };
}
