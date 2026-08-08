import { useId } from "react";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

export interface RadioOption {
  readonly value: string;
  readonly label: string;
}

export interface RadioGroupProps {
  options: readonly RadioOption[];
  /** The selected option's `value`. Controlled — no option is checked if it matches none. */
  value: string;
  onChange: (value: string) => void;
  /** Wrapper override (e.g. spacing). */
  className?: string;
}

/**
 * A single-choice group of native radios.
 *
 * The point of this primitive is the `name`. The HTML `name` attribute is what
 * natively groups radios: two groups sharing one `name` ARE one group to the
 * browser, so picking an option in the first clears the second's native checked
 * state and arrow-key roving focus walks across both. That is trivially easy to
 * get wrong when each caller writes its own literal — and a controlled `checked`
 * prop repaints the right dots, so the screen looks fine while keyboard
 * navigation and assistive-tech grouping are quietly broken.
 *
 * So `name` is not part of the prop surface. It is minted per mount from
 * `useId()`, which makes two `<RadioGroup>`s structurally two groups and leaves
 * no literal for a caller to collide on. The sibling `no-adhoc-radio` lint rule
 * keeps raw `<input type="radio">` out of feature code so this stays the only
 * home for the mechanic.
 *
 * The inputs are native and UA-drawn, tinted via `accent-primary` — this is NOT
 * the place for `selection-indicator`'s `RadioIndicator`, which is a
 * presentational box explicitly scoped away from native form controls.
 */
export function RadioGroup({
  options,
  value,
  onChange,
  className,
}: RadioGroupProps) {
  const name = useId();
  return (
    <Stack gap="xs" role="radiogroup" className={className}>
      {options.map((opt) => (
        <Stack
          as="label"
          direction="row"
          align="center"
          gap="sm"
          key={opt.value}
          className="cursor-pointer"
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="accent-primary"
          />
          <Text variant="body">{opt.label}</Text>
        </Stack>
      ))}
    </Stack>
  );
}
