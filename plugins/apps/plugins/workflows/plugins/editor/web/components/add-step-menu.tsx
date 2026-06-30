import { MdAdd } from "react-icons/md";
import {
  Button,
  ControlSizeProvider,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { useStepTypeIndex } from "@plugins/apps/plugins/workflows/plugins/engine/web";

/**
 * "Add step" dropdown listing every contributed `Workflows.StepType`. Collection-
 * consumer clean: it renders whatever step types are installed, naming none.
 */
export function AddStepMenu({ onAdd }: { onAdd: (pluginId: string, label: string) => void }) {
  const stepTypes = useStepTypeIndex();
  const types = [...stepTypes.values()];

  if (types.length === 0) {
    return (
      <ControlSizeProvider size="sm">
        <WithTooltip content="No step types installed">
          <Button variant="outline" disabled>
            <MdAdd />
            Add step
          </Button>
        </WithTooltip>
      </ControlSizeProvider>
    );
  }

  return (
    <ControlSizeProvider size="sm">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          <MdAdd />
          Add step
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {types.map((type) => {
            const Icon = type.icon;
            return (
              <DropdownMenuItem key={type.pluginId} onClick={() => onAdd(type.pluginId, type.label)}>
                <Icon className="size-4 text-muted-foreground" />
                {type.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </ControlSizeProvider>
  );
}
