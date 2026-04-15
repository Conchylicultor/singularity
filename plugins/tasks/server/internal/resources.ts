import { asc } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { defineResource } from "../../../../server/src/resources";
import { tasks, type Task } from "../schema";

export const tasksResource = defineResource({
  key: "tasks",
  mode: "push",
  loader: async (): Promise<Task[]> => {
    return db.select().from(tasks).orderBy(asc(tasks.createdAt));
  },
});
