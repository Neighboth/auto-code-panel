import path from "node:path";
import { defineConfig } from "drizzle-kit";

const file = process.env.SQLITE_PATH || path.join("data", "app.db");

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: file.startsWith("file:") ? file : `file:${path.resolve(file)}`,
  },
});
