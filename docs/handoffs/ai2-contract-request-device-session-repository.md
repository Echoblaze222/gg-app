# Contract request: DeviceSessionRepository (AI-2 to Integrator, AI-1)

Why: `AuthService.listDevices` and `revokeDevice` (frozen in `contracts/services.ts`) need a store for sessions and devices. `ownership.md` assigns "sessions and devices" to AI-2 after AI-1 creates the table, but `contracts/repositories.ts` has no repository for it.

Needed (additive, minor version bump):
```ts
export interface DeviceSessionRepository {
  /** Called on login and refresh. sessionId is the `session_id` claim of the access token. */
  upsert(input: { sessionId: string; memberId: Uuid; deviceLabel: string; ip: string | null; userAgent: string | null }): Promise<DeviceSessionRecord>;
  listActiveByMember(memberId: Uuid): Promise<DeviceSessionRecord[]>;
  getBySessionId(sessionId: string): Promise<DeviceSessionRecord | null>;
  revoke(memberId: Uuid, deviceId: Uuid): Promise<boolean>;
  revokeAllExcept(memberId: Uuid, keepSessionId: string): Promise<number>;
}
```
`DeviceSessionRecord`: id, sessionId, memberId, deviceLabel, ip, userAgent, createdAt, lastSeenAt, revokedAt.
AI-1: table `auth_devices` in 1000 range with RLS (member can read own rows, writes only through the server role).
