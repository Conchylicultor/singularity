export type { Server } from "./schemas";
export { ServerSchema } from "./schemas";
export { serversResource } from "./resources";
export {
  listServers,
  createServer,
  getServer,
  updateServer,
  deleteServer,
  generateSshKeypair,
  CreateServerBodySchema,
  UpdateServerBodySchema,
  GenerateKeypairBodySchema,
} from "./endpoints";
export type {
  CreateServerBody,
  UpdateServerBody,
  GenerateKeypairBody,
} from "./endpoints";
