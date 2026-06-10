// Shared password gate. Underscore-prefixed → Vercel does NOT route it, but it
// can still be imported by the real functions. If STUDIO_PASSWORD is unset the
// app is open (local/preview); when set, every /api call needs the header.
export function authed(req) {
  const pw = process.env.STUDIO_PASSWORD;
  if (!pw) return true;
  return (req.headers["x-studio-password"] || "") === pw;
}
