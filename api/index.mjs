/**
 * Seeker Code API Gateway
 * ─────────────────────────────────────────────────────────────────────────────
 * Public surface (what the browser hits):
 *   POST /v1/chat/completions     OpenAI-compatible, streams SSE
 *   GET  /v1/models               lists Seeker-branded models only
 *   GET  /v1/usage                remaining daily quota for the caller key
 *   POST /v1/admin/keys           create / update a Seeker key  (admin secret)
 *   GET  /v1/admin/keys           list keys                     (admin secret)
 *   PATCH /v1/admin/keys/{id}     change limit / active flag    (admin secret)
 *
 * Internally:
 *   1. Validate Authorization: Bearer sk_seeker_...
 *   2. Check DynamoDB Keys table + daily usage counter
 *   3. Map public model id → real NVIDIA model + secret NVIDIA key
 *   4. Proxy to integrate.api.nvidia.com (stream or non-stream)
 *   5. Increment usage AFTER a successful upstream response starts
 *
 * Env (set in Lambda console / Secrets Manager):
 *   KEYS_TABLE          DynamoDB table for API keys
 *   USAGE_TABLE         DynamoDB table for daily counters
 *   NVIDIA_KEY_PRO      nvapi-… for Seeker Pro 1.2
 *   NVIDIA_KEY_PERPLEX  nvapi-… for Seeker Perplex
 *   NVIDIA_KEY_FLASH    nvapi-… for Seeker Code Flash
 *   NVIDIA_BASE_URL     default https://integrate.api.nvidia.com/v1
 *   ADMIN_SECRET        shared secret for /v1/admin/*
 *   DEFAULT_DAILY_LIMIT default 50
 *   CORS_ORIGIN         * or your Amplify domain
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  ScanCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomBytes, createHash } from "node:crypto";

// ── Config ──────────────────────────────────────────────────────────────────
const KEYS_TABLE = process.env.KEYS_TABLE || "seeker-api-keys";
const USAGE_TABLE = process.env.USAGE_TABLE || "seeker-api-usage";
const NVIDIA_BASE = (process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
const ADMIN_SECRET = process.env.ADMIN_SECRET || "";
const DEFAULT_DAILY_LIMIT = Number(process.env.DEFAULT_DAILY_LIMIT || 50);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

/**
 * Internal model registry — public Seeker names map to real NVIDIA endpoints.
 * The browser only ever sees the `publicId`.
 */
const MODEL_MAP = {
  "seeker-pro-1.2": {
    publicId: "seeker-pro-1.2",
    label: "Seeker Pro 1.2",
    nvidiaModel: "nvidia/nemotron-3-super-120b-a12b",
    nvidiaKeyEnv: "NVIDIA_KEY_PRO",
    defaultKwargs: { enable_thinking: true },
  },
  "seeker-perplex": {
    publicId: "seeker-perplex",
    label: "Seeker Perplex",
    nvidiaModel: "deepseek-ai/deepseek-v4-flash-0731",
    nvidiaKeyEnv: "NVIDIA_KEY_PERPLEX",
    defaultKwargs: { thinking: true, reasoning_effort: "high" },
  },
  "seeker-code-flash": {
    publicId: "seeker-code-flash",
    label: "Seeker Code Flash",
    nvidiaModel: "meta/llama-3.3-70b-instruct",
    nvidiaKeyEnv: "NVIDIA_KEY_FLASH",
    defaultKwargs: {},
  },
};

// Also accept legacy / internal NVIDIA model names and rewrite them
const LEGACY_ALIASES = {
  "nvidia/nemotron-3-super-120b-a12b": "seeker-pro-1.2",
  "deepseek-ai/deepseek-v4-flash-0731": "seeker-perplex",
  "meta/llama-3.3-70b-instruct": "seeker-code-flash",
};

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

// ── Helpers ─────────────────────────────────────────────────────────────────
const json = (status, body, extraHeaders = {}) => ({
  statusCode: status,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Seeker-Admin",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Cache-Control": "no-store",
    ...extraHeaders,
  },
  body: JSON.stringify(body),
});

const utcDay = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

function hashKey(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

function mintKey() {
  // sk_seeker_<32 hex chars>
  return `sk_seeker_${randomBytes(16).toString("hex")}`;
}

function extractBearer(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m ? m[1].trim() : "";
}

function pathOf(event) {
  // Works for both REST API and HTTP API (v2)
  return (event.rawPath || event.path || "/").replace(/\/+$/, "") || "/";
}

function methodOf(event) {
  return (event.requestContext?.http?.method || event.httpMethod || "GET").toUpperCase();
}

function parseBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ── Key + usage ─────────────────────────────────────────────────────────────
async function loadKey(rawKey) {
  if (!rawKey || !rawKey.startsWith("sk_seeker_")) return null;
  const keyHash = hashKey(rawKey);
  const res = await ddb.send(new GetCommand({ TableName: KEYS_TABLE, Key: { keyHash } }));
  return res.Item || null;
}

async function getUsage(keyHash, day = utcDay()) {
  const res = await ddb.send(
    new GetCommand({ TableName: USAGE_TABLE, Key: { keyHash, day } }),
  );
  return res.Item?.count ?? 0;
}

async function bumpUsage(keyHash, day = utcDay()) {
  await ddb.send(
    new UpdateCommand({
      TableName: USAGE_TABLE,
      Key: { keyHash, day },
      UpdateExpression: "ADD #c :one SET updatedAt = :now",
      ExpressionAttributeNames: { "#c": "count" },
      ExpressionAttributeValues: { ":one": 1, ":now": new Date().toISOString() },
    }),
  );
}

async function assertKey(rawKey) {
  const record = await loadKey(rawKey);
  if (!record) {
    return { ok: false, status: 401, error: { message: "Invalid Seeker API key.", type: "invalid_api_key" } };
  }
  if (record.active === false) {
    return { ok: false, status: 403, error: { message: "This Seeker API key has been disabled.", type: "key_disabled" } };
  }
  const day = utcDay();
  const used = await getUsage(record.keyHash, day);
  const limit = Number(record.dailyLimit ?? DEFAULT_DAILY_LIMIT);
  if (used >= limit) {
    return {
      ok: false,
      status: 429,
      error: {
        message: `Daily limit reached (${limit} messages/day). Resets at midnight UTC.`,
        type: "rate_limit_exceeded",
        used,
        limit,
        resetsAt: `${day}T23:59:59Z`,
      },
    };
  }
  return { ok: true, record, used, limit, day };
}

// ── Model resolution ────────────────────────────────────────────────────────
function resolveModel(requested) {
  const id = LEGACY_ALIASES[requested] || requested || "seeker-pro-1.2";
  const entry = MODEL_MAP[id];
  if (!entry) {
    return {
      ok: false,
      error: {
        message: `Unknown model '${requested}'. Use one of: ${Object.keys(MODEL_MAP).join(", ")}`,
        type: "invalid_request_error",
      },
    };
  }
  const nvidiaKey = process.env[entry.nvidiaKeyEnv];
  if (!nvidiaKey) {
    return {
      ok: false,
      error: {
        message: `Upstream key not configured for ${entry.label}. Set ${entry.nvidiaKeyEnv}.`,
        type: "server_error",
      },
    };
  }
  return { ok: true, entry, nvidiaKey };
}

// ── Upstream proxy ──────────────────────────────────────────────────────────
async function proxyChatCompletions(body, nvidiaKey, entry, stream) {
  // Force the real NVIDIA model id; never trust the client
  const payload = {
    ...body,
    model: entry.nvidiaModel,
    stream: !!stream,
  };
  // Merge default chat_template_kwargs if the client didn't send any
  if (!payload.chat_template_kwargs && entry.defaultKwargs && Object.keys(entry.defaultKwargs).length) {
    payload.chat_template_kwargs = entry.defaultKwargs;
  }

  const upstream = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: stream ? "text/event-stream" : "application/json",
      Authorization: `Bearer ${nvidiaKey}`,
    },
    body: JSON.stringify(payload),
  });
  return upstream;
}

/**
 * Rewrite streamed SSE so any leaked nvidia model id is replaced with the
 * public Seeker id. Keeps branding consistent even in raw wire responses.
 */
async function rewriteSseStream(upstreamBody, publicId) {
  const reader = upstreamBody.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buf = "";

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        if (buf) controller.enqueue(encoder.encode(buf));
        controller.close();
        return;
      }
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      for (const line of parts) {
        if (line.startsWith("data:") && line.slice(5).trim() && line.slice(5).trim() !== "[DONE]") {
          try {
            const j = JSON.parse(line.slice(5).trim());
            if (j.model) j.model = publicId;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(j)}\n`));
            continue;
          } catch {
            /* fall through */
          }
        }
        controller.enqueue(encoder.encode(line + "\n"));
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });
}

// ── Admin routes ────────────────────────────────────────────────────────────
function assertAdmin(event) {
  const h = event.headers || {};
  const secret = h["x-seeker-admin"] || h["X-Seeker-Admin"] || "";
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return false;
  }
  return true;
}

async function adminCreateKey(body) {
  const raw = mintKey();
  const keyHash = hashKey(raw);
  const now = new Date().toISOString();
  const item = {
    keyHash,
    keyPrefix: raw.slice(0, 16) + "…",
    label: String(body.label || "default"),
    dailyLimit: Number(body.dailyLimit ?? DEFAULT_DAILY_LIMIT),
    active: body.active !== false,
    createdAt: now,
    updatedAt: now,
    ownerEmail: body.ownerEmail || null,
    notes: body.notes || null,
  };
  await ddb.send(new PutCommand({ TableName: KEYS_TABLE, Item: item }));
  // Return the raw key ONLY on create — it is never stored in plaintext
  return { ...item, apiKey: raw };
}

async function adminListKeys() {
  const res = await ddb.send(new ScanCommand({ TableName: KEYS_TABLE, Limit: 200 }));
  return (res.Items || []).map(({ keyHash, ...rest }) => ({ keyHash: keyHash.slice(0, 12) + "…", ...rest }));
}

async function adminPatchKey(keyHashFull, body) {
  // Client passes the FULL sha256, or we accept the raw key and hash it
  let keyHash = keyHashFull;
  if (keyHashFull.startsWith("sk_seeker_")) keyHash = hashKey(keyHashFull);

  const names = {};
  const values = { ":now": new Date().toISOString() };
  const sets = ["updatedAt = :now"];

  if (typeof body.dailyLimit === "number") {
    names["#dl"] = "dailyLimit";
    values[":dl"] = body.dailyLimit;
    sets.push("#dl = :dl");
  }
  if (typeof body.active === "boolean") {
    names["#a"] = "active";
    values[":a"] = body.active;
    sets.push("#a = :a");
  }
  if (typeof body.label === "string") {
    names["#l"] = "label";
    values[":l"] = body.label;
    sets.push("#l = :l");
  }
  if (typeof body.notes === "string") {
    names["#n"] = "notes";
    values[":n"] = body.notes;
    sets.push("#n = :n");
  }

  const res = await ddb.send(
    new UpdateCommand({
      TableName: KEYS_TABLE,
      Key: { keyHash },
      UpdateExpression: "SET " + sets.join(", "),
      ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    }),
  );
  return res.Attributes;
}

// ── Lambda entry ────────────────────────────────────────────────────────────
export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
  const method = methodOf(event);
  const path = pathOf(event);

  // CORS preflight
  if (method === "OPTIONS") {
    const http = awslambda.HttpResponseStream.from(responseStream, {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": CORS_ORIGIN,
        "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Seeker-Admin",
        "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
      },
    });
    http.end();
    return;
  }

  try {
    // ── Admin ──────────────────────────────────────────────────────────────
    if (path === "/v1/admin/keys" && method === "POST") {
      if (!assertAdmin(event)) return writeJson(responseStream, 401, { error: { message: "Unauthorized" } });
      const created = await adminCreateKey(parseBody(event));
      return writeJson(responseStream, 201, created);
    }
    if (path === "/v1/admin/keys" && method === "GET") {
      if (!assertAdmin(event)) return writeJson(responseStream, 401, { error: { message: "Unauthorized" } });
      return writeJson(responseStream, 200, { keys: await adminListKeys() });
    }
    if (path.startsWith("/v1/admin/keys/") && method === "PATCH") {
      if (!assertAdmin(event)) return writeJson(responseStream, 401, { error: { message: "Unauthorized" } });
      const id = path.slice("/v1/admin/keys/".length);
      const updated = await adminPatchKey(decodeURIComponent(id), parseBody(event));
      return writeJson(responseStream, 200, updated);
    }

    // ── Public models list (no auth required, branding only) ───────────────
    if (path === "/v1/models" && method === "GET") {
      return writeJson(responseStream, 200, {
        object: "list",
        data: Object.values(MODEL_MAP).map((m) => ({
          id: m.publicId,
          object: "model",
          owned_by: "seeker-code",
          name: m.label,
        })),
      });
    }

    // Everything below needs a Seeker key
    const rawKey = extractBearer(event);
    const gate = await assertKey(rawKey);
    if (!gate.ok) return writeJson(responseStream, gate.status, { error: gate.error });

    // ── Usage ──────────────────────────────────────────────────────────────
    if (path === "/v1/usage" && method === "GET") {
      return writeJson(responseStream, 200, {
        day: gate.day,
        used: gate.used,
        limit: gate.limit,
        remaining: Math.max(0, gate.limit - gate.used),
        label: gate.record.label,
      });
    }

    // ── Chat completions ───────────────────────────────────────────────────
    if (path === "/v1/chat/completions" && method === "POST") {
      const body = parseBody(event);
      const resolved = resolveModel(body.model);
      if (!resolved.ok) return writeJson(responseStream, 400, { error: resolved.error });

      const stream = body.stream !== false; // default ON for the IDE
      let upstream;
      try {
        upstream = await proxyChatCompletions(body, resolved.nvidiaKey, resolved.entry, stream);
      } catch (e) {
        return writeJson(responseStream, 502, {
          error: { message: `Upstream unreachable: ${e.message}`, type: "upstream_error" },
        });
      }

      if (!upstream.ok) {
        const text = await upstream.text().catch(() => "");
        let detail = text.slice(0, 400);
        try {
          const j = JSON.parse(text);
          detail = j.error?.message || j.detail || detail;
        } catch {}
        return writeJson(responseStream, upstream.status, {
          error: { message: detail || upstream.statusText, type: "upstream_error" },
        });
      }

      // Count the message only after upstream accepted it
      await bumpUsage(gate.record.keyHash, gate.day);

      if (!stream) {
        const data = await upstream.json();
        if (data.model) data.model = resolved.entry.publicId;
        return writeJson(responseStream, 200, data, {
          "X-Seeker-Remaining": String(Math.max(0, gate.limit - gate.used - 1)),
        });
      }

      // Streaming response — pipe rewritten SSE
      const httpStream = awslambda.HttpResponseStream.from(responseStream, {
        statusCode: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Access-Control-Allow-Origin": CORS_ORIGIN,
          "Access-Control-Expose-Headers": "X-Seeker-Remaining, X-Seeker-Model",
          "X-Seeker-Remaining": String(Math.max(0, gate.limit - gate.used - 1)),
          "X-Seeker-Model": resolved.entry.publicId,
          "X-Accel-Buffering": "no",
        },
      });

      const rewritten = await rewriteSseStream(upstream.body, resolved.entry.publicId);
      const reader = rewritten.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          httpStream.write(value);
        }
      } finally {
        httpStream.end();
      }
      return;
    }

    return writeJson(responseStream, 404, { error: { message: `No route for ${method} ${path}` } });
  } catch (e) {
    console.error("seeker-api error", e);
    return writeJson(responseStream, 500, { error: { message: e.message || "Internal error", type: "server_error" } });
  }
});

/** Helper: write a full JSON response via the Lambda response stream. */
function writeJson(responseStream, statusCode, body, extraHeaders = {}) {
  const http = awslambda.HttpResponseStream.from(responseStream, {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": CORS_ORIGIN,
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Seeker-Admin",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
  http.write(JSON.stringify(body));
  http.end();
}
