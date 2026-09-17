import noRawPgConnection from "./no-raw-pg-connection";

export default {
  name: "db-connection",
  rules: {
    "no-raw-pg-connection": noRawPgConnection,
  },
};
