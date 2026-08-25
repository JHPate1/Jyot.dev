export const DEMO_WORKSPACE: Record<string, string> = {
  "README.md": `# orbit-cart

A sample TypeScript pricing project for testing Kode in your browser.

Files:
- \`src/cart.ts\` : line item calculation (contains a floating-point bug in total calculation)
- \`src/api.ts\` : HTTP client stub
- \`src/utils/format.ts\` : currency formatter

Try opening the Assistant panel and typing:
"Find the floating point rounding error in src/cart.ts and fix it, then add a test case."
`,
  "package.json": `{
  "name": "orbit-cart",
  "version": "0.3.1",
  "type": "module",
  "scripts": { "build": "tsc -p .", "test": "vitest run" },
  "dependencies": { "zod": "^3.23.8" }
}
`,
  "src/cart.ts": `import { formatCurrency } from "./utils/format";
import type { LineItem, Cart } from "./types";

export const TAX_RATE = 0.0825;

export function lineTotal(item: LineItem): number {
  return item.unitPrice * item.qty * (1 - (item.discount ?? 0));
}

export function subtotal(cart: Cart): number {
  return cart.items.reduce((sum, i) => sum + lineTotal(i), 0);
}

// BUG: floating-point error accumulates across lines before rounding.
export function total(cart: Cart): number {
  const sub = subtotal(cart);
  const tax = sub * TAX_RATE;
  return sub + tax + cart.shipping;
}

export function receipt(cart: Cart): string {
  return cart.items
    .map((i) => \`\${i.name.padEnd(20)} \${formatCurrency(lineTotal(i))}\`)
    .concat([\`TOTAL \${formatCurrency(total(cart))}\`])
    .join("\\n");
}
`,
  "src/types.ts": `export interface LineItem {
  sku: string;
  name: string;
  unitPrice: number;
  qty: number;
  discount?: number;
}

export interface Cart {
  id: string;
  items: LineItem[];
  shipping: number;
  currency: "USD" | "EUR" | "GBP";
}
`,
  "src/api.ts": `const BASE = "https://api.orbit.example/v1";

export async function getCart(id: string) {
  const res = await fetch(\`\${BASE}/carts/\${id}\`);
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

export async function saveCart(cart: unknown) {
  return fetch(\`\${BASE}/carts\`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cart),
  });
}
`,
  "src/utils/format.ts": `export function formatCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
`,
  "src/index.ts": `import { receipt } from "./cart";
import type { Cart } from "./types";

const demo: Cart = {
  id: "c_1",
  currency: "USD",
  shipping: 4.99,
  items: [
    { sku: "A1", name: "Nebula Mug", unitPrice: 12.99, qty: 3, discount: 0.1 },
    { sku: "B2", name: "Orbit Sticker", unitPrice: 2.5, qty: 7 },
  ],
};

console.log(receipt(demo));
`,
};
