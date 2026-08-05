import type { HamzawiTool } from "./types";

/**
 * Central registry of Hamzawi's capabilities.
 *
 * The Core (Reasoner → Validator) works through this registry only — it never
 * switches on hardcoded tool ids. Adding a future tool is a single
 * register() call; the Reasoner prompt picks it up automatically via
 * describeAll(). This is the foundation for the plugin-style additions that
 * come after the beta.
 */
export class ToolRegistryImpl {
  private tools = new Map<string, HamzawiTool>();

  register(tool: HamzawiTool): void {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool already registered: ${tool.id}`);
    }
    this.tools.set(tool.id, tool);
  }

  get(id: string): HamzawiTool | undefined {
    return this.tools.get(id);
  }

  list(): HamzawiTool[] {
    return [...this.tools.values()];
  }

  /**
   * Human-readable summary of the currently-enabled tools, consumed by the
   * Reasoner so a newly registered tool is announced to the model without any
   * manual prompt editing.
   */
  describeAll(): string {
    const lines = [...this.tools.values()]
      .filter((t) => t.enabled())
      .map((t) => `- ${t.id}: ${t.description} (متاح من مستوى ${t.requiredLevel})`);
    if (lines.length === 0) return "(لا توجد أدوات متاحة حالياً)";
    return lines.join("\n");
  }
}

export const toolRegistry = new ToolRegistryImpl();
