import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

function getLocalAuthEmail() {
  const configuredEmail =
    process.env.LOCAL_AUTH_EMAIL || process.env.ADMIN_EMAIL || "";
  return configuredEmail.trim().toLowerCase();
}

function getLocalAuthPassword() {
  return process.env.LOCAL_AUTH_PASSWORD || process.env.ADMIN_PASSWORD || "";
}

function getLocalOpenId() {
  return ENV.ownerOpenId || "local_admin";
}

async function resolveSessionUser(loginEmail: string) {
  let user = ENV.ownerOpenId
    ? await db.getUserByOpenId(ENV.ownerOpenId)
    : undefined;

  if (!user) {
    user = await db.getUserByEmail(loginEmail);
  }

  if (!user) {
    user = await db.getFirstUser();
  }

  if (!user) {
    const openId = getLocalOpenId();
    await db.upsertUser({
      openId,
      name: "Admin",
      email: loginEmail,
      loginMethod: "local",
      role: "admin",
      lastSignedIn: new Date(),
    });
    user = await db.getUserByOpenId(openId);
  }

  if (!user) {
    throw new Error("Unable to resolve local auth user");
  }

  await db.upsertUser({
    openId: user.openId,
    email: loginEmail,
    loginMethod: "local",
    lastSignedIn: new Date(),
  });

  return user;
}

export function registerLocalAuthRoutes(app: Express) {
  // Legacy compatibility endpoints to prevent stale frontend caches
  // from breaking sign-in after removing GitHub OAuth.
  app.get("/api/github/login", (_req: Request, res: Response) => {
    res.redirect(302, "/login");
  });

  app.get("/api/github/callback", (_req: Request, res: Response) => {
    res.redirect(302, "/login");
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as LoginBody;
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password =
      typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const configuredEmail = getLocalAuthEmail();
    const configuredPassword = getLocalAuthPassword();

    if (!configuredEmail || !configuredPassword) {
      return res.status(500).json({
        error:
          "Local auth not configured. Set LOCAL_AUTH_EMAIL and LOCAL_AUTH_PASSWORD.",
      });
    }

    if (email !== configuredEmail || password !== configuredPassword) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    try {
      const user = await resolveSessionUser(email);
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || email,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      return res.status(200).json({
        success: true,
        user: {
          name: user.name,
          email: user.email || email,
        },
      });
    } catch (error) {
      console.error("[Local Auth] Login failed", error);
      return res.status(500).json({ error: "Login failed" });
    }
  });
}
