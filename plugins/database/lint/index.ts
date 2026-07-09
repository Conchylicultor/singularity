import noPoolAwaitInTransaction from "./no-pool-await-in-transaction";

export default {
  name: "database",
  rules: {
    "no-pool-await-in-transaction": noPoolAwaitInTransaction,
  },
};
