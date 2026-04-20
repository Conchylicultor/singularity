import { asc, desc } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { defineResource } from "../../../../server/src/resources";
import { pushes } from "./tables";
import { attempts, conversations, tasks } from "./schema";
import type { Attempt, Conversation, Push, Task } from "./schema";

export const conversationsResource = defineResource({
  key: "conversations",
  mode: "push",
  loader: async (): Promise<Conversation[]> =>
    db.select().from(conversations).orderBy(desc(conversations.createdAt)),
});

export const pushesResource = defineResource({
  key: "pushes",
  mode: "push",
  loader: async (): Promise<Push[]> =>
    db.select().from(pushes).orderBy(desc(pushes.createdAt)),
});

export const attemptsResource = defineResource({
  key: "attempts",
  mode: "push",
  dependsOn: [{ resource: conversationsResource }, { resource: pushesResource }],
  loader: async (): Promise<Attempt[]> =>
    db.select().from(attempts).orderBy(asc(attempts.createdAt)),
});

export const tasksResource = defineResource({
  key: "tasks",
  mode: "push",
  dependsOn: [{ resource: attemptsResource }],
  loader: async (): Promise<Task[]> =>
    db.select().from(tasks).orderBy(asc(tasks.rank), asc(tasks.createdAt)),
});
