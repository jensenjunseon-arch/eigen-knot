import { authed } from "./_auth.js";

// Login probe for the studio overlay. Returns { open: true } when no password is
// configured, { ok: true } when the supplied password matches, else 401.
export default function handler(req, res) {
  if (!process.env.STUDIO_PASSWORD) return res.status(200).json({ ok: true, open: true });
  if (authed(req)) return res.status(200).json({ ok: true });
  return res.status(401).json({ ok: false });
}
