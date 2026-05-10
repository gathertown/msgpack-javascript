import assert from "assert";
import util from "util";
import { encode, decode, Encoder, ExtensionCodec, decodeAsync } from "../src/index.ts";

describe("ExtensionCodec", () => {
  context("timestamp", () => {
    const extensionCodec = ExtensionCodec.defaultCodec;

    it("encodes and decodes a date without milliseconds (timestamp 32)", () => {
      const date = new Date(1556633024000);
      const encoded = encode(date, { extensionCodec });
      assert.deepStrictEqual(
        decode(encoded, { extensionCodec }),
        date,
        `date: ${date.toISOString()}, encoded: ${util.inspect(encoded)}`,
      );
    });

    it("encodes and decodes a date with milliseconds (timestamp 64)", () => {
      const date = new Date(1556633024123);
      const encoded = encode(date, { extensionCodec });
      assert.deepStrictEqual(
        decode(encoded, { extensionCodec }),
        date,
        `date: ${date.toISOString()}, encoded: ${util.inspect(encoded)}`,
      );
    });

    it("encodes and decodes a future date (timestamp 96)", () => {
      const date = new Date(0x400000000 * 1000);
      const encoded = encode(date, { extensionCodec });
      assert.deepStrictEqual(
        decode(encoded, { extensionCodec }),
        date,
        `date: ${date.toISOString()}, encoded: ${util.inspect(encoded)}`,
      );
    });
  });

  context("custom extensions", () => {
    const extensionCodec = new ExtensionCodec();

    // Set<T>
    extensionCodec.register({
      type: 0,
      encode: (object: unknown): Uint8Array | null => {
        if (object instanceof Set) {
          return encode([...object]);
        } else {
          return null;
        }
      },
      decode: (data: Uint8Array) => {
        const array = decode(data) as Array<unknown>;
        return new Set(array);
      },
    });

    // Map<T>
    extensionCodec.register({
      type: 1,
      encode: (object: unknown): Uint8Array | null => {
        if (object instanceof Map) {
          return encode([...object]);
        } else {
          return null;
        }
      },
      decode: (data: Uint8Array) => {
        const array = decode(data) as Array<[unknown, unknown]>;
        return new Map(array);
      },
    });

    it("encodes and decodes custom data types (synchronously)", () => {
      const set = new Set([1, 2, 3]);
      const map = new Map([
        ["foo", "bar"],
        ["bar", "baz"],
      ]);
      const encoded = encode([set, map], { extensionCodec });
      assert.deepStrictEqual(decode(encoded, { extensionCodec }), [set, map]);
    });

    it("encodes and decodes custom data types (asynchronously)", async () => {
      const set = new Set([1, 2, 3]);
      const map = new Map([
        ["foo", "bar"],
        ["bar", "baz"],
      ]);
      const encoded = encode([set, map], { extensionCodec });
      const createStream = async function* () {
        yield encoded;
      };
      assert.deepStrictEqual(await decodeAsync(createStream(), { extensionCodec }), [set, map]);
    });
  });

  context("custom extensions with custom context", () => {
    class Context {
      public ctxVal: number;
      public expectations: Array<any> = [];
      constructor(ctxVal: number) {
        this.ctxVal = ctxVal;
      }
      public hasVisited(val: any) {
        this.expectations.push(val);
      }
    }
    const extensionCodec = new ExtensionCodec<Context>();

    class Magic<T> {
      public val: T;
      constructor(val: T) {
        this.val = val;
      }
    }

    // Magic
    extensionCodec.register({
      type: 0,
      encode: (object: unknown, context): Uint8Array | null => {
        if (object instanceof Magic) {
          context.hasVisited({ encoding: object.val });
          return encode({ magic: object.val, ctx: context.ctxVal }, { extensionCodec, context });
        } else {
          return null;
        }
      },
      decode: (data: Uint8Array, extType, context) => {
        const decoded = decode(data, { extensionCodec, context }) as { magic: number };
        context.hasVisited({ decoding: decoded.magic, ctx: context.ctxVal });
        return new Magic(decoded.magic);
      },
    });

    it("encodes and decodes custom data types (synchronously)", () => {
      const context = new Context(42);
      const magic1 = new Magic(17);
      const magic2 = new Magic({ foo: new Magic("inner") });
      const test = [magic1, magic2];
      const encoded = encode(test, { extensionCodec, context });
      assert.deepStrictEqual(decode(encoded, { extensionCodec, context }), test);
      assert.deepStrictEqual(context.expectations, [
        {
          encoding: magic1.val,
        },
        {
          encoding: magic2.val,
        },
        {
          encoding: magic2.val.foo.val,
        },
        {
          ctx: 42,
          decoding: magic1.val,
        },
        {
          ctx: 42,
          decoding: magic2.val.foo.val,
        },
        {
          ctx: 42,
          decoding: magic2.val,
        },
      ]);
    });

    it("encodes and decodes custom data types (asynchronously)", async () => {
      const context = new Context(42);
      const magic1 = new Magic(17);
      const magic2 = new Magic({ foo: new Magic("inner") });
      const test = [magic1, magic2];
      const encoded = encode(test, { extensionCodec, context });
      const createStream = async function* () {
        yield encoded;
      };
      assert.deepStrictEqual(await decodeAsync(createStream(), { extensionCodec, context }), test);
      assert.deepStrictEqual(context.expectations, [
        {
          encoding: magic1.val,
        },
        {
          encoding: magic2.val,
        },
        {
          encoding: magic2.val.foo.val,
        },
        {
          ctx: 42,
          decoding: magic1.val,
        },
        {
          ctx: 42,
          decoding: magic2.val.foo.val,
        },
        {
          ctx: 42,
          decoding: magic2.val,
        },
      ]);
    });
  });

  context("allowUndefinedCustomEncoding", () => {
    const extensionCodec = new ExtensionCodec();

    extensionCodec.register({
      type: 0x1,
      encode: (object: unknown): Uint8Array | null => {
        if (object === undefined) {
          return new Uint8Array(0);
        }
        return null;
      },
      decode: (data: Uint8Array) => {
        if (data.length === 0) {
          return undefined;
        }
        throw new Error("invalid data");
      },
    });

    it("encodes and decodes undefined (synchronously)", () => {
      const encoded = encode([undefined], { extensionCodec, allowUndefinedCustomEncoding: true });
      assert.deepStrictEqual(decode(encoded, { extensionCodec }), [undefined]);
    });
  });

  context("allowUndefinedCustomEncoding with clone() propagation (reentrancy)", () => {
    // Box is a wrapper type whose extension codec calls encoder.encode() recursively,
    // forcing the encoder's reentrancy guard to invoke clone().
    class Box {
      constructor(public readonly value: unknown) {}
    }

    const extensionCodec = new ExtensionCodec();

    // Undefined handler (type 0x1)
    extensionCodec.register({
      type: 0x1,
      encode: (object: unknown): Uint8Array | null => {
        if (object === undefined) {
          return new Uint8Array(0);
        }
        return null;
      },
      decode: (_data: Uint8Array) => undefined,
    });

    // encoder is declared here so the Box codec below can close over it.
    // It is assigned after registration so the extensionCodec is fully set up first.
    let encoder: Encoder;

    // Box handler (type 0x2): calls encoder.encode() recursively to trigger clone()
    extensionCodec.register({
      type: 0x2,
      encode: (object: unknown): Uint8Array | null => {
        if (object instanceof Box) {
          return encoder.encode(object.value);
        }
        return null;
      },
      decode: (data: Uint8Array) => new Box(decode(data, { extensionCodec })),
    });

    encoder = new Encoder({ extensionCodec, allowUndefinedCustomEncoding: true });

    it("propagates allowUndefinedCustomEncoding through clone()", () => {
      // Encoding Box(undefined):
      //   outer encode() handles Box via type 0x2, which calls encoder.encode(undefined)
      //   encoder is already entered, so clone() fires — the clone must carry
      //   allowUndefinedCustomEncoding or undefined would become nil instead of
      //   reaching the type 0x1 codec.
      const encoded = encoder.encode(new Box(undefined));
      const decoded = decode(encoded, { extensionCodec }) as Box;
      assert.strictEqual(decoded.value, undefined);
    });
  });

  context("custom extensions with alignment", () => {
    const extensionCodec = new ExtensionCodec();

    extensionCodec.register({
      type: 0x01,
      encode: (object: unknown) => {
        if (object instanceof Float32Array) {
          return (pos: number) => {
            const bpe = Float32Array.BYTES_PER_ELEMENT;
            const padding = 1 + ((bpe - ((pos + 1) % bpe)) % bpe);
            const data = new Uint8Array(object.buffer);
            const result = new Uint8Array(padding + data.length);
            result[0] = padding;
            result.set(data, padding);
            return result;
          };
        }
        return null;
      },
      decode: (data: Uint8Array) => {
        const padding = data[0]!;
        const bpe = Float32Array.BYTES_PER_ELEMENT;
        const offset = data.byteOffset + padding;
        const length = data.byteLength - padding;
        return new Float32Array(data.buffer, offset, length / bpe);
      },
    });

    it("encodes and decodes Float32Array type with zero-copy", () => {
      const data = {
        position: new Float32Array([1.1, 2.2, 3.3, 4.4, 5.5]),
      };
      const encoded = encode(data, { extensionCodec });
      const decoded = decode(encoded, { extensionCodec });
      assert.deepStrictEqual(decoded, data);
      assert.strictEqual(decoded.position.buffer, encoded.buffer);
    });
  });
});
