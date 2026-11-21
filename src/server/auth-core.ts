/** Framework-independent auth logic (unit tested). */
import { createHmac, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";

const SESSION_DAYS = 7;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
let _dummy: string | null = null;
const dummyHash = () => (_dummy ??= bcrypt.hashSync("pip-timing-equaliser", 12));

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (min 32 chars)");
  return s;
}

export function hashToken(token: string) {
  return createHmac("sha256", secret()).update(token).digest("hex");
}

export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 12) return "Password must be at least 12 characters";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) return "Use upper and lower case letters and a number";
  return null;
}

export const authCore = {
  async hashPassword(pw: string) { return bcrypt.hash(pw, 12); },

  async upsertAdmin(email: string, password: string, name = "Administrator") {
    const problem = validatePasswordStrength(password);
    if (problem) throw new Error(problem);
    const passwordHash = await this.hashPassword(password);
    const e = email.trim().toLowerCase();
    const [existing] = await db.select().from(users).where(eq(users.email, e));
    if (existing) {
      await db.update(users).set({ passwordHash, failedLogins: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(users.id, existing.id));
      await db.delete(sessions).where(eq(sessions.userId, existing.id));
      return existing.id;
    }
    const [u] = await db.insert(users).values({ email: e, passwordHash, name, role: "admin" }).returning();
    return u.id;
  },

  /** Returns {token, expires} on success, or {error}. Locks the account after repeated failures. */
  async login(email: string, password: string, ua: string | null) {
    const e = email.trim().toLowerCase();
    const [u] = await db.select().from(users).where(eq(users.email, e));
    // Constant-ish work even when user missing
    if (!u) { await bcrypt.compare(password, dummyHash()); return { error: "Invalid email or password" } as const; }
    if (u.lockedUntil && u.lockedUntil > new Date()) return { error: "Account temporarily locked. Try again later." } as const;
    const ok = await bcrypt.compare(password, u.passwordHash);
    if (!ok) {
      const failed = u.failedLogins + 1;
      await db.update(users).set({
        failedLogins: failed >= MAX_FAILED ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      }).where(eq(users.id, u.id));
      return { error: "Invalid email or password" } as const;
    }
    const token = randomBytes(32).toString("base64url");
    const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    await db.insert(sessions).values({ userId: u.id, tokenHash: hashToken(token), expiresAt: expires, userAgent: ua });
    await db.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, u.id));
    await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
    return { token, expires } as const;
  },

  async validateSession(token: string) {
    if (!token || token.length > 200) return null;
    const rows = await db
      .select({ id: users.id, email: users.email, name: users.name, role: users.role, sessionId: sessions.id })
      .from(sessions).innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())));
    return rows[0] ?? null;
  },

  async logout(token: string) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  },

  async logoutAll(userId: string) {
    await db.delete(sessions).where(eq(sessions.userId, userId));
  },

  async changePassword(userId: string, current: string, next: string) {
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    if (!u || !(await bcrypt.compare(current, u.passwordHash))) return "Current password is incorrect";
    const problem = validatePasswordStrength(next);
    if (problem) return problem;
    await db.update(users).set({ passwordHash: await this.hashPassword(next), updatedAt: new Date() }).where(eq(users.id, userId));
    await db.delete(sessions).where(eq(sessions.userId, userId));
    return null;
  },
};

