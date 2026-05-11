import { defineDetailSections } from "@plugins/primitives/plugins/detail-sections/web";

export const TaskDetail = defineDetailSections<{ taskId: string }>("task-detail");
