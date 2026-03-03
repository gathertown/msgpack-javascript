// Extension type 0 for undefined values
// This is compatible with msgpackr's wire format, which uses fixext1 type 0 to represent undefined.
// See: https://github.com/kriszyp/msgpackr

export const EXT_UNDEFINED = 0;

export function encodeUndefinedExtension(object: unknown): Uint8Array | null {
  if (object === undefined) {
    return new Uint8Array(1); // single zero byte, encoded as fixext1 type 0
  }
  return null;
}

export function decodeUndefinedExtension(_data: Uint8Array): undefined {
  return undefined;
}

export const undefinedExtension = {
  type: EXT_UNDEFINED,
  encode: encodeUndefinedExtension,
  decode: decodeUndefinedExtension,
};
