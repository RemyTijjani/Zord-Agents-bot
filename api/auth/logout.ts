import { clearSessionCookie, isSameOrigin } from "../_lib/auth";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  if (!isSameOrigin(req)) return res.status(403).json({ error: "Invalid request origin." });
  clearSessionCookie(req, res);
  return res.status(200).json({ ok: true });
}
