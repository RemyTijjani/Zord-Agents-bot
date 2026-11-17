import route0 from "./admin/agent-settings.js";
import route1 from "./admin/communities.js";
import route2 from "./admin/community-intelligence.js";
import route3 from "./admin/connect-telegram.js";
import route4 from "./admin/disconnect-telegram.js";
import route5 from "./admin/overview.js";
import route6 from "./admin/telegram-status.js";
import route7 from "./auth/logout.js";
import route8 from "./auth/session.js";
import route9 from "./auth/telegram/callback.js";
import route10 from "./auth/telegram/start.js";
import route11 from "./integrations/entitlements.js";
import route12 from "./telegram/webhook.js";

const routes: Record<string, (req: any, res: any) => unknown> = {
  "/api/admin/agent-settings": route0,
  "/api/admin/communities": route1,
  "/api/admin/community-intelligence": route2,
  "/api/admin/connect-telegram": route3,
  "/api/admin/disconnect-telegram": route4,
  "/api/admin/overview": route5,
  "/api/admin/telegram-status": route6,
  "/api/auth/logout": route7,
  "/api/auth/session": route8,
  "/api/auth/telegram/callback": route9,
  "/api/auth/telegram/start": route10,
  "/api/integrations/entitlements": route11,
  "/api/telegram/webhook": route12,
};

export default async function handler(req: any, res: any) {
  const rawPath = req.query?.path;
  const route = Array.isArray(rawPath)
    ? "/api/" + rawPath.join("/")
    : typeof rawPath === "string"
      ? "/api/" + rawPath
      : new URL(req.url || "/", "https://zord.invalid").pathname;
  const selected = routes[route];
  if (!selected) {
    return res.status(404).json({ error: "API route not found." });
  }
  return selected(req, res);
}
