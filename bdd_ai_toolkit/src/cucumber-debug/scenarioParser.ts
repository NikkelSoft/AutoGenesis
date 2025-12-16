import * as vscode from "vscode";

export interface Step {
  type: string; // 'Given', 'When', 'Then', 'And', 'But'
  text: string;
}

export interface Background {
  steps: Step[];
  lineNumber: number;
  lineStart: number;
  lineEnd: number;
}

export interface Scenario {
  name: string;
  tags: string[];
  steps: Step[];
  lineNumber: number;
  lineStart: number;
  lineEnd: number;
}

// Add a shared automation status cache service
export class AutomationStatusCache {
  private static instance: AutomationStatusCache;
  // Use Map to store scenario automation status for each file, key is "filePath:lineNumber", value is automation status
  private statusCache: Map<string, boolean>;
  // Add cache for step implementation details to avoid redundant processing
  private implementationCache: Map<string, any[]>;

  // Add event notification mechanism
  private statusChangeEventEmitter = new vscode.EventEmitter<{
    filePath: string;
    lineNumber: number;
    isAutomated: boolean;
  }>();
  public readonly onDidChangeStatus = this.statusChangeEventEmitter.event;

  private constructor() {
    this.statusCache = new Map<string, boolean>();
    this.implementationCache = new Map<string, any[]>();
  }

  public static getInstance(): AutomationStatusCache {
    if (!AutomationStatusCache.instance) {
      AutomationStatusCache.instance = new AutomationStatusCache();
    }
    return AutomationStatusCache.instance;
  }

  // Set automation status for a specific file line
  public setAutomationStatus(
    filePath: string,
    lineNumber: number,
    isAutomated: boolean
  ): void {
    const key = `${filePath}:${lineNumber}`;
    const oldValue = this.statusCache.get(key);

    // Only trigger event when status actually changes
    if (oldValue !== isAutomated) {
      this.statusCache.set(key, isAutomated);
      // Trigger status change event
      this.statusChangeEventEmitter.fire({ filePath, lineNumber, isAutomated });
    } else {
      this.statusCache.set(key, isAutomated);
    }
  }

  // Set implementation details for a specific file line
  public setImplementationDetails(
    filePath: string,
    lineNumber: number,
    details: any[]
  ): void {
    const key = `${filePath}:${lineNumber}`;
    this.implementationCache.set(key, details);
  }

  // Get automation status for a specific file line
  public getAutomationStatus(
    filePath: string,
    lineNumber: number
  ): boolean | undefined {
    const key = `${filePath}:${lineNumber}`;
    return this.statusCache.get(key);
  }

  // Get implementation details for a specific file line
  public getImplementationDetails(
    filePath: string,
    lineNumber: number
  ): any[] | undefined {
    const key = `${filePath}:${lineNumber}`;
    return this.implementationCache.get(key);
  }

  // Clear all cache for a specific file
  public clearFileCache(filePath: string): void {
    const keysToDelete: string[] = [];

    for (const key of this.statusCache.keys()) {
      if (key.startsWith(`${filePath}:`)) {
        keysToDelete.push(key);
      }
    }

    // Delete cache and trigger events
    for (const key of keysToDelete) {
      this.statusCache.delete(key);
      this.implementationCache.delete(key);
      const lineNumber = parseInt(key.split(":")[1]);
      // Trigger status change event (undefined indicates recalculation needed)
      this.statusChangeEventEmitter.fire({
        filePath,
        lineNumber,
        isAutomated: undefined as any,
      });
    }
  }

  // Clear all cache
  public clearAllCache(): void {
    this.statusCache.clear();
    this.implementationCache.clear();
    // No event triggered, as this is typically used to reset the entire system
  }
}

export class ScenarioParser {
  /**
   * Parse specific scenario in the document
   */
  public async parseScenario(
    document: vscode.TextDocument,
    lineNumber: number
  ): Promise<Scenario | null> {
    const text = document.getText();
    const lines = text.split("\n");

    // Verify if selected line is a scenario line
    if (lineNumber >= lines.length) {
      return null;
    }

    const line = lines[lineNumber].trim();
    if (
      !line.startsWith("Scenario:") &&
      !line.startsWith("Scenario Outline:")
    ) {
      return null;
    }

    // Extract scenario name
    const scenarioName = line.substring(line.indexOf(":") + 1).trim();

    // Look upward for tags
    const tags: string[] = [];
    let startLine = lineNumber;

    for (let i = lineNumber - 1; i >= 0; i--) {
      const prevLine = lines[i].trim();

      // Check for tags
      if (prevLine.startsWith("@")) {
        tags.push(
          ...prevLine
            .split(" ")
            .filter((tag) => tag.startsWith("@"))
            .map((tag) => tag.trim())
        );
        startLine = i;
        continue;
      }

      // If empty line or other content is encountered, stop looking upward
      if (
        prevLine === "" ||
        (!prevLine.startsWith("#") && !prevLine.startsWith("@"))
      ) {
        break;
      }
    }

    // Look downward for steps and scenario end
    const steps: Step[] = [];
    let endLine = lineNumber;

    for (let i = lineNumber + 1; i < lines.length; i++) {
      const nextLine = lines[i].trim();

      // Check if it's a step
      if (
        nextLine.startsWith("Given ") ||
        nextLine.startsWith("When ") ||
        nextLine.startsWith("Then ") ||
        nextLine.startsWith("And ") ||
        nextLine.startsWith("But ")
      ) {
        const stepType = nextLine.split(" ")[0];
        const stepText = nextLine.substring(stepType.length).trim();

        steps.push({
          type: stepType,
          text: stepText,
        });

        endLine = i;
      }
      // Check if next scenario or tag is reached
      else if (
        nextLine.startsWith("Scenario:") ||
        nextLine.startsWith("Scenario Outline:") ||
        nextLine.startsWith("@")
      ) {
        break;
      }
      // Empty line could be scenario end, but could also be gap between steps
      else if (nextLine === "" && i < lines.length - 1) {
        // Check if next line is the start of a new scenario/tag
        const lineAfter = lines[i + 1].trim();
        if (
          lineAfter.startsWith("Scenario:") ||
          lineAfter.startsWith("Scenario Outline:") ||
          lineAfter.startsWith("@")
        ) {
          break;
        }
      }
    }

    return {
      name: scenarioName,
      tags,
      steps,
      lineNumber,
      lineStart: startLine,
      lineEnd: endLine,
    };
  }

  /**
   * Parse Background section in the document
   */
  public async parseBackground(
    document: vscode.TextDocument,
    lineNumber: number
  ): Promise<Background | null> {
    const text = document.getText();
    const lines = text.split("\n");

    // Verify if selected line is a Background line
    if (lineNumber >= lines.length) {
      return null;
    }

    const line = lines[lineNumber].trim();
    if (!line.startsWith("Background:")) {
      return null;
    }

    const startLine = lineNumber;

    // Look downward for steps and background end
    const steps: Step[] = [];
    let endLine = lineNumber;

    for (let i = lineNumber + 1; i < lines.length; i++) {
      const nextLine = lines[i].trim();

      // Check if it's a step
      if (
        nextLine.startsWith("Given ") ||
        nextLine.startsWith("When ") ||
        nextLine.startsWith("Then ") ||
        nextLine.startsWith("And ") ||
        nextLine.startsWith("But ")
      ) {
        const stepType = nextLine.split(" ")[0];
        const stepText = nextLine.substring(stepType.length).trim();

        steps.push({
          type: stepType,
          text: stepText,
        });

        endLine = i;
      }
      // Check if next scenario, background, feature, or tag is reached
      else if (
        nextLine.startsWith("Scenario:") ||
        nextLine.startsWith("Scenario Outline:") ||
        nextLine.startsWith("Background:") ||
        nextLine.startsWith("Feature:") ||
        nextLine.startsWith("@")
      ) {
        break;
      }
      // Empty line could be background end, but could also be gap between steps
      else if (nextLine === "" && i < lines.length - 1) {
        // Check if next line is the start of a new scenario/tag/background
        const lineAfter = lines[i + 1].trim();
        if (
          lineAfter.startsWith("Scenario:") ||
          lineAfter.startsWith("Scenario Outline:") ||
          lineAfter.startsWith("Background:") ||
          lineAfter.startsWith("@")
        ) {
          break;
        }
      }
    }

    return {
      steps,
      lineNumber,
      lineStart: startLine,
      lineEnd: endLine,
    };
  }

  /**
   * Find Background section in the document
   */
  public async findBackground(
    document: vscode.TextDocument
  ): Promise<Background | null> {
    const text = document.getText();
    const lines = text.split("\n");

    // Find Background line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("Background:")) {
        return this.parseBackground(document, i);
      }
    }

    return null;
  }
}
