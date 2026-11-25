const toxicityPatterns = [
  /\bkill yourself\b/i,
  /\bgo die\b/i,
  /\byou are worthless\b/i,
  /\bvete a morir\b/i,
  /\bmuérete\b/i,
  /\bferme ta gueule\b/i,
  /\bva te faire\b/i,
  /اذهب للموت/,
  /سأقتلك/,
];

const protectiveOrEducationalContext = /\b(?:don't|do not|never|avoid|stop|should not|the phrase|an example of|quoted text|moderation policy|toxic language)\b.{0,70}\b(?:say|write|use|tell|call|phrase|example|quoted|language|kill yourself|go die|worthless)\b/i;

export function detectPolyShieldToxicity(input) {
  const text = typeof input === "string" ? input.normalize("NFC").slice(0, 4000) : "";
  if (!text.trim() || protectiveOrEducationalContext.test(text)) return false;
  return toxicityPatterns.some((pattern) => pattern.test(text));
}
