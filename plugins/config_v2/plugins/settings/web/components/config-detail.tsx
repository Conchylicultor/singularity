import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { useConfig, useConfigRegistrations } from "@plugins/config_v2/web";
import { configDetailPane } from "../internal/panes";
import { ConfigFieldRow } from "./config-field-row";

export function ConfigDetail() {
  const configPath = configDetailPane.useChainEntry()?.params.configPath;
  const registrations = useConfigRegistrations();

  const registration = registrations.find(
    (r) => encodeURIComponent(r.storePath) === configPath,
  );

  if (!registration) {
    return <Placeholder>Config not found</Placeholder>;
  }

  return <ConfigDetailInner registration={registration} />;
}

function ConfigDetailInner({
  registration,
}: {
  registration: ReturnType<typeof useConfigRegistrations>[number];
}) {
  const values = useConfig(registration.descriptor);
  const defaults = registration.descriptor.defaults as Record<string, unknown>;

  return (
    <div className="flex flex-col gap-1 p-3">
      {Object.entries(registration.descriptor.fields).map(([key, field]) => (
        <ConfigFieldRow
          key={key}
          fieldKey={key}
          field={field}
          value={values[key]}
          defaultValue={defaults[key]}
          storePath={registration.storePath}
        />
      ))}
    </div>
  );
}
