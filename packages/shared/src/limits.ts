/** Hard limits shared by client-side form validation and server-side request validation. */
export const LIMITS = {
  messageMaxLength: 140,
  fileNameMaxLength: 255,
  /** Largest file the simulator accepts, declared or uploaded: 10,000,000 bytes (10 MB). */
  fileMaxBytes: 10_000_000,
  /** Body limit for `POST /api/upload`; same as `fileMaxBytes`. */
  uploadMaxBytes: 10_000_000,
  /** Typical Ethernet MTU-sized packet. */
  packetSizeBytes: 1500,
  /** Cars for a file at the 10 MB limit; smaller files get proportionally fewer (see carCountFor). */
  maxCars: 24,
  maxDisabledIds: 64,
  maxIdLength: 32,
} as const;
