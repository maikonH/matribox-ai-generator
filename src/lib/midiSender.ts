// Web MIDI sender for the Matribox II Pro — bulk-dump (matrix replacement) mode.
//
// The pedalboard accepts a single SysEx "bulk dump" that replaces the whole
// effect matrix in RAM at once (the same model the official QME-200 editor uses
// when it writes a preset). The real on-wire signature, confirmed by USBPcap
// capture, is the SysEx message:
//
//   F0 21 25 4D 50 00  <96-byte parameter matrix>  <XOR checksum>  F7
//
// IMPORTANT — the 04 / 05 bytes seen in the Wireshark capture are NOT part of
// the MIDI message. They are the USB-MIDI 1.0 "Code Index Number" (CIN) that
// the OS USB-MIDI driver prefixes every 4-byte event packet with:
//
//   [04 F0 21 25] [04 4D 50 00] [04 .. .. ] ... [05 F7 00 00]
//     ^CIN            ^CIN         ^CIN            ^CIN(end,1 byte)
//
// Web MIDI's output.send() operates at the MIDI-message layer: we hand it the
// raw SysEx (F0 … F7) and the driver performs the 3-byte-slice + CIN-prefix
// framing itself. Re-adding 04/05 ourselves would double-encapsulate and the
// device would receive garbage. toUsbMidiBlocks() below reproduces the exact
// 4-byte packet array the driver emits, purely for on-screen verification that
// our bytes match the capture — it is never sent through output.send().

let cachedOutput: MIDIOutput | null = null;

const DEVICE_NAME = 'matribox ii pro';

export interface MidiConnectionState {
  output: MIDIOutput | null;
  deviceName: string | null;
}

/**
 * Request MIDI access and locate the Matribox II Pro output. Returns the
 * opened MIDIOutput. Throws if Web MIDI is unsupported or no matching device
 * is found. Syssex access is requested so bulk dumps can be sent.
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

/**
 * Send a raw SysEx message. `bytes` must already include the F0 … F7 framing.
 * This is the call used for the bulk-dump matrix replacement: the OS driver
 * slices the message into 4-byte USB-MIDI event packets automatically.
 */
export function sendSysEx(output: MIDIOutput, bytes: number[]): void {
  output.send(bytes);
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

// ── USB-MIDI event-packet encoder (diagnostic / verification only) ─────────────
//
// Reproduces the 4-byte USB-MIDI 1.0 event-packet stream the OS driver emits
// for a given SysEx, so the app can display the exact wire bytes and confirm
// they match a Wireshark/USBPcap capture. The CIN (first byte of each packet)
// is determined by where F7 lands:
//
//   0x04 — SysEx start or continue (a full 3-byte group not containing F7)
//   0x07 — SysEx end with 3 bytes  ([b1, b2, F7])
//   0x06 — SysEx end with 2 bytes  ([b1, F7, 0x00])
//   0x05 — SysEx end with 1 byte   ([F7, 0x00, 0x00])
//
// The capture's `05 F7 00 00` footer is simply the 0x05 case — it appears when
// the total SysEx length ≡ 1 (mod 3). It is a function of message length, not
// a fixed signature, so a different preset length yields a 0x06 or 0x07 footer;
// all three are valid and accepted by the device.

export function toUsbMidiBlocks(sysex: number[]): number[][] {
  if (sysex.length === 0 || sysex[0] !== 0xf0) {
    throw new Error('toUsbMidiBlocks: a SysEx starting with 0xF0 is required.');
  }

  const blocks: number[][] = [];
  for (let i = 0; i < sysex.length; i += 3) {
    const chunk = sysex.slice(i, i + 3);
    let cin: number;
    if (chunk.length === 3 && chunk[2] !== 0xf7) {
      cin = 0x04; // start or continue
    } else if (chunk.length === 3) {
      cin = 0x07; // [b, b, F7]
    } else if (chunk.length === 2) {
      cin = 0x06; // [b, F7] -> pad one zero
    } else {
      cin = 0x05; // [F7] -> pad two zeros
    }

    const packet = [cin, ...chunk];
    while (packet.length < 4) packet.push(0x00); // pad short tail packets
    blocks.push(packet);
  }
  return blocks;
}

/** Render a block array as a space-separated hex string (e.g. "04 F0 21 25 …"). */
export function formatBlocksHex(blocks: number[][]): string {
  return blocks
    .map((b) => b.map((x) => x.toString(16).padStart(2, '0').toUpperCase()).join(' '))
    .join(' ');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
