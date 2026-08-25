/**
 * One-shot helper to mint a Seeker API key via the admin endpoint.
 *
 *   export SEEKER_API_URL=https://xxxx.execute-api.us-east-1.amazonaws.com
 *   export SEEKER_ADMIN_SECRET=your-long-random-string
 *   node seed-key.mjs --label "demo" --limit 50
 */
const API = (process.env.SEEKER_API_URL || "").replace(/\/$/, "");
const SECRET = process.env.SEEKER_ADMIN_SECRET || "";

if (!API || !SECRET) {
  console.error("Set SEEKER_API_URL and SEEKER_ADMIN_SECRET first.");
  process.exit(1);
}

const args = process.argv.slice(2);
const get = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : fallback;
};

const body = {
  label: get("--label", "default"),
  dailyLimit: Number(get("--limit", "50")),
  ownerEmail: get("--email", null),
  notes: get("--notes", null),
  active: true,
};

const res = await fetch(`${API}/v1/admin/keys`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Seeker-Admin": SECRET,
  },
  body: JSON.stringify(body),
});

const data = await res.json();
if (!res.ok) {
  console.error("Failed:", data);
  process.exit(1);
}

console.log("────────────────────────────────────────");
console.log(" Seeker API key created");
console.log("────────────────────────────────────────");
console.log(" Label :", data.label);
console.log(" Limit :", data.dailyLimit, "messages/day");
console.log(" Key   :", data.apiKey);
console.log("────────────────────────────────────────");
console.log("Copy the key now — it is shown only once.");
console.log("Paste it into Seeker Code → Settings → API Key.");
