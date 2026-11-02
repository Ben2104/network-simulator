/** Hard limits shared by client-side form validation and server-side request validation. */
export const LIMITS = {
  messageMaxLength: 140,
  fileNameMaxLength: 255,
  /** Declared size only; file contents never leave the browser. 1 GiB. */
  fileMaxBytes: 1024 ** 3,
  /** Typical Ethernet MTU-sized packet. */
  packetSizeBytes: 1500,
  /** Cars rendered per transfer; packets are bundled into cars beyond this. */
  maxCars: 24,
  maxDisabledIds: 64,
  maxIdLength: 32,
} as const;
