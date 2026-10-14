import { z } from "zod";
import type { AppContext } from "../context.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const moduleTypeSchema = z.enum(["tool", "resource", "prompt"]);

export const registerableModuleSchema = z.object({
  type: moduleTypeSchema,
  name: z.string(),
  description: z.string().optional(),
  register: z.function()
    .args(z.any(), z.any())
    .returns(z.union([z.void(), z.promise(z.void())]))
});

export type RegisterableModule = Omit<z.infer<typeof registerableModuleSchema>, "register"> & {
  register: (server: McpServer, ctx: AppContext) => void | Promise<void>;
};

export function isRegisterableModule(module: unknown): module is RegisterableModule {
  const result = registerableModuleSchema.safeParse(module);
  return result.success;
}