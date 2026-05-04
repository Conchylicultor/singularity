import { generateKeyBetween } from "fractional-indexing";
import { z } from "zod";

export class Rank {
  private constructor(private readonly _v: string) {}

  static from(value: string): Rank {
    return new Rank(value);
  }

  static compare(a: Rank, b: Rank): -1 | 0 | 1 {
    if (a._v < b._v) return -1;
    if (a._v > b._v) return 1;
    return 0;
  }

  static between(prev: Rank | null, next: Rank | null): Rank {
    return new Rank(generateKeyBetween(prev?._v ?? null, next?._v ?? null));
  }

  static equals(a: Rank, b: Rank): boolean {
    return a._v === b._v;
  }

  toJSON(): string {
    return this._v;
  }

  toString(): string {
    return this._v;
  }
}

// z.union here avoids z.preprocess's `_input = unknown`, which breaks
// resourceDescriptor<T>'s ZodType<T, ZodTypeDef, T> constraint.
export const RankSchema = z.union([
  z.string().transform(Rank.from),
  z.custom<Rank>((v) => v instanceof Rank),
]) as unknown as z.ZodType<Rank>;
