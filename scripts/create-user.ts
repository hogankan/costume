/**
 * Create an account, or reset an existing account's password. There is no
 * public sign-up; this is the only way accounts are made.
 *
 *   npm run user:create -- --email you@example.com --name "Your Name" --role admin
 *   npm run user:create -- --email you@example.com --name "Your Name" --generate
 *
 * Without --generate it asks for the password (typed twice, not shown). With
 * --generate it makes a strong one and prints it once. Uses DATABASE_URL from
 * .env, which points at the test database; to create live accounts, run it
 * with DATABASE_URL set to the live database.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../src/lib/auth/password";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Ask without echoing what is typed. */
function askHidden(question: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _enc, done) {
      if (!muted) process.stdout.write(chunk);
      done();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

/** Easy to read aloud and type: no 0/O or 1/l. */
function generatePassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(16);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`;
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim();
  const role = (arg("role") ?? "staff").toUpperCase();
  if (!email || !name || !["ADMIN", "STAFF"].includes(role)) {
    console.error('Usage: npm run user:create -- --email you@example.com --name "Your Name" [--role admin|staff] [--generate]');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  let password: string;
  if (process.env.NEW_PASSWORD) {
    // Lets the same password be set in two databases without typing it twice.
    password = process.env.NEW_PASSWORD;
  } else if (process.argv.includes("--generate")) {
    password = generatePassword();
  } else {
    password = await askHidden(`Password for ${email}: `);
    const again = await askHidden("Type it again: ");
    if (password !== again) {
      console.error("The passwords don't match.");
      process.exit(1);
    }
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name, role: role as "ADMIN" | "STAFF", passwordHash },
    update: { name, role: role as "ADMIN" | "STAFF", passwordHash },
  });
  // A password reset signs the account out everywhere.
  await prisma.session.deleteMany({ where: { userId: user.id } });
  await prisma.$disconnect();

  console.log(`Saved ${user.role.toLowerCase()} account ${user.email} (${user.name}).`);
  if (process.argv.includes("--generate")) console.log(`Password: ${password}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
