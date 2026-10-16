import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface SimulatorMcpClient {
  listTools(): Promise<Array<{ name: string; description?: string; inputSchema: Record<string, unknown> }>>;
  callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult>;
  readResource(uri: string): Promise<string>;
  close(): Promise<void>;
}

export class LoopbackMcpClient implements SimulatorMcpClient {
  private client = new Client({ name: "ellie-simulator", version: "0.1.0" });
  private transport: StreamableHTTPClientTransport;
  private connected = false;
  constructor(private readonly baseUrl: string) { this.transport = this.makeTransport(); }
  private makeTransport(): StreamableHTTPClientTransport { return new StreamableHTTPClientTransport(new URL("/mcp", this.baseUrl)); }
  private async connect(force = false): Promise<void> {
    if (this.connected && !force) return;
    if (this.connected) await this.transport.close().catch(() => undefined);
    this.client = new Client({ name: "ellie-simulator", version: "0.1.0" });
    this.transport = this.makeTransport();
    await this.client.connect(this.transport);
    this.connected = true;
  }
  async listTools() {
    await this.connect();
    const response = await this.client.listTools();
    return response.tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema as Record<string, unknown> }));
  }
  async callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    await this.connect();
    try { return await this.client.callTool({ name, arguments: args }) as CallToolResult; }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/404|400|session/i.test(message)) throw error;
      await this.connect(true);
      return this.client.callTool({ name, arguments: args }) as Promise<CallToolResult>;
    }
  }
  async readResource(uri: string): Promise<string> {
    await this.connect();
    const resource = await this.client.readResource({ uri });
    return String(resource.contents.find((entry) => "text" in entry)?.text ?? "");
  }
  async close(): Promise<void> { if (!this.connected) return; this.connected = false; await this.transport.close().catch(() => undefined); }
}
