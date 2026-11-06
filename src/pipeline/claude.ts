// Step 11: one batched call to the Claude Messages API per run.
// Without ANTHROPIC_API_KEY the pipeline skips this call and uses template reasons.
import { EXPLAIN_SYSTEM_PROMPT } from "../engine/explain";

export async function callClaude(userMessage: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      temperature: 0, // extraction-style task: same facts, same wording
      system: EXPLAIN_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) {
    console.warn(`Claude call failed (${res.status}); using template reasons.`);
    return null;
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  return (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("");
}
