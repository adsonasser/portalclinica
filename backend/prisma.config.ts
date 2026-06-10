import "dotenv/config";
import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";

export default defineConfig({
  earlyAccess: true,
  schema: "prisma/schema.prisma",
  migrate: {
    async adapter(env) {
      const ssl = env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false;
      return new PrismaPg({ connectionString: env.DATABASE_URL as string, ssl });
    },
  },
});
