import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Read leniently: `prisma generate` runs on every build (including on
    // Railway, which has no database) and never connects. Commands that do
    // connect, such as migrate, still fail clearly without a real URL.
    url: process.env.DATABASE_URL ?? "",
  },
});
