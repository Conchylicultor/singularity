import { join } from "node:path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/core";

const PG_DIR = join(SINGULARITY_DIR, "postgres");

export const PGBOUNCER_PORT = 6432;

export const PGBOUNCER_SOCKET_DIR = join(PG_DIR, "socket");

export const PGBOUNCER_CONFIG_FILE = join(PG_DIR, "pgbouncer.ini");
export const PGBOUNCER_USERLIST_FILE = join(PG_DIR, "userlist.txt");
export const PGBOUNCER_LOG_FILE = join(PG_DIR, "pgbouncer.log");
export const PGBOUNCER_PID_FILE = join(PG_DIR, "pgbouncer.pid");
