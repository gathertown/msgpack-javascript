// Interop test: verify wire-protocol compatibility between @gathertown/msgpack and msgpackr
import assert from "assert";
import { encode, decode } from "../src";
import { unpack, Packr } from "msgpackr";

describe("msgpackr interop", () => {
  const packr = new Packr({ useRecords: false });

  context("undefined encoding", () => {
    it("@gathertown/msgpack encode → msgpackr decode: bare undefined", () => {
      const encoded = encode(undefined);
      const decoded = unpack(encoded);
      assert.strictEqual(decoded, undefined);
    });

    it("msgpackr encode → @gathertown/msgpack decode: bare undefined", () => {
      const encoded = packr.pack(undefined);
      const decoded = decode(encoded);
      assert.strictEqual(decoded, undefined);
    });

    it("wire format matches for undefined", () => {
      const gtEncoded = encode(undefined);
      const mrEncoded = packr.pack(undefined);
      const mrBytes = new Uint8Array(mrEncoded.buffer, mrEncoded.byteOffset, mrEncoded.byteLength);
      assert.deepStrictEqual(Array.from(gtEncoded), Array.from(mrBytes));
    });
  });

  context("objects with undefined values", () => {
    it("@gathertown/msgpack encode → msgpackr decode", () => {
      const obj = { a: 1, b: undefined, c: "hello" };
      const encoded = encode(obj);
      const decoded = unpack(encoded) as any;
      assert.strictEqual(decoded.a, 1);
      assert.strictEqual(decoded.b, undefined);
      assert.strictEqual(decoded.c, "hello");
    });

    it("msgpackr encode → @gathertown/msgpack decode", () => {
      const obj = { a: 1, b: undefined, c: "hello" };
      const encoded = packr.pack(obj);
      const decoded = decode(encoded) as any;
      assert.strictEqual(decoded.a, 1);
      assert.strictEqual(decoded.b, undefined);
      assert.strictEqual(decoded.c, "hello");
    });
  });

  context("arrays with undefined values", () => {
    it("@gathertown/msgpack encode → msgpackr decode", () => {
      const arr = [1, undefined, "hello", null, undefined];
      const encoded = encode(arr);
      const decoded = unpack(encoded) as any[];
      assert.strictEqual(decoded[0], 1);
      assert.strictEqual(decoded[1], undefined);
      assert.strictEqual(decoded[2], "hello");
      assert.strictEqual(decoded[3], null);
      assert.strictEqual(decoded[4], undefined);
    });

    it("msgpackr encode → @gathertown/msgpack decode", () => {
      const arr = [1, undefined, "hello", null, undefined];
      const encoded = packr.pack(arr);
      const decoded = decode(encoded) as any[];
      assert.strictEqual(decoded[0], 1);
      assert.strictEqual(decoded[1], undefined);
      assert.strictEqual(decoded[2], "hello");
      assert.strictEqual(decoded[3], null);
      assert.strictEqual(decoded[4], undefined);
    });
  });

  context("null vs undefined distinction", () => {
    it("null and undefined produce different wire formats", () => {
      const nullEncoded = encode(null);
      const undefinedEncoded = encode(undefined);
      // null is 0xc0 (nil), undefined is 0xd4 0x00 0x00 (fixext1 type 0)
      assert.notDeepStrictEqual(Array.from(nullEncoded), Array.from(undefinedEncoded));
    });

    it("null round-trips as null, undefined round-trips as undefined", () => {
      assert.strictEqual(decode(encode(null)), null);
      assert.strictEqual(decode(encode(undefined)), undefined);
    });

    it("cross-library: null/undefined distinction preserved", () => {
      // @gathertown/msgpack → msgpackr
      assert.strictEqual(unpack(encode(null)), null);
      assert.strictEqual(unpack(encode(undefined)), undefined);
      // msgpackr → @gathertown/msgpack
      assert.strictEqual(decode(packr.pack(null)), null);
      assert.strictEqual(decode(packr.pack(undefined)), undefined);
    });
  });
});
