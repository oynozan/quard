import { serve } from "@hono/node-server";
import { readPort } from "@quard/shared";
import { createApp } from "./app.ts";

const port = readPort(process.env.PORT, 4100);

serve({ fetch: createApp().fetch, port }, (info) => {
    console.log(`webhook listening on port ${info.port}`);
});
