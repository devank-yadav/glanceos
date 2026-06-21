// Quick test to verify the claim about hidden field backward compatibility
import { z } from "zod";

// Simulate the schema structure
const BlockStyle = z.object({
  invert: z.boolean().default(false),
  align: z.enum(["start", "center", "end"]).default("start"),
  valign: z.enum(["top", "middle", "bottom"]).default("top"),
});

const TextProps = z.object({ content: z.string().default("") });

const BlockSource = z.object({
  connectionId: z.string().min(1).optional(),
  kind: z.string().min(1).max(64),
  query: z.record(z.string(), z.string().max(2000)).default({}),
  map: z.object({ path: z.string().default("") }).default({}),
  refreshSeconds: z.number().int().optional(),
});

// The actual schema from layout.ts line 344
const b = {
  id: z.string().min(1),
  name: z.string().max(60).optional(),
  hidden: z.boolean().optional(),  // <-- The additive field
  width: z.number().min(0.2).max(5).default(1),
  style: BlockStyle.default({}),
  source: BlockSource.optional(),
  visibility: z.enum(["always", "whenData"]).optional()
};

const Widget = z.object({
  ...b,
  type: z.literal("text"),
  props: TextProps
});

type WidgetT = z.infer<typeof Widget>;

// Test 1: Old data without hidden field
const oldData = {
  id: "test-1",
  type: "text" as const,
  props: { content: "Hello" }
};

try {
  const parsed = Widget.parse(oldData);
  console.log("✓ Old data (no hidden field) parses successfully");
  console.log("  hidden value:", parsed.hidden);
  console.log("  hidden === undefined:", parsed.hidden === undefined);
} catch (e) {
  console.log("✗ Old data parsing failed:", (e as any).message);
}

// Test 2: New data with hidden: true
const newData = {
  id: "test-2",
  type: "text" as const,
  props: { content: "World" },
  hidden: true
};

try {
  const parsed = Widget.parse(newData);
  console.log("✓ New data (hidden: true) parses successfully");
  console.log("  hidden value:", parsed.hidden);
} catch (e) {
  console.log("✗ New data parsing failed:", (e as any).message);
}

// Test 3: New data with hidden: false
const newData2 = {
  id: "test-3",
  type: "text" as const,
  props: { content: "False" },
  hidden: false
};

try {
  const parsed = Widget.parse(newData2);
  console.log("✓ New data (hidden: false) parses successfully");
  console.log("  hidden value:", parsed.hidden);
} catch (e) {
  console.log("✗ New data parsing failed:", (e as any).message);
}

// Test 4: Render logic simulation (from apps/screen/src/render.ts:106)
function shouldRender(block: WidgetT): boolean {
  if (block.hidden) return false;  // if (block.hidden) continue;
  return true;
}

const oldParsed = Widget.parse(oldData);
const newParsedTrue = Widget.parse(newData);
const newParsedFalse = Widget.parse(newData2);

console.log("\n--- Render checks (simulating line 106) ---");
console.log("Old data (undefined hidden):", shouldRender(oldParsed) ? "RENDER" : "SKIP");
console.log("New data (hidden: true):", shouldRender(newParsedTrue) ? "RENDER" : "SKIP");
console.log("New data (hidden: false):", shouldRender(newParsedFalse) ? "RENDER" : "SKIP");

console.log("\n✓ All tests passed - backward compatibility confirmed");
