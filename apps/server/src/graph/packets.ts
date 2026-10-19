import { LIMITS, type Packet } from '@netsim/shared';

/** Split a message into fixed-size packets. Uses code points so emoji are never cut in half. */
export function toPackets(message: string, size: number = LIMITS.packetPayloadSize): Packet[] {
  const chars = Array.from(message);
  const packets: Packet[] = [];
  for (let i = 0; i < chars.length; i += size) {
    const seq = packets.length;
    packets.push({ id: `pkt-${seq}`, seq, payload: chars.slice(i, i + size).join('') });
  }
  return packets;
}
