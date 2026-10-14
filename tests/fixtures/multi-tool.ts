import { z } from "zod";
import type { RegisterableModule } from "../../src/registry/types.js";

const fixture: RegisterableModule = {
  type: "tool",
  name: "fixture",
  register(server) {
    server.registerTool(
      "alpha",
      { description: "Echo a number.", inputSchema: { n: z.number() } },
      ({ n }) => ({ content: [{ type: "text", text: String(n) }] }),
    );
    server.registerTool("beta", { description: "Say beta." }, () => ({ content: [{ type: "text", text: "beta" }] }));
  },
};

export default fixture;
