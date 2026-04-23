import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // env() throws if the variable is absent (even for generate-only commands).
    // process.env with a fallback keeps prisma generate working in CI without a DB.
    url: process.env.DATABASE_URL ?? "postgresql://localhost/build",
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
