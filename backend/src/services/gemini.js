export class AIServiceError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export async function generateJson({ system, prompt }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AIServiceError("AI features are unavailable until the server is configured with a Gemini API key.", 503);
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  let response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.3, maxOutputTokens: 4096 }
        })
      }
    );
  } catch {
    throw new AIServiceError("Gemini could not be reached. Please try again.");
  }

  if (!response.ok) {
    throw new AIServiceError(
      response.status === 429
        ? "The AI service is busy. Please try again shortly."
        : "The AI service could not complete this request. Please try again."
    );
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new AIServiceError("The AI service returned an invalid response.");
  }
  const text = result?.candidates?.[0]?.content?.parts
    ?.filter((part) => typeof part.text === "string")
    .map((part) => part.text)
    .join("");
  if (!text) throw new AIServiceError("The AI service returned an empty response.");
  try {
    return JSON.parse(text);
  } catch {
    throw new AIServiceError("The AI service returned an unreadable response.");
  }
}
