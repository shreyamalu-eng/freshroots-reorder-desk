// AI-written reasons and run summary. Gemini via OpenRouter (OPENROUTER_API_KEY, model AI_MODEL,
// default google/gemini-2.5-flash) or directly via Google (GEMINI_API_KEY, model GEMINI_MODEL).
// The rules engine still decides every quantity; mergeExplanations() rejects any AI sentence that
// quotes a number the engine did not produce, and the template reason is kept instead.
import { EXPLAIN_SYSTEM_PROMPT } from "../src/engine/explain";

type Fetch = typeof fetch;
export type AiProvider = "openrouter" | "gemini" | null;

export function aiProvider(): AiProvider {
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

export function aiModel(): string {
  return aiProvider() === "openrouter"
    ? process.env.AI_MODEL || "google/gemini-2.5-flash"
    : process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

/** One JSON-mode call. Returns the raw text, or throws with a readable message. */
export async function aiJson(userMessage: string, system = EXPLAIN_SYSTEM_PROMPT, fetchImpl: Fetch = fetch): Promise<string> {
  const provider = aiProvider();
  if (provider === "openrouter") {
    const res = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": process.env.APP_URL || "https://freshroots-reorder-desk.vercel.app",
        "X-Title": "Freshroots Reorder Desk",
      },
      body: JSON.stringify({
        model: aiModel(),
        temperature: 0,
        max_tokens: 4000, // 15 one-line reasons + a summary fit easily; keeps the call cheap on OpenRouter credits
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: userMessage }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${body.error?.message ?? "request failed"}`);
    const text = body.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error("The model returned no text.");
    return text;
  }
  if (provider === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(aiModel())}:generateContent`;
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 4000, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => ({}))) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } };
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${body.error?.message ?? "request failed"}`);
    const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    if (!text) throw new Error("Gemini returned no text.");
    return text;
  }
  throw new Error("No AI key set (OPENROUTER_API_KEY or GEMINI_API_KEY).");
}
