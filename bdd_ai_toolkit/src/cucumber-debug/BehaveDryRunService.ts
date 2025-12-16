import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { CucumberConfigManager } from "./configManager";

/**
 * Dry Run result interface definitions
 */
interface StepResult {
  text: string;
  implemented: boolean;
  implementations?: Array<{
    file: string;
    lineNumber: number;
  }>;
  hasMultipleImplementations?: boolean;
}

interface ScenarioResult {
  scenarioName: string;
  isFullyImplemented: boolean;
  steps: StepResult[];
}

interface DryRunResult {
  featureFile: string;
  isFullyImplemented: boolean;
  scenarios: ScenarioResult[];
}

/**
 * Step definition information interface
 */
interface StepDefinition {
  pattern: RegExp;
  file: string;
  lineNumber: number;
  stepType: string;
}

/**
 * Scenario state during Gherkin file parsing
 */
interface ParsedScenario {
  name: string;
  steps: Array<{
    keyword: string;
    text: string;
    line: number;
  }>;
}

/**
 * Behave Dry Run Service
 * Implements Behave's dry run functionality without using command line
 */
export class BehaveDryRunService {
  private static instance: BehaveDryRunService;
  private configManager: CucumberConfigManager;
  private stepDefinitions: StepDefinition[] = [];
  private stepDefinitionsLastUpdate = 0;
  private stepDefinitionCacheValidity = 5000; // Cache validity period, 5 seconds

  private constructor() {
    this.configManager = CucumberConfigManager.getInstance();
  }

  public static getInstance(): BehaveDryRunService {
    if (!BehaveDryRunService.instance) {
      BehaveDryRunService.instance = new BehaveDryRunService();
    }
    return BehaveDryRunService.instance;
  }
  /**
   * Force refresh step definition cache
   * Call this method when files change to ensure immediate access to the latest step definitions
   */ public invalidateCache(): void {
    // Set last update time to 0, ensuring reload on next loadStepDefinitions call
    this.stepDefinitionsLastUpdate = 0;
    // Clear existing cache
    this.stepDefinitions = [];
    // Immediately reload all step definitions instead of waiting for next dryRun call
    this.loadStepDefinitions();
  }

  /**
   * Execute dry run analysis
   * @param featureFilePath Feature file path
   */ public dryRun(featureFilePath: string): DryRunResult | null {
    try {
      // Force refresh cache before each run to ensure latest step definitions
      this.invalidateCache();

      // Parse feature file
      const featureContent = fs.readFileSync(featureFilePath, "utf8");
      const parsedFeature = this.parseFeatureFile(featureContent);

      if (!parsedFeature || parsedFeature.scenarios.length === 0) {
        return null;
      }

      // Analyze whether steps in each scenario are implemented
      const scenarios: ScenarioResult[] = parsedFeature.scenarios.map(
        (scenario) => {
          const steps: StepResult[] = scenario.steps.map((step) => {
            const implementations = this.findStepImplementation(
              step.keyword,
              step.text
            );
            const hasMultipleImpls = implementations.length > 1;

            const result: StepResult = {
              text: `${step.keyword} ${step.text}`,
              implemented: implementations.length > 0,
              hasMultipleImplementations: hasMultipleImpls,
              implementations: implementations.map((impl) => ({
                file: impl.file,
                lineNumber: impl.lineNumber,
              })),
            }; // Use enhanced method to process step results, ensuring compatibility with old format
            return this.enhanceStepResult(result);
          });

          return {
            scenarioName: scenario.name,
            isFullyImplemented: steps.every((step) => step.implemented),
            steps,
          };
        }
      );

      return {
        featureFile: featureFilePath,
        isFullyImplemented: scenarios.every((s) => s.isFullyImplemented),
        scenarios,
      };
    } catch (error) {
      console.error("Error executing dry run:", error);
      return null;
    }
  }
  /**
   * Load all step definitions
   * and cache results to improve performance
   */
  private loadStepDefinitions(): void {
    const now = Date.now();
    // If cache is valid, return directly
    if (
      this.stepDefinitions.length > 0 &&
      now - this.stepDefinitionsLastUpdate < this.stepDefinitionCacheValidity
    ) {
      return;
    }

    this.stepDefinitions = [];
    // Use correct method name: findImplementationFiles instead of findStepDefinitionFiles
    // Since this method requires a featurePath parameter, use empty string or current working directory
    const implementationFiles = this.configManager.findImplementationFiles("");

    implementationFiles.forEach((file) => {
      try {
        const content = fs.readFileSync(file, "utf8");
        const definitions = this.extractStepDefinitionsFromFile(content, file);
        this.stepDefinitions.push(...definitions);
      } catch (error) {
        console.error(`Error parsing step definition file ${file}:`, error);
      }
    });

    this.stepDefinitionsLastUpdate = now;
  }
  /**
   * Extract step definitions from implementation file
   */
  private extractStepDefinitionsFromFile(
    content: string,
    filePath: string
  ): StepDefinition[] {
    const definitions: StepDefinition[] = [];
    const lines = content.split("\n");

    // Common Behave step decorator regular expressions
    const stepDecorators = [
      /@given\s*\((?:[\"']|u[\"'])(.*?)(?:[\"'])\)/i,
      /@when\s*\((?:[\"']|u[\"'])(.*?)(?:[\"'])\)/i,
      /@then\s*\((?:[\"']|u[\"'])(.*?)(?:[\"'])\)/i,
      /@step\s*\((?:[\"']|u[\"'])(.*?)(?:[\"'])\)/i,
    ];

    const stepTypes = ["given", "when", "then", "step"];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      for (let j = 0; j < stepDecorators.length; j++) {
        const match = stepDecorators[j].exec(line);
        if (match) {
          try {
            // Convert behave regex pattern to JavaScript regex pattern
            const pattern = this.convertBehaveRegexToJs(match[1]);

            definitions.push({
              pattern,
              file: filePath,
              lineNumber: i,
              stepType: stepTypes[j],
            });
          } catch (error) {
            console.error(
              `Unable to parse step definition: ${match[1]}`,
              error
            );
          }
        }
      }
    }

    return definitions;
  }
  /**
   * Convert Behave regular expressions to JavaScript regular expressions
   */ private convertBehaveRegexToJs(behavePattern: string): RegExp {
    // Replace common regex differences in behave
    let pattern = behavePattern;

    // Handle Behave/Cucumber parameter placeholders
    // {text} -> matches any non-quoted string, but preserve literal text
    // "{text}" -> matches quoted string, but preserve literal text
    // First escape regex special characters, except placeholders we need to handle
    pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, (match) => {
      // Don't escape braces because we need to handle parameter placeholders
      if (match === "{" || match === "}") {
        return match;
      }
      return "\\" + match;
    });

    // Handle quoted parameter placeholders: "{text}" -> "([^"]*)"
    pattern = pattern.replace(/"\{(\w+)\}"/g, '"([^"]*)"');

    // Handle unquoted parameter placeholders: {text} -> (\S+)
    pattern = pattern.replace(/\{(\w+)\}/g, "(\\S+)");

    // Handle named capture groups, convert Python style to JS style
    // Python: (?P<name>...) -> JS: (?<name>...)
    pattern = pattern.replace(/\(\?P<(\w+)>/g, "(?<$1>"); // Convert string to regular expression
    try {
      return new RegExp(`^${pattern}$`, "i");
    } catch (error) {
      // If conversion fails, try a more lenient match
      console.warn(
        `Unable to convert "${behavePattern}" to JS regex, using simple string matching`
      );
      return new RegExp(`^${this.escapeRegExp(behavePattern)}$`, "i");
    }
  }

  /**
   * Escape regular expression special characters
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  /**
   * Find step implementation
   */
  private findStepImplementation(
    keyword: string,
    text: string
  ): StepDefinition[] {
    const normalizedKeyword = keyword.toLowerCase().trim();
    let stepType: string;

    if (normalizedKeyword.includes("given")) {
      stepType = "given";
    } else if (normalizedKeyword.includes("when")) {
      stepType = "when";
    } else if (normalizedKeyword.includes("then")) {
      stepType = "then";
    } else if (
      normalizedKeyword.includes("and") ||
      normalizedKeyword.includes("but")
    ) {
      // And and But are determined by previous step type, default to use all types
      stepType = "step";
    } else {
      stepType = "step";
    }

    // Collect all matching implementations instead of just taking the first one
    const matchingDefinitions: StepDefinition[] = [];

    // First try to find specific type of step
    // Given preferentially matches Given, When preferentially matches When, etc.
    this.stepDefinitions.forEach((def) => {
      if (
        (def.stepType === stepType || def.stepType === "step") &&
        def.pattern.test(text)
      ) {
        matchingDefinitions.push(def);
      }
    });

    // If not found, try to search in all step types
    if (matchingDefinitions.length === 0 && stepType !== "step") {
      this.stepDefinitions.forEach((def) => {
        if (
          def.pattern.test(text) &&
          !matchingDefinitions.some(
            (existing) =>
              existing.file === def.file &&
              existing.lineNumber === def.lineNumber
          )
        ) {
          matchingDefinitions.push(def);
        }
      });
    }

    return matchingDefinitions;
  }
  /**
   * Parse feature file content
   */
  private parseFeatureFile(content: string): {
    scenarios: ParsedScenario[];
  } | null {
    try {
      const lines = content.split("\n");
      const scenarios: ParsedScenario[] = [];

      let currentScenario: ParsedScenario | null = null;
      let inScenario = false;
      let featureFound = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Skip empty lines and comments
        if (!line || line.startsWith("#")) {
          continue;
        }

        // Check if it's a feature line
        if (line.startsWith("Feature:")) {
          featureFound = true;
          continue;
        }

        // Only parse scenarios after finding Feature
        if (!featureFound) {
          continue;
        }

        // Check if it's a scenario or scenario outline line
        if (
          line.startsWith("Scenario:") ||
          line.startsWith("Scenario Outline:")
        ) {
          // If already parsing a scenario, save the previous one first
          if (currentScenario) {
            scenarios.push(currentScenario);
          }

          // Start new scenario
          const scenarioName = line.substring(line.indexOf(":") + 1).trim();
          currentScenario = {
            name: scenarioName,
            steps: [],
          };
          inScenario = true;
          continue;
        }

        // Check step lines in scenario
        if (inScenario && currentScenario) {
          const stepMatch = line.match(/^(Given|When|Then|And|But)\s+(.*)/i);
          if (stepMatch) {
            currentScenario.steps.push({
              keyword: stepMatch[1],
              text: stepMatch[2],
              line: i,
            });
          }
          // If encountering Examples line, stay in current scenario outline
          else if (line.startsWith("Examples:")) {
            // Skip example tables for now
            continue;
          }
          // If encountering table line (starting and ending with |), stay in current step
          else if (line.startsWith("|") && line.endsWith("|")) {
            // Skip table data for now
            continue;
          }
          // Possibly multi-line string (""")
          else if (line.startsWith('"""') || line.endsWith('"""')) {
            // Handle multi-line strings
            continue;
          }
          // Scenario background
          else if (line.startsWith("Background:")) {
            // Skip background for now
            continue;
          }
        }
      }

      // Don't forget the last scenario
      if (currentScenario) {
        scenarios.push(currentScenario);
      }

      return { scenarios };
    } catch (error) {
      console.error("Error parsing feature file:", error);
      return null;
    }
  }

  /**
   * Compatible processing of step results in old format, ensuring implementations array is always populated
   * @param stepResult Original step result
   * @returns Processed step result
   */
  private enhanceStepResult(stepResult: any): StepResult {
    // Check if old format is used (implementationFile instead of implementations)
    if (
      stepResult.implemented &&
      !stepResult.implementations &&
      stepResult.implementationFile
    ) {
      // Convert old format to new format
      stepResult.implementations = [
        {
          file: stepResult.implementationFile,
          lineNumber: stepResult.implementationLine,
        },
      ];
    }

    // Ensure implementations is always an array
    if (stepResult.implemented && !stepResult.implementations) {
      stepResult.implementations = [];
    }

    // Determine if there are multiple implementations
    if (stepResult.implementations && stepResult.implementations.length > 1) {
      stepResult.hasMultipleImplementations = true;
    }

    return stepResult;
  }
}
