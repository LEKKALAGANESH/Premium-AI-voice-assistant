import { Request, Response, NextFunction } from "express";

/**
 * Bearer token authentication middleware for DB routes.
 *
 * Checks the Authorization header for a valid Bearer token that matches
 * the APP_SECRET environment variable. When APP_SECRET is not set,
 * auth is bypassed (local development mode) with a one-time warning.
 *
 * Usage:
 *   router.delete("/:id", requireAuth, handler);
 *   -- or --
 *   app.use("/api/conversations", requireAuth, conversationRoutes);
 */

let warnedNoSecret = false;

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const appSecret = process.env.APP_SECRET;

  // Development bypass: if APP_SECRET is not configured, skip auth
  // This allows local dev without token setup while enforcing auth in production
  if (!appSecret) {
    if (!warnedNoSecret) {
      console.warn("[auth] APP_SECRET not set — auth middleware is DISABLED. Set APP_SECRET in .env.local for production.");
      warnedNoSecret = true;
    }
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Authorization header required",
    });
  }

  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Authorization must use Bearer scheme",
    });
  }

  const token = authHeader.slice(7);

  if (!token || token !== appSecret) {
    return res.status(403).json({
      error: "FORBIDDEN",
      message: "Invalid or expired token",
    });
  }

  next();
};
