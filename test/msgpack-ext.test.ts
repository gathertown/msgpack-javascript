import assert from "assert";
import { encode, decode, ExtData } from "../src";

function seq(n: number) {
  const a: Array<number> = [];
  for (let i = 0; i < n; i++) {
    a.push((i + 1) % 0xff);
  }
  return Uint8Array.from(a);
}

describe("msgpack-ext", () => {
  // Use ext type 2 (not 0, which is reserved for the built-in undefined extension)
  const SPECS = {
    FIXEXT1: [0xd4, new ExtData(2, seq(1))],
    FIXEXT2: [0xd5, new ExtData(2, seq(2))],
    FIXEXT4: [0xd6, new ExtData(2, seq(4))],
    FIXEXT8: [0xd7, new ExtData(2, seq(8))],
    FIXEXT16: [0xd8, new ExtData(2, seq(16))],
    EXT8: [0xc7, new ExtData(2, seq(17))],
    EXT16: [0xc8, new ExtData(2, seq(0x100))],
    EXT32: [0xc9, new ExtData(2, seq(0x10000))],
  } as Record<string, [number, ExtData]>;

  for (const name of Object.keys(SPECS)) {
    const [msgpackType, extData] = SPECS[name]!;

    it(`preserves ExtData by decode(encode(${name}))`, () => {
      const encoded = encode(extData);
      assert.strictEqual(encoded[0], msgpackType);
      assert.deepStrictEqual(decode(encoded), extData);
    });
  }
});
