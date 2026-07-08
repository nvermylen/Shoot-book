/**
 * Shared integration error types (INTEGRATION_REGISTRY error-handling
 * contract). Thrown at the tool boundary so agent runners can distinguish
 * "credentials are dead — escalate a reconnect to the photographer" from
 * transient integration failures. Messages carry machine detail only —
 * never token material or email content (anti-pattern #11).
 */
export class IntegrationAuthError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'IntegrationAuthError';
  }
}
