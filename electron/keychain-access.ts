export const GCP_BILLING_KEY_SERVICE = 'cloud-cost-gcp-service-account'

export function isPublicKeychainService(service: unknown): service is string {
  return typeof service === 'string' && service !== GCP_BILLING_KEY_SERVICE
}
