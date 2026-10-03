import { OpenAIProvider, Runner, type OpenAIClient, type RunConfig } from "@openai/agents";
import { wrap } from "../../monitor/wrap.ts";
import { followProvider, followRuns } from "./runs.ts";

export type QuardRunnerOptions = Partial<Omit<RunConfig, "modelProvider">> & {
    // The OpenAI client for model calls, wrapped with quard.wrap() or not
    client: OpenAIClient;
};

// A Runner whose model calls go through the wrapped client. Each run()
// lands in one Quard run, tagged with the agent the framework runs.
export function quardRunner(options: QuardRunnerOptions): Runner {
    const { client, ...config } = options;
    followRuns();
    // The Responses API over HTTP, which the monitor sees
    const modelProvider = new OpenAIProvider({
        openAIClient: wrap(client),
        useResponses: true,
        useResponsesWebSocket: false,
    });
    followProvider(modelProvider);
    return new Runner({ ...config, modelProvider });
}
