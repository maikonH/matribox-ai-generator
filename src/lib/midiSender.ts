// Web MIDI real-time sender for the Matribox II Pro.
//
// Auto-connects to the first USB-MIDI output whose name contains
// "Matribox II Pro" (case-insensitive) and exposes a tiny API to push
// Control Change (CC) messages to the pedalboard in real time. The pedalboard
// applies every CC immediately to its live RAM — nothing is written to Flash
// until the musician presses the physical SAVE button on the unit.

let cachedOutput: MIDIOutput | null = null;

const DEVICE_NAME = 'matribox ii pro';

export interface MidiConnectionState {
  output: MIDIOutput | null;
  deviceName: string | null;
}

/**
 * Request MIDI access and locate the Matribox II Pro output. Returns the
 * opened MIDIOutput. Throws if Web MIDI is unsupported or no matching device
 * is found.
 */
export async function connectMatribox(): Promise<MIDIOutput> {
  if (!navigator.requestMIDIAccess) {
    throw new Error(
      'Este navegador não suporta Web MIDI. Use Chrome ou Edge no desktop.',
    );
  }

  const access = await navigator.requestMIDIAccess({ sysex: true });

  const candidates: MIDIOutput[] = [];
  access.outputs.forEach((out) => {
    const name = (out.name ?? '').toLowerCase();
    if (name.includes(DEVICE_NAME)) {
      candidates.push(out);
    }
  });

  if (candidates.length === 0) {
    throw new Error(
      'Pedaleira Matribox II Pro não encontrada. Conecte-a via USB e tente novamente.',
    );
  }

  const matched = candidates[0];
  await matched.open();
  cachedOutput = matched;
  return matched;
}

/** Return the currently connected output, if any. */
export function getOutput(): MIDIOutput | null {
  return cachedOutput;
}

/** Send a single Control Change message (status 0xB0, controller, value). */
export function sendCC(output: MIDIOutput, cc: number, value: number): void {
  const clamped = Math.min(127, Math.max(0, Math.round(value)));
  output.send([0xb0, cc, clamped]);
}

/** Send a batch of CC messages with a small delay between each. */
export async function sendCCBatch(
  output: MIDIOutput,
  commands: { cc: number; value: number }[],
  delayMs = 20,
): Promise<void> {
  for (const cmd of commands) {
    sendCC(output, cmd.cc, cmd.value);
    if (delayMs > 0) await sleep(delayMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
