import assert from "assert";
import util from "util";
import { encode, decode, ExtensionCodec, decodeAsync } from "../src";

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

  context("undefined", () => {
    const extensionCodec = new ExtensionCodec();

    // undefined
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

  context("custom extensions with custom context", () => {
    class Context {
      public expectations: Array<any> = [];
      constructor(public ctxVal: number) {}
      public hasVisited(val: any) {
        this.expectations.push(val);
      }
    }
    const extensionCodec = new ExtensionCodec<Context>();

    class Magic<T> {
      constructor(public val: T) {}
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
        extType;
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
});
