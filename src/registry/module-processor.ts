import {
  getModuleName,
  loadModule,
  createSuccessResult,
  createErrorResult,
  type ModuleLoadResult
} from "./helpers.js";
import { isRegisterableModule } from "./types.js";
import { failure } from "../core/log.js";
import type { AppContext } from "../context.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function loadFailed(name: string, error: unknown, ctx: AppContext): ModuleLoadResult {
  ctx.log(failure("module_load_failed", error, { module: name }));
  return createErrorResult(name, error);
}

/**
 * Processes a single module file: loads it, validates it, and registers it with the MCP server
 * @param filePath - The absolute path to the module file to process
 * @param server - The MCP server instance to register the module with
 * @param ctx - The dependencies handed to the module
 * @returns Promise resolving to a ModuleLoadResult indicating success or failure
 */
export async function processModule(filePath: string, server: McpServer, ctx: AppContext): Promise<ModuleLoadResult> {
  const moduleName = getModuleName(filePath);

  try {
    const module = await loadModule(filePath);

    if (module.default === undefined) {
      return loadFailed(moduleName, new Error("Missing default export"), ctx);
    }

    if (!isRegisterableModule(module.default)) {
      return loadFailed(moduleName, new Error("Invalid RegisterableModule format"), ctx);
    }

    const registerable = module.default;
    await registerable.register(server, ctx);
    ctx.log({ event: "module_registered", module: `${registerable.type}/${registerable.name}`, ok: true });
    return createSuccessResult(registerable.name, registerable.type);
  } catch (error) {
    return loadFailed(moduleName, error, ctx);
  }
}
