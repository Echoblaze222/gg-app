# AI-4 dependency request 1: fast-check

Package: `fast-check`, as a dev dependency, exact pinned.

Why: the main payment safety property is that any ordering and repetition of taps, webhooks, callbacks and reconcile runs for one attempt gives at most one ledger credit and only legal state transitions. Hand written cases cannot cover the interleavings. Property based tests can, and they shrink a failure to a minimal sequence.

Version: pick the latest stable release that is at least 14 days old, per the shared supply chain rule. Cost: free, MIT licensed.

What I assumed: until it is installed, M1 uses hand written cases and I add the property tests when the package lands. Deadline impact: needed before M3.
