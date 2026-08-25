export const DEMO_WORKSPACE: Record<string, string> = {
  "README.md": `# Sample Project — Orbit Cart

This is a small sample shop project to try Seeker Code.

- src/cart.ts — pricing logic (has a small rounding bug you can ask Seeker to fix)
- src/api.ts — example API calls
- src/utils/format.ts — price formatting

Try asking Seeker Pro 1.2:
"Find the rounding issue in the cart total and fix it, then add a simple test."
`,
  "package.json": `{
  "name": "orbit-cart",
  "version": "0.3.1",
  "type": "module"
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
  currency: "USD";
}
`,
  "src/api.ts": `const BASE = "https://api.example.com/v1";

export async function getCart(id: string) {
  const res = await fetch(\`\${BASE}/carts/\${id}\`);
  if (!res.ok) throw new Error("Request failed");
  return res.json();
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
    { sku: "A1", name: "Mug", unitPrice: 12.99, qty: 3, discount: 0.1 },
    { sku: "B2", name: "Sticker", unitPrice: 2.5, qty: 7 },
  ],
};

console.log(receipt(demo));
`,
};
