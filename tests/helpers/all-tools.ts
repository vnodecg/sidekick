import { readdirSync } from "node:fs";
import { z } from "zod";
import { makeContext } from "./context.js";
import { connectModules } from "./tool-client.js";
import type { TestContext } from "./context.js";
import type { ToolClient } from "./tool-client.js";
import type { RegisterableModule } from "../../src/registry/types.js";

const TOOLS_DIR = new URL("../../src/tools/", import.meta.url);

const propertySchema = z.object({
  type: z.string().optional(),
  enum: z.array(z.unknown()).optional(),
  pattern: z.string().optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  maxLength: z.number().optional(),
  minItems: z.number().optional(),
  items: z.object({ type: z.string().optional(), maxLength: z.number().optional() }).optional(),
});
const inputSchema = z.object({ properties: z.record(propertySchema).default({}) });

type Property = z.infer<typeof propertySchema>;

export type ToolSpec = {
  name: string;
  properties: Record<string, Property>;
};

export type AllTools = ToolClient & {
  made: TestContext;
  specs: Array<ToolSpec>;
};

const isFreeString = (property: { type?: string; enum?: Array<unknown>; pattern?: string }): boolean =>
  property.type === "string" && property.enum === undefined && property.pattern === undefined;

export const isFreeText = (property: Property): boolean =>
  isFreeString(property) || (property.type === "array" && property.items !== undefined && isFreeString(property.items));

const fit = (text: string, maxLength: number | undefined): string => text.slice(0, maxLength ?? text.length);

/*
 * Every registered module under src/tools, so a new tool is picked up with no edit here.
 */
async function loadToolModules(): Promise<Array<RegisterableModule>> {
  const files = readdirSync(TOOLS_DIR).filter((file) => file.endsWith(".ts"));
  const modules = await Promise.all(
    files.map(async (file) => (await import(new URL(file, TOOLS_DIR).href)) as { default: RegisterableModule }),
  );
  return modules.map((module) => module.default);
}

export async function startAllTools(env?: Record<string, string>): Promise<AllTools> {
  const made = makeContext(env);
  const client = await connectModules(await loadToolModules(), made.ctx);
  const specs = (await client.tools()).map(({ name, inputSchema: schema }) => ({
    name,
    properties: inputSchema.parse(schema).properties,
  }));
  return { ...client, made, specs };
}

export function freeTextNames(spec: ToolSpec): Array<string> {
  return Object.entries(spec.properties)
    .filter(([, property]) => isFreeText(property))
    .map(([name]) => name);
}

function valueFor(property: Property, text: string): unknown {
  if (property.type === "array") return [fit(text, property.items?.maxLength), fit(text, property.items?.maxLength)];
  if (isFreeString(property)) return fit(text, property.maxLength);
  if (property.type === "integer" || property.type === "number") {
    return Math.min(property.maximum ?? 25, Math.max(property.minimum ?? 1, 25));
  }
  if (property.type === "boolean") return false;
  return "08:30";
}

/*
 * One argument set per enum value (or a single set), with every free-text
 * property carrying `text`; `overrides` replaces a property's value outright.
 * A patterned string other than a time of day is left out.
 */
export function argSets(spec: ToolSpec, text: string, overrides: Record<string, unknown> = {}): Array<Record<string, unknown>> {
  let sets: Array<Record<string, unknown>> = [{}];
  for (const [name, property] of Object.entries(spec.properties)) {
    const options = name in overrides ? [overrides[name]] : (property.enum ?? [valueFor(property, text)]);
    const skip = property.pattern !== undefined && !new RegExp(property.pattern).test("08:30");
    if (!skip) sets = sets.flatMap((set) => options.map((option) => ({ ...set, [name]: option })));
  }
  return sets;
}
