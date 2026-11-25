const suspiciousHosts = new Set([
  "bit.ly", "tinyurl.com", "cutt.ly", "is.gd", "rb.gy", "shorturl.at",
]);

const scamLanguage = /\b(free crypto|claim your reward|double your money|wallet connect|verify your wallet|send .{0,40} to receive|guaranteed profit|airdrop claim|urgent wallet verification)\b/i;
const credentialRequest = /\b(?:send|share|enter|submit|provide|reveal)\s+(?:me\s+)?(?:your\s+)?(?:seed phrase|recovery phrase|private key|password|otp|verification code)\b/i;
const protectiveAdvice = /\b(?:never|don't|do not|should not|must not|avoid)\b.{0,35}\b(?:send|share|enter|submit|provide|reveal)\b/i;
const impersonation = /\b(?:official support|customer care|telegram admin|group moderator|verified admin)\b/i;
const outreach = /\b(?:dm me|contact me|message me|send funds|send crypto|seed phrase|verification code)\b/i;

function extractUrls(text) {
  return text.match(/https?:\/\/[^\s<>()]+/gi) ?? [];
}

export function detectSentinelThreat(input) {
  const text = typeof input === "string" ? input.slice(0, 4000) : "";
  if (!text.trim()) return null;

  const urls = extractUrls(text);
  if (urls.length >= 4) return { reason: "multiple_links", severity: "medium" };

  const requestsCredentials = credentialRequest.test(text) && !protectiveAdvice.test(text);
  if (urls.length > 0 && scamLanguage.test(text)) {
    return { reason: "scam_language_with_link", severity: "high" };
  }
  if (urls.length > 0 && requestsCredentials) {
    return { reason: "credential_phishing_link", severity: "high" };
  }

  for (const raw of urls) {
    try {
      const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
      if (suspiciousHosts.has(host)) return { reason: "shortened_link", severity: "medium" };
    } catch {
      return { reason: "malformed_link", severity: "medium" };
    }
  }

  if (requestsCredentials) {
    return { reason: "credential_request_without_link", severity: "medium" };
  }

  if (impersonation.test(text) && outreach.test(text)) {
    return { reason: "possible_admin_impersonation", severity: urls.length ? "high" : "medium" };
  }

  return null;
}
