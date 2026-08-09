import type { MatriboxPreset, EffectBlock } from '../types/matribox';

const ALL_ACTIVE_SKELETON = [3,2,0,0,16,11,0,128,0,5,1,4,3,12,1,5,1,15,105,2,105,164,2,0,2,1,182,195,119,47,102,117,108,108,0,98,111,120,32,73,73,32,80,82,79,132,3,2,183,117,145,105,182,108,0,1,202,195,107,182,108,0,1,56,66,149,182,108,0,1,212,182,116,181,108,0,1,144,41,24,55,108,0,1,216,158,134,52,108,0,1,181,237,247,54,108,0,1,149,62,9,55,110,0,146,200,156,8,144,0,97,14,10,96,1,6,0,2,1,255,255,13,0,0,0,101,2,15,132,2,3,3,1,1,2,3,4,107,1,7,0,5,121,2,76,108,1,1,0,4,1,0,124,2,5,5,6,7,8,9,10,11,0,176,1,108,1,0,12,15,29,0,0,0,1,0,0,0,25,0,0,1,1,0,0,5,0,0,0,3,53,0,0,7,34,0,0,10,53,172,2,10,4,1,0,0,11,11,0,0,12,3,0,0,6,110,10,230,2,112,10,11,5,1,0,0,20,66,0,0,240,65,0,0,132,66,100,2,32,13,12,0,15,192,65,0,0,124,66,0,0,92,66,0,0,112,65,0,0,72,66,40,12,0,62,36,1,124,5,108,15,2,112,66,0,0,178,220,7,62,204,0,252,3,10,88,66,0,0,84,66,0,0,76,66,0,0,64,32,14,220,2,2,56,66,0,0,148,220,7,252,9,32,7,28,0,108,14,124,7,124,0,5,60,66,0,0,80,66,0,0,124,0,32,7,252,0,124,35,42,172,0,3,152,65,0,66,156,70,32,5,236,0,32,0,0,51,148,0,42,67,11,50,0,120,193,107,95,129,77,7,41,4,13,128,2,32,9,16,0,1,200,66,0,0,60,12,0,113,106,69,131,10,8,1,32,156,0,32,26,16,0,0,2,2,0,0,16,12,0,0,0,0,0,9,1,0,0,128,63,200,0,0,48,17,0,0];

const OFFSETS = {
  NAME_START: 29,
  NAME_LENGTH: 15,
  ROUTING_START: 119,
  ROUTING_LENGTH: 20,
} as const;

export function encodePreset(preset: MatriboxPreset): string {
  const arr = [...ALL_ACTIVE_SKELETON];

  const cleanName = preset.name.substring(0, 14);
  for (let i = 0; i < OFFSETS.NAME_LENGTH; i++) {
    arr[OFFSETS.NAME_START + i] = i < cleanName.length ? cleanName.charCodeAt(i) : 0;
  }

  for (let i = 0; i < OFFSETS.ROUTING_LENGTH; i++) {
    arr[OFFSETS.ROUTING_START + i] = i < preset.routing.length ? preset.routing[i] : 255;
  }

  Object.keys(preset.blocks).forEach((key) => {
    const blockId = Number(key);
    const block = preset.blocks[blockId];

    const blockIndex = findBlockIndexInSkeleton(arr, blockId);

    if (blockIndex !== -1) {
      arr[blockIndex + 2] = block.enabled ? 2 : 1;
      arr[blockIndex + 6] = block.fxId & 0xff;

      updateBlockFloats(arr, blockIndex, block);
    }
  });

  return btoa(JSON.stringify(arr));
}

function findBlockIndexInSkeleton(arr: number[], blockId: number): number {
  for (let i = 139; i < arr.length - 20; i++) {
    if (arr[i] === 108 && arr[i + 1] === 1 && arr[i + 11] === blockId) {
      return i;
    }
  }
  return -1;
}

function updateBlockFloats(arr: number[], blockIndex: number, block: EffectBlock): void {
  let floatMarkerIndex = -1;
  for (let i = blockIndex; i < arr.length - 4; i++) {
    if (arr[i] === 110 && arr[i + 1] === 10 && arr[i + 2] === 230 && arr[i + 3] === 2) {
      floatMarkerIndex = i;
      break;
    }
  }

  if (floatMarkerIndex !== -1) {
    const floatStartIndex = floatMarkerIndex + 9;

    block.parameters.forEach((param, index) => {
      const paramOffset = floatStartIndex + index * 4;
      if (paramOffset + 3 < arr.length) {
        const buffer = new ArrayBuffer(4);
        const view = new DataView(buffer);
        view.setFloat32(0, param.value, true);
        const floatBytes = new Uint8Array(buffer);

        arr[paramOffset + 1] = floatBytes[1];
        arr[paramOffset + 2] = floatBytes[2];
        arr[paramOffset + 3] = floatBytes[3];
      }
    });
  }
}
