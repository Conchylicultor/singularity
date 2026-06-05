export {
  TaskPrepromptSchema,
  TaskPrepromptsPayloadSchema,
  taskPrepromptsResource,
} from "./schemas";
export type { TaskPreprompt, TaskPrepromptsPayload } from "./schemas";
export { putTaskPreprompt, deleteTaskPreprompt } from "./endpoints";
