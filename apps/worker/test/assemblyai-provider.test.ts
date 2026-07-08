import { afterEach, describe, expect, it, vi } from "vitest";
import { AssemblyAIProvider } from "../src/transcription/assemblyai";
import { arabicFixture } from "../src/transcription/fixtures/arabic";

/**
 * Drives the REAL AssemblyAI provider against a stubbed fetch — this is the
 * code path that goes live the moment ASSEMBLYAI_API_KEY is set, so every
 * branch (submit, language modes, polling, provider error, HTTP error,
 * timeout) is exercised before the first live call.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fastProvider() {
  return new AssemblyAIProvider("test-key", {
    pollIntervalMs: 1,
    pollTimeoutMs: 1_000,
  });
}

const request = {
  uploadId: "upload-1",
  getAudioUrl: async () => "https://signed.example/media.mp4?token=abc",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AssemblyAIProvider", () => {
  it("submits with the auth header, polls through processing, and normalizes the result", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ id: "t1", status: "queued" }))
      .mockResolvedValueOnce(
        jsonResponse({ ...arabicFixture, id: "t1", status: "processing", words: null }),
      )
      .mockResolvedValueOnce(jsonResponse({ ...arabicFixture, id: "t1" }));

    const result = await fastProvider().transcribe({
      ...request,
      languageHint: "auto",
    });

    // Submit call: endpoint, auth scheme (raw key, no Bearer), payload shape.
    const [submitUrl, submitInit] = fetchMock.mock.calls[0]!;
    expect(String(submitUrl)).toBe("https://api.assemblyai.com/v2/transcript");
    expect(submitInit?.method).toBe("POST");
    expect((submitInit?.headers as Record<string, string>).authorization).toBe(
      "test-key",
    );
    const body = JSON.parse(String(submitInit?.body));
    expect(body).toMatchObject({
      audio_url: "https://signed.example/media.mp4?token=abc",
      speech_models: ["universal-3-5-pro", "universal-2"],
      disfluencies: true,
      language_detection: true,
    });
    // Brand-term correction map (custom_spelling verified live for Arabic).
    expect(body.custom_spelling).toEqual(
      expect.arrayContaining([expect.objectContaining({ to: "ميراي" })]),
    );
    expect(body.language_code).toBeUndefined();

    // Poll calls hit the transcript resource until completed.
    expect(String(fetchMock.mock.calls[1]![0])).toBe(
      "https://api.assemblyai.com/v2/transcript/t1",
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Result went through the shared normalizer.
    expect(result.providerTranscriptId).toBe("t1");
    expect(result.languageCode).toBe("ar");
    expect(result.words[0]).toMatchObject({ id: "w0", text: "السلام" });
  });

  it("sends an explicit language_code when the project pins a language", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ id: "t2", status: "queued" }))
      .mockResolvedValueOnce(jsonResponse({ ...arabicFixture, id: "t2" }));

    await fastProvider().transcribe({ ...request, languageHint: "ar" });

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(body.language_code).toBe("ar");
    expect(body.language_detection).toBeUndefined();
  });

  it("propagates provider-side transcription errors", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ id: "t3", status: "queued" }))
      .mockResolvedValueOnce(
        jsonResponse({ id: "t3", status: "error", error: "audio unreadable" }),
      );

    await expect(
      fastProvider().transcribe({ ...request, languageHint: "auto" }),
    ).rejects.toThrow(/audio unreadable/);
  });

  it("throws a descriptive error on non-2xx HTTP responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("bad api key", { status: 401 }),
    );

    await expect(
      fastProvider().transcribe({ ...request, languageHint: "auto" }),
    ).rejects.toThrow(/POST \/transcript failed with 401: bad api key/);
  });

  it("times out if the transcript never reaches a terminal status", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url).endsWith("/transcript")
        ? jsonResponse({ id: "t4", status: "queued" })
        : jsonResponse({ id: "t4", status: "processing" }),
    );

    const provider = new AssemblyAIProvider("test-key", {
      pollIntervalMs: 1,
      pollTimeoutMs: 25,
    });

    await expect(
      provider.transcribe({ ...request, languageHint: "auto" }),
    ).rejects.toThrow(/timed out/);
  });
});
