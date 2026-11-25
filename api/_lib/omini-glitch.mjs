function safeLabel(value, max = 48) {
  return typeof value === "string" ? value.replace(/[\r\n\t]/g, " ").trim().slice(0, max) : "unknown";
}

export function resolveOminiGeneration(command, output) {
  if (typeof output !== "string" || !output.trim()) {
    return {
      action: "content_generation_unavailable",
      severity: "low",
      response: "Omini Glitch content assistance needs the ZORD AI service to be configured.",
    };
  }
  return {
    action: command === "meme" ? "meme_created" : "community_content_created",
    severity: "info",
    response: output.trim().slice(0, 700),
  };
}

export function formatCommunityReport(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return "No recorded agent actions in the last 7 days.";
  }
  return rows.slice(0, 12).map((row) => {
    const moduleKey = safeLabel(row?.module_key, 32);
    const actionKey = safeLabel(row?.action_key, 64);
    const total = Number.isFinite(Number(row?.total)) ? Math.max(0, Math.trunc(Number(row.total))) : 0;
    return `• ${moduleKey}: ${actionKey} — ${total}`;
  }).join("\n");
}
