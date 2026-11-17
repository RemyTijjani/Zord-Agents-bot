import { clearSessionCookie, isActiveAdmin, readSession } from "../_lib/auth";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const user = readSession(req);
  if (!user) {
    clearSessionCookie(req, res);
    return res.status(401).json({ authenticated: false });
  }
  try {
    if (!(await isActiveAdmin(user.id))) {
      clearSessionCookie(req, res);
      return res.status(401).json({ authenticated: false });
    }
    return res.status(200).json({ authenticated: true, user });
  } catch {
    return res.status(503).json({ error: "Could not verify administrator access." });
  }
}
