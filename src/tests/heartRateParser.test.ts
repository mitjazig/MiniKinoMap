import { describe, expect, it } from 'vitest';
import { parseHeartRateMeasurement } from '../heartRate/ble/HeartRateMeasurementParser';

function view(bytes: number[]): DataView {
  return new DataView(Uint8Array.from(bytes).buffer);
}

describe('HeartRateMeasurementParser', () => {
  it('reads an 8-bit heart rate', () => {
    const parsed = parseHeartRateMeasurement(view([0x00, 142]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.bpm).toBe(142);
    expect(parsed.value.rrIntervalsMs).toEqual([]);
    expect(parsed.value.contactDetected).toBeUndefined();
  });

  it('reads a 16-bit heart rate', () => {
    const parsed = parseHeartRateMeasurement(view([0x01, 0x2c, 0x01]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.bpm).toBe(300);
  });

  it('reads sensor contact, energy, and RR intervals', () => {
    const contact = parseHeartRateMeasurement(view([0x06, 142]));
    expect(contact.ok).toBe(true);
    if (contact.ok) expect(contact.value.contactDetected).toBe(true);

    const missing = parseHeartRateMeasurement(view([0x02, 80]));
    expect(missing.ok).toBe(true);
    if (missing.ok) expect(missing.value.contactDetected).toBe(false);

    const packet = parseHeartRateMeasurement(view([0x18, 80, 0x0a, 0x00, 0x00, 0x04]));
    expect(packet.ok).toBe(true);
    if (!packet.ok) return;
    expect(packet.value.bpm).toBe(80);
    expect(packet.value.energyExpendedKj).toBe(10);
    expect(packet.value.rrIntervalsMs[0]).toBeCloseTo(1000, 5);
  });

  it('reads more than one RR interval', () => {
    const parsed = parseHeartRateMeasurement(view([0x10, 70, 0x00, 0x02, 0x00, 0x04]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.bpm).toBe(70);
    expect(parsed.value.rrIntervalsMs[0]).toBeCloseTo(500, 5);
    expect(parsed.value.rrIntervalsMs[1]).toBeCloseTo(1000, 5);
  });

  it('rejects short and truncated packets', () => {
    expect(parseHeartRateMeasurement(view([])).ok).toBe(false);
    expect(parseHeartRateMeasurement(view([0x01])).ok).toBe(false);
    expect(parseHeartRateMeasurement(view([0x10, 60])).ok).toBe(false);
    expect(parseHeartRateMeasurement(view([0x08, 100, 0x01])).ok).toBe(false);
    expect(parseHeartRateMeasurement(view([0x10, 60, 0x00])).ok).toBe(false);
  });
});
