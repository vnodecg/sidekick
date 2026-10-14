import {
  getRootDir,
  countResults,
  findModuleFiles
} from "./helpers.js";
import { processModule } from "./module-processor.js";
import type { AppContext } from "../context.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export async function autoRegisterModules(server: McpServer, ctx: AppContext): Promise<void> {
  const rootDir = getRootDir(import.meta.url);
  const files = await findModuleFiles(rootDir);

  const results = await Promise.allSettled(
    files.map(filePath => processModule(filePath, server, ctx))
  );

  const { successful, failed } = countResults(results);
  ctx.log({ event: "modules_registered", ok: failed === 0, detail: `${String(successful)} successful, ${String(failed)} failed` });
}
