import type { Repositories } from "../../contracts/repositories";
import type { PolicyRepositoryV11, PrivacyRequestRepositoryV11, SupportRepositoryV11 } from "../../contracts/v1_1";

/**
 * The frozen `Repositories` aggregate only lists the v1.0.0 repository interfaces. The v1.1.0 methods live on
 * extension interfaces in contracts/v1_1.ts and have no aggregate yet (see docs/handoffs/ai5-contract-request-v11-followups.md).
 *
 * Until there is one, these accessors narrow the types and FAIL CLOSED: if the provider does not implement the
 * new method, the call throws, the service answers INTERNAL with the request reference, and the failure is reported.
 * Nothing silently falls back to an older behaviour.
 */
function missing(what: string): Error {
  return new Error(`${what} is not implemented by the repository provider.`);
}

export function supportRepo(repos: Repositories): SupportRepositoryV11 {
  if (typeof (repos.support as Partial<SupportRepositoryV11>).getTicket !== "function") {
    throw missing("SupportRepositoryV11.getTicket");
  }
  return repos.support as SupportRepositoryV11;
}

export function privacyRepo(repos: Repositories): PrivacyRequestRepositoryV11 {
  const candidate = repos.privacyRequests as Partial<PrivacyRequestRepositoryV11>;
  if (typeof candidate.getById !== "function" || typeof candidate.setStatus !== "function") {
    throw missing("PrivacyRequestRepositoryV11.getById and setStatus");
  }
  return repos.privacyRequests as PrivacyRequestRepositoryV11;
}

export function policyRepo(repos: Repositories): PolicyRepositoryV11 {
  if (typeof (repos.policies as Partial<PolicyRepositoryV11>).publish !== "function") {
    throw missing("PolicyRepositoryV11.publish");
  }
  return repos.policies as PolicyRepositoryV11;
}
