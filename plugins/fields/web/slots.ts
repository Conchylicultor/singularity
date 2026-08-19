import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { FieldIdentity } from "@plugins/fields/core";

export const Fields = {
  // The identity registry erases the field's value type at read time, so the
  // contribution boundary accepts any `FieldIdentity<T>`. `coerce` is
  // contravariant in `T`, so `FieldIdentity<number>` is not assignable to
  // `FieldIdentity<unknown>`; `<any>` is the standard variance-erasing form for
  // a registry slot prop (readers always treat the value as `unknown`).
  Identity: defineSlot<{ identity: FieldIdentity<any> }>({
    docLabel: (p) => p.identity.type.id,
  }),
};
