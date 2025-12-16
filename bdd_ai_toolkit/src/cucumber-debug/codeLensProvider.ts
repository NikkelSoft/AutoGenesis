import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { AutomationStatusCache } from "./scenarioParser";
import { CucumberConfigManager } from "./configManager";
import { StepImplementationService } from "./stepImplementationService";

export class CucumberCodeLensProvider implements vscode.CodeLensProvider {
  private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses =
    this.onDidChangeCodeLensesEmitter.event;
  private automationCache = AutomationStatusCache.getInstance();
  private configManager = CucumberConfigManager.getInstance();
  private stepService = StepImplementationService.getInstance();

  refresh(): void {
    this.onDidChangeCodeLensesEmitter.fire();
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    // Check if it is a feature file
    const isFeatureFile =
      document.languageId === "feature" ||
      document.fileName.endsWith(".feature");
    if (!isFeatureFile) {
      return [];
    }

    const codeLenses: vscode.CodeLens[] = [];
    const text = document.getText();
    const lines = text.split("\n");

    // Find all Background and Scenario lines
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Match Background line
      if (line.startsWith("Background:")) {
        const range = new vscode.Range(i, 0, i, line.length);

        // Check automation status for Background steps
        const automationStatus = this.isBackgroundAutomated(document, i, lines);

        // Add automation status to cache
        this.automationCache.setAutomationStatus(
          document.uri.fsPath,
          i,
          automationStatus.isFullyAutomated
        );

        // 1. Add automation status button for Background
        if (automationStatus.isFullyAutomated) {
          codeLenses.push(
            new vscode.CodeLens(range, {
              title: `$(verified) Background Automated`,
              command: "cucumberDebug.openAutomationFile",
              arguments: [
                document.uri,
                "Background",
                automationStatus.implementationDetails,
              ],
            })
          );
        } else {
          codeLenses.push(
            new vscode.CodeLens(range, {
              title: `$(circle-slash) Background Not Fully Automated`,
              tooltip: "Some background steps are missing implementations",
              command: "cucumberDebug.openAutomationFile",
              arguments: [
                document.uri,
                "Background",
                automationStatus.implementationDetails,
              ],
            })
          );
        }

        // 2. Add "Send to Copilot" button for Background
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `$(comment-discussion) Send Background to Copilot`,
            command: "cucumberDebug.executeBackground",
            arguments: [
              document.uri,
              i,
              "Background",
              automationStatus.isFullyAutomated,
            ],
          })
        );
      }
      // Match Scenario or Scenario Outline lines
      else if (
        line.startsWith("Scenario:") ||
        line.startsWith("Scenario Outline:")
      ) {
        const scenarioName = line.substring(line.indexOf(":") + 1).trim();
        const range = new vscode.Range(i, 0, i, line.length);

        // Check automation status
        const automationStatus = this.isScenarioAutomated(document, i, lines);

        // Add automation status to cache
        this.automationCache.setAutomationStatus(
          document.uri.fsPath,
          i,
          automationStatus.isFullyAutomated
        );

        // 1. Add automation status button
        // Determine button title and clickability based on automation status
        if (automationStatus.isFullyAutomated) {
          codeLenses.push(
            new vscode.CodeLens(range, {
              title: `$(verified) Automated`,
              command: "cucumberDebug.openAutomationFile",
              arguments: [
                document.uri,
                scenarioName,
                automationStatus.implementationDetails,
              ],
            })
          );
        } else {
          // Not fully automated button is clickable and shows implementation status
          codeLenses.push(
            new vscode.CodeLens(range, {
              title: `$(circle-slash) Not Fully Automated`,
              tooltip: "Some steps are missing implementations",
              command: "cucumberDebug.openAutomationFile",
              arguments: [
                document.uri,
                scenarioName,
                automationStatus.implementationDetails,
              ],
            })
          );
        }

        // 2. Add "Send to Copilot" button (renamed from "Run")
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `$(comment-discussion) Send to Copilot`,
            command: "bddAiToolkit.executeScenario",
            arguments: [
              document.uri,
              i,
              scenarioName,
              automationStatus.isFullyAutomated,
            ],
          })
        );

        // 3. Add new "Run" button for behave command
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `$(play) Run`,
            command: "cucumberDebug.runBehaveScenario",
            arguments: [document.uri, i, scenarioName],
          })
        );
      }
    }

    return codeLenses;
  }

  // Helper method to check if a scenario is automated
  private isScenarioAutomated(
    document: vscode.TextDocument,
    lineNumber: number,
    lines: string[]
  ): {
    isFullyAutomated: boolean;
    implementationDetails: any;
    missingSteps: string[];
  } {
    // First check if we already have cached implementation details
    const cachedDetails = this.automationCache.getImplementationDetails(
      document.uri.fsPath,
      lineNumber
    );
    if (cachedDetails) {
      // We already have cached details, use them
      // Use unified isScenarioFullyAutomated method to determine automation status
      const isFullyAutomated =
        this.stepService.isScenarioFullyAutomated(cachedDetails);
      const missingSteps = cachedDetails
        .filter((step) => !step.implemented)
        .map((step) => step.text);

      return {
        isFullyAutomated,
        implementationDetails: cachedDetails,
        missingSteps,
      };
    }

    // If not cached, extract and check steps
    // 1. Use StepImplementationService to extract all steps in the scenario
    const steps = this.stepService.extractScenarioSteps(lines, lineNumber);

    // If there are no steps, consider it not automated
    if (steps.length === 0) {
      return {
        isFullyAutomated: false,
        implementationDetails: [],
        missingSteps: [],
      };
    }

    // 2. Use StepImplementationService to check the implementation status of each step
    const stepImplementations = this.stepService.checkStepsImplementation(
      document,
      steps
    );

    // Cache the results for future use
    this.automationCache.setImplementationDetails(
      document.uri.fsPath,
      lineNumber,
      stepImplementations
    ); // 3. Determine if all steps are implemented - use unified isScenarioFullyAutomated method to determine automation status
    const isFullyAutomated =
      this.stepService.isScenarioFullyAutomated(stepImplementations);

    // 4. Collect unimplemented steps
    const missingSteps = stepImplementations
      .filter((step) => !step.implemented)
      .map((step) => step.text);

    return {
      isFullyAutomated,
      implementationDetails: stepImplementations,
      missingSteps,
    };
  }

  // Helper method to check if background steps are automated
  private isBackgroundAutomated(
    document: vscode.TextDocument,
    lineNumber: number,
    lines: string[]
  ): {
    isFullyAutomated: boolean;
    implementationDetails: any;
    missingSteps: string[];
  } {
    // First check if we already have cached implementation details
    const cachedDetails = this.automationCache.getImplementationDetails(
      document.uri.fsPath,
      lineNumber
    );

    if (cachedDetails) {
      // We already have cached details, use them
      const isFullyAutomated =
        this.stepService.isScenarioFullyAutomated(cachedDetails);
      const missingSteps = cachedDetails
        .filter((step) => !step.implemented)
        .map((step) => step.text);

      return {
        isFullyAutomated,
        implementationDetails: cachedDetails,
        missingSteps,
      };
    }

    // If not cached, extract and check background steps
    const steps = this.stepService.extractBackgroundSteps(lines, lineNumber);

    // If there are no steps, consider it not automated
    if (steps.length === 0) {
      return {
        isFullyAutomated: false,
        implementationDetails: [],
        missingSteps: [],
      };
    }

    // Check the implementation status of each step
    const stepImplementations = this.stepService.checkStepsImplementation(
      document,
      steps
    );

    // Cache the results for future use
    this.automationCache.setImplementationDetails(
      document.uri.fsPath,
      lineNumber,
      stepImplementations
    );

    // Determine if all steps are implemented
    const isFullyAutomated =
      this.stepService.isScenarioFullyAutomated(stepImplementations);

    // Collect unimplemented steps
    const missingSteps = stepImplementations
      .filter((step) => !step.implemented)
      .map((step) => step.text);

    return {
      isFullyAutomated,
      implementationDetails: stepImplementations,
      missingSteps,
    };
  }
}
