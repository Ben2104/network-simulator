/** Hard limits shared by client-side form validation and server-side request validation. */
export const LIMITS = {
  messageMaxLength: 140,
  packetPayloadSize: 16,
  maxDisabledIds: 64,
  maxIdLength: 32,
} as const;
