import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { CucumberConfigManager } from "./configManager";
import { BehaveDryRunService } from "./BehaveDryRunService";

/**
 * Step Implementation Service
 * Provides shared functionality for step extraction and verification
 */
export class StepImplementationService {
  private static instance: StepImplementationService;
  private configManager: CucumberConfigManager;
  private dryRunService: BehaveDryRunService;

  private constructor() {
    this.configManager = CucumberConfigManager.getInstance();
    this.dryRunService = BehaveDryRunService.getInstance();
  }

  public static getInstance(): StepImplementationService {
    if (!StepImplementationService.instance) {
      StepImplementationService.instance = new StepImplementationService();
    }
    return StepImplementationService.instance;
  }

  /**
   * Extract all steps from a scenario
   */
  public extractScenarioSteps(
    lines: string[],
    scenarioLineNumber: number
  ): string[] {
    const steps: string[] = [];
    const stepKeywords = ["Given", "When", "Then", "And", "But", "*"]; // Ensure line number is valid
    if (scenarioLineNumber < 0 || scenarioLineNumber >= lines.length) {
      console.error(`Invalid scenario line number: ${scenarioLineNumber}`);
      return steps;
    }

    // Check if current line is scenario line
    const scenarioLine = lines[scenarioLineNumber].trim(); // If current line is not scenario definition line, try to find the actual scenario line
    let actualScenarioLine = scenarioLineNumber;
    if (
      !scenarioLine.startsWith("Scenario:") &&
      !scenarioLine.startsWith("Scenario Outline:")
    ) {
      // Search upward for scenario line
      for (let i = scenarioLineNumber; i >= 0; i--) {
        if (
          lines[i].trim().startsWith("Scenario:") ||
          lines[i].trim().startsWith("Scenario Outline:")
        ) {
          actualScenarioLine = i;
          break;
        }
      }

      // If upward search fails, search downward
      if (actualScenarioLine === scenarioLineNumber) {
        for (let i = scenarioLineNumber; i < lines.length; i++) {
          if (
            lines[i].trim().startsWith("Scenario:") ||
            lines[i].trim().startsWith("Scenario Outline:")
          ) {
            actualScenarioLine = i;
            break;
          }
        }
      }
    }

    // Update scenario line number
    scenarioLineNumber = actualScenarioLine; // Find steps, starting from after the scenario line
    for (let i = scenarioLineNumber + 1; i < lines.length; i++) {
      const line = lines[i].trim();

      // If we reach the start of another scenario or feature, stop extraction
      if (
        line.startsWith("Scenario:") ||
        line.startsWith("Scenario Outline:") ||
        line.startsWith("Feature:") ||
        line.startsWith("@") ||
        (line === "" &&
          i < lines.length - 1 &&
          (lines[i + 1].trim().startsWith("@") ||
            lines[i + 1].trim().startsWith("Scenario:") ||
            lines[i + 1].trim().startsWith("Scenario Outline:")))
      ) {
        break;
      }

      // Extract steps - check if it starts with any step keyword
      // Convert all step keywords to lowercase for case-insensitive matching
      const lowerLine = line.toLowerCase();
      if (
        stepKeywords.some((keyword) =>
          lowerLine.startsWith(keyword.toLowerCase())
        )
      ) {
        steps.push(line);
      }
      // Handle data tables
      else if (line.startsWith("|") && steps.length > 0) {
        // Append data table to the previous step
        steps[steps.length - 1] += "\n" + line;
      }
      // Handle multi-line step text (DocString)
      else if (
        (line.startsWith('"""') || line.startsWith("'''")) &&
        steps.length > 0
      ) {
        // Add DocString start line
        steps[steps.length - 1] += "\n" + line;

        // Look for DocString end
        i++;
        while (i < lines.length) {
          const docLine = lines[i].trim();
          steps[steps.length - 1] += "\n" + docLine;
          if (docLine.startsWith('"""') || docLine.startsWith("'''")) {
            break; // Found DocString end marker
          }
          i++;
        }
      }
      // Handle possible step continuation lines (cases where step content is too long and split into multiple lines)
      else if (!line.startsWith("#") && line !== "" && steps.length > 0) {
        const lastStep = steps[steps.length - 1];
        // If the previous line ends with special characters (like comma, hyphen), it's likely a continuation line
        if (/[,\\-]$/.test(lastStep)) {
          steps[steps.length - 1] += " " + line;
        }
      }
    }

    return steps;
  }
  /**
   * Extract all steps from a Background section
   */
  public extractBackgroundSteps(
    lines: string[],
    backgroundLineNumber: number
  ): string[] {
    const steps: string[] = [];
    const stepKeywords = ["Given", "When", "Then", "And", "But", "*"];

    // Ensure line number is valid
    if (backgroundLineNumber < 0 || backgroundLineNumber >= lines.length) {
      console.error(`Invalid background line number: ${backgroundLineNumber}`);
      return steps;
    }

    // Check if current line is background line
    const backgroundLine = lines[backgroundLineNumber].trim();
    if (!backgroundLine.startsWith("Background:")) {
      console.error(
        `Line ${backgroundLineNumber} is not a Background line: ${backgroundLine}`
      );
      return steps;
    }

    // Find steps, starting from after the background line
    for (let i = backgroundLineNumber + 1; i < lines.length; i++) {
      const line = lines[i].trim();

      // If we reach the start of a scenario, feature, or tag, stop extraction
      if (
        line.startsWith("Scenario:") ||
        line.startsWith("Scenario Outline:") ||
        line.startsWith("Background:") ||
        line.startsWith("Feature:") ||
        line.startsWith("@") ||
        (line === "" &&
          i < lines.length - 1 &&
          (lines[i + 1].trim().startsWith("@") ||
            lines[i + 1].trim().startsWith("Scenario:") ||
            lines[i + 1].trim().startsWith("Scenario Outline:")))
      ) {
        break;
      }

      // Extract steps - check if it starts with any step keyword
      const lowerLine = line.toLowerCase();
      if (
        stepKeywords.some((keyword) =>
          lowerLine.startsWith(keyword.toLowerCase())
        )
      ) {
        steps.push(line);
      }
      // Handle data tables
      else if (line.startsWith("|") && steps.length > 0) {
        // Append data table to the previous step
        steps[steps.length - 1] += "\n" + line;
      }
      // Handle multi-line step text (DocString)
      else if (
        (line.startsWith('"""') || line.startsWith("'''")) &&
        steps.length > 0
      ) {
        // Add DocString start line
        steps[steps.length - 1] += "\n" + line;

        // Look for DocString end
        i++;
        while (i < lines.length) {
          const docLine = lines[i].trim();
          steps[steps.length - 1] += "\n" + docLine;
          if (docLine.startsWith('"""') || docLine.startsWith("'''")) {
            break; // Found DocString end marker
          }
          i++;
        }
      }
      // Handle possible step continuation lines
      else if (!line.startsWith("#") && line !== "" && steps.length > 0) {
        const lastStep = steps[steps.length - 1];
        // If the previous line ends with special characters (like comma, hyphen), it's likely a continuation line
        if (/[,\\-]$/.test(lastStep)) {
          steps[steps.length - 1] += " " + line;
        }
      }
    }

    return steps;
  }
  /**
   * Get scenario implementation status and details
   * Use BehaveDryRunService implementation instead of relying on command line
   */
  public getScenarioImplementationStatus(
    document: vscode.TextDocument,
    scenarioLineNumber: number
  ): Promise<{
    isFullyAutomated: boolean;
    implementationDetails: Array<{
      text: string;
      implemented: boolean;
      implementations?: Array<{
        file: string;
        lineNumber: number;
      }>;
      hasMultipleImplementations?: boolean;
      lineNumber?: number;
    }>;
    missingSteps: string[];
  }> {
    return new Promise((resolve) => {
      try {
        const featureFilePath = document.uri.fsPath; // Force refresh cache to ensure we get the latest step definitions
        this.dryRunService.invalidateCache();

        // Use dry run service to get implementation status of the feature file
        const dryRunResult = this.dryRunService.dryRun(featureFilePath);

        if (!dryRunResult || dryRunResult.scenarios.length === 0) {
          resolve({
            isFullyAutomated: false,
            implementationDetails: [],
            missingSteps: [],
          });
          return;
        } // Find scenario matching the current line number
        const lines = document.getText().split("\n");
        const scenarioName = this.getScenarioNameAtLine(
          lines,
          scenarioLineNumber
        );

        let targetScenario = dryRunResult.scenarios.find((s) => {
          // Try to find scenario with matching name
          return s.scenarioName === scenarioName;
        });

        // If no matching scenario found, use index position estimation
        if (!targetScenario) {
          // Estimate scenario index position - based on the order of scenarios in the file
          const scenarioIndices = this.getScenarioIndices(lines);
          let index = 0;

          for (let i = 0; i < scenarioIndices.length; i++) {
            if (
              scenarioIndices[i] <= scenarioLineNumber &&
              (i === scenarioIndices.length - 1 ||
                scenarioIndices[i + 1] > scenarioLineNumber)
            ) {
              index = i;
              break;
            }
          }

          // Ensure index is valid
          if (index >= 0 && index < dryRunResult.scenarios.length) {
            targetScenario = dryRunResult.scenarios[index];
          }
        }

        if (!targetScenario) {
          resolve({
            isFullyAutomated: false,
            implementationDetails: [],
            missingSteps: [],
          });
          return;
        } // Convert dry run results to required output format
        const implementationDetails = targetScenario.steps.map((step) => ({
          text: step.text,
          implemented: step.implemented,
          implementations: step.implementations || [],
          hasMultipleImplementations: step.hasMultipleImplementations || false,
          lineNumber: scenarioLineNumber,
        }));

        const missingSteps = targetScenario.steps
          .filter((step) => !step.implemented)
          .map((step) => step.text);

        resolve({
          isFullyAutomated: targetScenario.isFullyImplemented,
          implementationDetails,
          missingSteps,
        });
      } catch (error) {
        console.error("Error getting scenario implementation status:", error);
        resolve({
          isFullyAutomated: false,
          implementationDetails: [],
          missingSteps: [],
        });
      }
    });
  }
  /**
   * Get scenario name from specified line
   */
  private getScenarioNameAtLine(
    lines: string[],
    lineNumber: number
  ): string | null {
    // If current line is scenario line, get name directly
    const currentLine = lines[lineNumber].trim();
    if (
      currentLine.startsWith("Scenario:") ||
      currentLine.startsWith("Scenario Outline:")
    ) {
      return currentLine.substring(currentLine.indexOf(":") + 1).trim();
    }

    // Search upward for nearest scenario line
    for (let i = lineNumber; i >= 0; i--) {
      const line = lines[i].trim();
      if (
        line.startsWith("Scenario:") ||
        line.startsWith("Scenario Outline:")
      ) {
        return line.substring(line.indexOf(":") + 1).trim();
      }
    }

    // Search downward for nearest scenario line
    for (let i = lineNumber + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (
        line.startsWith("Scenario:") ||
        line.startsWith("Scenario Outline:")
      ) {
        return line.substring(line.indexOf(":") + 1).trim();
      }
    }

    return null;
  }
  /**
   * Get line numbers of all scenarios in the file
   */
  private getScenarioIndices(lines: string[]): number[] {
    const indices: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (
        line.startsWith("Scenario:") ||
        line.startsWith("Scenario Outline:")
      ) {
        indices.push(i);
      }
    }

    return indices;
  }
  /**
   * Refresh automation details panel
   * Call this method when file changes to update automation details panel
   */
  public async refreshAutomationPanel(
    document: vscode.TextDocument,
    scenarioName: string,
    scenarioLine: number
  ): Promise<
    | {
        implementationDetails: any[];
        scenarioName: string;
        scenarioLine: number;
      }
    | undefined
  > {
    try {
      console.log(
        `Refreshing automation details panel: ${scenarioName}, line number: ${scenarioLine}`
      );

      // Force refresh cache to ensure we get the latest step definitions
      this.dryRunService.invalidateCache();

      // Clear original file content cache to ensure file content is re-read
      const featurePath = document.uri.fsPath;
      const pythonFiles =
        this.configManager.findImplementationFiles(featurePath);

      // Get latest scenario implementation status
      const status = await this.getScenarioImplementationStatus(
        document,
        scenarioLine
      );

      if (status.implementationDetails.length === 0) {
        console.log(
          "No step implementation details found, unable to update panel"
        );
        return undefined;
      }

      console.log(
        `Successfully got scenario implementation status, has ${status.implementationDetails.length} steps`
      );

      return {
        implementationDetails: status.implementationDetails,
        scenarioName,
        scenarioLine,
      };
    } catch (error) {
      console.error("Error refreshing automation details panel:", error);
      return undefined;
    }
  }

  /**
   * Check step implementation status
   */
  public checkStepsImplementation(
    document: vscode.TextDocument,
    steps: string[]
  ): Array<{
    text: string;
    implemented: boolean;
    implementationFile?: string;
    implementationLine?: number;
    implementations?: Array<{
      file: string;
      lineNumber: number;
    }>;
    hasMultipleImplementations?: boolean;
  }> {
    try {
      const featurePath = document.uri.fsPath;

      // Use config manager to find implementation files
      const pythonFiles =
        this.configManager.findImplementationFiles(featurePath); // Only log when necessary
      if (pythonFiles.length === 0) {
        console.log("No implementation files found");
      }

      // Read all Python file contents
      const fileContents = new Map<string, string>();
      for (const pyFile of pythonFiles) {
        try {
          const content = fs.readFileSync(pyFile, "utf8");
          fileContents.set(pyFile, content);
        } catch (error) {
          console.error(`Error reading file ${pyFile}:`, error);
        }
      }

      // For each step, check if it's implemented in any Python file
      const results = steps.map((stepText) => {
        // Extract key parts from step text
        const stepType = stepText.split(" ")[0].toLowerCase();
        const stepPattern = stepText.replace(
          /^(Given|When|Then|And|But|\*)\s+/i,
          ""
        ); // Initialize as unimplemented status
        let implemented = false;
        let implementationFile: string | undefined = undefined;
        let implementationLine: number | undefined = undefined;

        // Used to store all matching implementations
        const allImplementations: Array<{ file: string; lineNumber: number }> =
          [];

        // Check each Python file
        for (const [pyFile, content] of fileContents.entries()) {
          // Check each line of content
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Skip comment lines
            if (line.startsWith("#")) {
              continue;
            }

            // Check if this is a step definition line and not in a multiline comment
            const decoratorMatch = line.match(
              /@(given|when|then|step)\s*\(.*\)/i
            );
            if (!decoratorMatch) {
              continue;
            }

            // Check if in multiline comment
            if (this.isInMultilineComment(lines, i)) {
              continue;
            } // Extract decorator type
            const decoratorType = decoratorMatch[1].toLowerCase();

            // Check if step types match
            if (this.stepTypesMatch(stepType, decoratorType)) {
              // Get pattern within quotes - handle nested quotes properly
              let decoratorPattern;

              // Extract the content within the decorator parentheses
              const decoratorContent = line.match(
                /@(?:given|when|then|step)\s*\((.*)\)/i
              );
              if (decoratorContent && decoratorContent[1]) {
                const content = decoratorContent[1].trim();

                // Try to extract pattern from quotes, handling both single and double quotes
                if (content.startsWith("'")) {
                  // Single quoted string
                  const endIndex = content.lastIndexOf("'");
                  if (endIndex > 0) {
                    decoratorPattern = content.substring(1, endIndex);
                  }
                } else if (content.startsWith('"')) {
                  // Double quoted string
                  const endIndex = content.lastIndexOf('"');
                  if (endIndex > 0) {
                    decoratorPattern = content.substring(1, endIndex);
                  }
                }
              }
              if (decoratorPattern) {
                // Check if patterns match
                if (this.patternMatches(stepPattern, decoratorPattern)) {
                  implemented = true; // Record first implementation (for backward compatibility)
                  if (!implementationFile) {
                    implementationFile = pyFile;
                    implementationLine = i + 1; // 1-based line number
                  }

                  // Add to the list of all implementations
                  allImplementations.push({
                    file: pyFile,
                    lineNumber: i + 1, // 1-based line number
                  });
                }
              }
            }
          }
        }

        return {
          text: stepText,
          implemented,
          implementationFile,
          implementationLine,
          implementations: allImplementations,
          hasMultipleImplementations: allImplementations.length > 1,
        };
      });

      return results;
    } catch (error) {
      console.error(`Error executing file search check:`, error);
      // Return all steps as unimplemented
      return steps.map((step) => ({ text: step, implemented: false }));
    }
  }

  /**
   * Check if step is implemented in a file (simplified version without file and line number info)
   */
  public checkStepImplementationInFile(
    fileContent: string,
    stepPattern: string
  ): boolean {
    // Split file content into lines to check if each line is commented
    const lines = fileContent.split("\n");
    const decorators = ["@given", "@when", "@then", "@step"];

    // Create regex pattern for each decorator
    for (const decorator of decorators) {
      const pattern = this.escapeRegExp(this.simplifyPattern(stepPattern));
      const regexPattern = `${decorator}\\s*\\(['\"].*${pattern}.*['\"]\\)`;
      const regex = new RegExp(regexPattern, "i");

      // Check each line
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // If line matches pattern but isn't commented out
        if (regex.test(line) && !line.startsWith("#")) {
          // Check if in multiline comment
          if (!this.isInMultilineComment(lines, i)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Check if line is in a multiline comment
   */
  public isInMultilineComment(lines: string[], lineIndex: number): boolean {
    // Look upward for unclosed multiline comment markers
    let openQuoteCount = 0;

    for (let i = 0; i < lineIndex; i++) {
      const line = lines[i];
      // Count triple quotes in the line
      const tripleDoubleQuotes = (line.match(/"""/g) || []).length;
      const tripleSingleQuotes = (line.match(/'''/g) || []).length;

      openQuoteCount += tripleDoubleQuotes + tripleSingleQuotes;
    }

    // If there's an odd number of quote markers, the current line is in a multiline comment
    return openQuoteCount % 2 === 1;
  }

  /**
   * Check if step types match
   */
  public stepTypesMatch(stepType: string, decoratorType: string): boolean {
    // If decorator is 'step', it can match any type
    if (decoratorType === "step") {
      return true;
    }

    // And/But steps can match any type
    if (["and", "but", "*"].includes(stepType)) {
      return true;
    }

    // Direct match
    return (
      stepType === decoratorType ||
      // Given can match When (to support some non-standard usage)
      (stepType === "given" && decoratorType === "when") ||
      // When can match Then (to support some non-standard usage)
      (stepType === "when" && decoratorType === "then")
    );
  } /**
   * Check if step patterns match
   */
  public patternMatches(stepText: string, pattern: string): boolean {
    try {
      // 1. Try exact match
      if (stepText === pattern) {
        return true;
      }

      // 2. Create regex pattern for parameter matching
      let regexPattern = pattern; // Handle parameter placeholders, in the following priority order:
      // - "{param}" -> "([^"]*)" (quoted parameters)
      // - {param} -> (\S+) (unquoted parameters)
      // - <param> -> (\S+) (angle bracket parameters)

      // First handle quoted curly bracket parameters: "{param}" -> "([^"]*)"
      regexPattern = regexPattern.replace(/"\{[^}]+\}"/g, '"([^"]*)"');

      // Then handle unquoted curly bracket parameters: {param} -> (\S+)
      regexPattern = regexPattern.replace(/\{[^}]+\}/g, "(\\S+)");

      // Handle angle bracket parameters: <param> -> (\S+)
      regexPattern = regexPattern.replace(/<[^>]+>/g, "(\\S+)");

      // Escape all regex special characters, but protect the capture groups we've already added
      // First use placeholders to protect our parameter patterns
      const protectedPattern = regexPattern
        .replace(/"\(\[\\?\^"\]\*\)"/g, "TEMP_QUOTED_PARAM") // Protect "([^"]*)"
        .replace(/\(\\\\S\\\+\)/g, "TEMP_UNQUOTED_PARAM"); // Protect (\S+)

      // Escape all regex special characters
      const escapedPattern = protectedPattern.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      // Restore our parameter patterns
      const finalPattern = escapedPattern
        .replace(/TEMP_QUOTED_PARAM/g, '"([^"]*)"')
        .replace(/TEMP_UNQUOTED_PARAM/g, "(\\S+)");

      // Create regex and test
      const regex = new RegExp(`^${finalPattern}$`, "i");
      if (regex.test(stepText)) {
        return true;
      } // 3. Simplified matching: remove all parameters and perform fuzzy matching
      let simplifiedPattern = pattern;

      // Remove all parameter placeholders from the pattern
      simplifiedPattern = simplifiedPattern
        .replace(/"\{[^}]+\}"/g, '".*"') // "{param}" -> ".*"
        .replace(/\{[^}]+\}/g, ".*") // {param} -> .*
        .replace(/<[^>]+>/g, ".*"); // <param> -> .*

      // Escape regex special characters
      simplifiedPattern = simplifiedPattern.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      // Restore our .* replacements
      simplifiedPattern = simplifiedPattern
        .replace(/\\\.\\\*/g, ".*") // Restore .*
        .replace(/"\.\*"/g, '".*"'); // Restore ".*"

      // Allow flexible whitespace matching
      simplifiedPattern = simplifiedPattern.replace(/\s+/g, "\\s+");

      const simplifiedRegex = new RegExp(`^${simplifiedPattern}$`, "i");
      return simplifiedRegex.test(stepText);
    } catch (error) {
      console.error(
        `Pattern matching error for step "${stepText}" with pattern "${pattern}":`,
        error
      );
      return false;
    }
  }

  /**
   * Helper method: Simplify step pattern
   */
  private simplifyPattern(pattern: string): string {
    return pattern
      .replace(/<[^>]+>/g, "") // Remove <param> format parameters
      .replace(/\{[^}]+\}/g, "") // Remove {param} format parameters
      .replace(/["'][^"']*["']/g, "") // Remove content within quotes
      .replace(/[.*+?^${}()|[\]\\]/g, "") // Remove regex special characters
      .toLowerCase()
      .trim();
  }

  /**
   * Helper method: Escape regex special characters
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  /**
   * Unified method to determine if a scenario is fully automated
   * A scenario is considered fully automated only when every step is implemented and there are no conflicts
   *
   * @param stepImplementations Array of step implementation details
   * @returns Whether it's fully automated
   */
  public isScenarioFullyAutomated(
    stepImplementations: Array<{
      implemented: boolean;
      hasMultipleImplementations?: boolean;
      implementations?: Array<any>;
    }>
  ): boolean {
    if (!stepImplementations || stepImplementations.length === 0) {
      return false;
    } // Check if all steps are implemented and have no conflicts (multiple implementations)
    return stepImplementations.every((step) => {
      // Step must be implemented
      if (!step.implemented) {
        return false;
      }

      // Check if there are conflicts (multiple implementations)
      if (step.hasMultipleImplementations) {
        return false;
      }

      // Another way to detect conflicts - by checking implementations array length
      if (step.implementations && step.implementations.length > 1) {
        return false;
      }

      // Step is implemented and has no conflicts
      return true;
    });
  }
}
