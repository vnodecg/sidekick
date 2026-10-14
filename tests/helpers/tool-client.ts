import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../../src/context.js";
import type { RegisterableModule } from "../../src/registry/types.js";

export type ToolClient = {
  call: (name: string, args?: Record<string, unknown>) => Promise<{ text: string; meta: Record<string, unknown> | undefined }>;
  close: () => Promise<void>;
};

export async function connectModule(module: RegisterableModule, ctx: AppContext): Promise<ToolClient> {
  const server = new McpServer({ name: "test", version: "0" });
  await module.register(server, ctx);
  const client = new Client({ name: "test-client", version: "0" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return {
    call: async (name, args = {}) => {
      const result = await client.callTool({ name, arguments: args });
      const block = (result.content as Array<{ type: string; text?: string }>)[0];
      return { text: block?.text ?? "", meta: result._meta };
    },
    close: () => client.close(),
  };
}
