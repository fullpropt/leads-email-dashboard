import axios from "axios";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { resolveAutoName } from "../name-utils";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
let GITHUB_REDIRECT_URI = process.env.GITHUB_REDIRECT_URI || "https://dashboard.acessaragora.digital/api/github/callback";
if (process.env.GITHUB_REDIRECT_URI && !process.env.GITHUB_REDIRECT_URI.startsWith("http")) {
  GITHUB_REDIRECT_URI = `https://` + process.env.GITHUB_REDIRECT_URI;
}

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export function registerGitHubOAuthRoutes(app: Express) {
  // Login endpoint - redirects to GitHub
  app.get("/api/github/login", (req: Request, res: Response) => {
    const state = Math.random().toString(36).substring(7);
    const redirectUri = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(GITHUB_REDIRECT_URI)}&scope=user:email&state=${state}`;
    
    // Store state in session for verification
    res.cookie("github_oauth_state", state, { 
      httpOnly: true, 
      maxAge: 10 * 60 * 1000, // 10 minutes
      secure: true,
      sameSite: "lax"
    });
    
    res.redirect(redirectUri);
  });

  // Callback endpoint - handles GitHub redirect
  app.get("/api/github/callback", async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string;
      
      // Extract state from cookies - handle both req.cookies and manual parsing
      let cookieState: string | undefined;
      
      if (req.cookies && req.cookies.github_oauth_state) {
        cookieState = req.cookies.github_oauth_state;
      } else if (req.headers.cookie) {
        // Manual cookie parsing as fallback
        const cookies = req.headers.cookie.split(';').reduce((acc: Record<string, string>, cookie) => {
          const [key, value] = cookie.trim().split('=');
          acc[key] = decodeURIComponent(value);
          return acc;
        }, {});
        cookieState = cookies.github_oauth_state;
      }
      
      if (!cookieState) {
        return res.status(400).json({ error: "Invalid state parameter - no state cookie found" });
      }

      if (!code || !state || state !== cookieState) {
        return res.status(400).json({ error: "Invalid state parameter" });
      }

      // Exchange code for access token
      const tokenResponse = await axios.post<GitHubTokenResponse>(
        "https://github.com/login/oauth/access_token",
        {
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: GITHUB_REDIRECT_URI,
        },
        {
          headers: {
            Accept: "application/json",
          },
        }
      );

      const accessToken = tokenResponse.data.access_token;

      // Get user info from GitHub
      const userResponse = await axios.get<GitHubUser>(
        "https://api.github.com/user",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      const githubUser = userResponse.data;
      const openId = `github_${githubUser.id}`;
      const resolvedName = resolveAutoName({
        providedName: githubUser.name || githubUser.login,
        email: githubUser.email,
        identifier: openId,
        fallback: "Usuario",
      });

      // Upsert user in database
      await db.upsertUser({
        openId,
        name: resolvedName,
        email: githubUser.email,
        loginMethod: "github",
        lastSignedIn: new Date(),
      });

      // Create session token
      const sessionToken = await sdk.createSessionToken(openId, {
        name: resolvedName,
        expiresInMs: ONE_YEAR_MS,
      });

      // Set session cookie
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { 
        ...cookieOptions, 
        maxAge: ONE_YEAR_MS 
      });

      // Clear state cookie
      res.clearCookie("github_oauth_state", { 
        httpOnly: true, 
        secure: true,
        sameSite: "lax"
      });

      // Redirect to home
      res.redirect(302, "/");
    } catch (error) {
      console.error("[GitHub OAuth] Callback failed", error);
      res.status(500).json({ error: "GitHub OAuth callback failed" });
    }
  });
}

export function getGitHubLoginUrl(): string {
  return "/api/github/login";
}
