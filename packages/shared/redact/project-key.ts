import { z } from "zod";

// Where an agent asks webhook for its project's hash key, with its agent key
export const HASH_KEY_PATH = "/v1/hash-key";

// A project's hash key, as 64 lowercase hex characters
export const hashKeyText = z.string().regex(/^[0-9a-f]{64}$/);

// webhook's answer to GET HASH_KEY_PATH
export const hashKeyReply = z.object({ hashKey: hashKeyText });

export type HashKeyReply = z.infer<typeof hashKeyReply>;
