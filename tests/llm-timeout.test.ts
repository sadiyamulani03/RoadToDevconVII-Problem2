import { afterEach, describe, expect, it, vi } from "vitest";
import { MODEL_TIMEOUT_MS, chatCompletion, isLlmConfigured } from "../src/llm/client";
import type { ChatMessage } from "../src/llm/client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const messages: ChatMessage[] = [{ role: "user", content: "test" }];

describe("CHECK 6 / Test F — explicit model request timeout", () => {
  it("exports an explicit MODEL_TIMEOUT_MS", () => {
    expect(MODEL_TIMEOUT_MS).toBe(15_000);
  });

  it("aborts the model request via AbortController when the timeout elapses", async () => {
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.useFakeTimers();

    const fetchMock = vi.fn(
      (_url: string | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener("abort", () => reject(new Error("AbortError")));
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const promise = chatCompletion(messages);
    const rejection = expect(promise).rejects.toThrow(/timed out after 15000ms/);

    await vi.advanceTimersByTimeAsync(MODEL_TIMEOUT_MS + 1);
    await rejection;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal!.aborted).toBe(true);
  });

  it("resolves normally when the model responds before the timeout", async () => {
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.useFakeTimers();

    const fetchMock = vi.fn(
      async (_url: string | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ choices: [{ message: { content: '{"matches":[],"noMatchReason":null}' } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const content = await chatCompletion(messages);
    expect(content).toContain('"matches"');

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("throws a clear error when LLM_API_KEY is missing and never calls fetch", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(chatCompletion(messages)).rejects.toThrow(/LLM_API_KEY is not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exposes isLlmConfigured from the environment only", () => {
    vi.stubEnv("LLM_API_KEY", "test-key");
    expect(isLlmConfigured()).toBe(true);
    vi.stubEnv("LLM_API_KEY", "");
    expect(isLlmConfigured()).toBe(false);
  });
});
