import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./drizzle/schema_postgresql.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: "postgresql://postgres:ElAiIwFwOzZfbNWwrznPYBBJqUkouoRG@switchback.proxy.rlwy.net:16583/railway",
  },
  verbose: true,
  strict: true,
});
