import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { ScenarioParser, AutomationStatusCache } from "./scenarioParser";
import { CucumberConfigManager } from "./configManager";
import { StepImplementationService } from "./stepImplementationService";
import type { CucumberCodeLensProvider } from "./codeLensProvider";

export class CucumberDecorationProvider {
  private static instance: CucumberDecorationProvider;
  private automatedDecorationType: vscode.TextEditorDecorationType;
  private notAutomatedDecorationType: vscode.TextEditorDecorationType;

  // Add three types of step decorators
  private stepImplementedDecorationType: vscode.TextEditorDecorationType;
  private stepNotImplementedDecorationType: vscode.TextEditorDecorationType;
  private stepConflictDecorationType: vscode.TextEditorDecorationType;
  // Add debounce mechanism to reduce decorator update frequency
  private updateTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly DEBOUNCE_DELAY = 200; // Increase to 200ms debounce delay to ensure enough time for file switching

  // New: Python file change event emitter
  private onPythonFileChangedEmitter = new vscode.EventEmitter<{
    filePath: string;
    changeType:
      | "save"
      | "fileSystemChange"
      | "fileSystemWrite"
      | "fileCreate"
      | "fileDelete";
  }>();
  public readonly onPythonFileChanged = this.onPythonFileChangedEmitter.event;

  // Cache current decorator state for smart updates
  private currentDecorations = new Map<
    string,
    {
      stepImplemented: vscode.Range[];
      stepNotImplemented: vscode.Range[];
      stepConflict: vscode.Range[];
      automated: vscode.Range[];
      notAutomated: vscode.Range[];
    }
  >();
  private disposables: vscode.Disposable[] = [];
  private scenarioParser: ScenarioParser;
  private automationCache: AutomationStatusCache;
  private configManager: CucumberConfigManager;
  private stepService: StepImplementationService;
  // New: CodeLens provider reference for synchronized refresh
  private codeLensProvider: CucumberCodeLensProvider | undefined;

  private constructor() {
    this.scenarioParser = new ScenarioParser();
    this.automationCache = AutomationStatusCache.getInstance();
    this.configManager = CucumberConfigManager.getInstance();
    this.stepService = StepImplementationService.getInstance();

    // Create decoration type for automated scenarios - empty (removed checkmark)
    this.automatedDecorationType = vscode.window.createTextEditorDecorationType(
      {
        before: {
          contentText: "",
          color: "#4CAF50",
          margin: "0",
        },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
      }
    );

    // Decoration type for non-automated scenarios - empty (removed circle)
    this.notAutomatedDecorationType =
      vscode.window.createTextEditorDecorationType({
        before: {
          contentText: "",
          color: "#888888",
          margin: "0",
        },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
      });

    // Create step decoration type - implemented (green checkmark)
    this.stepImplementedDecorationType =
      vscode.window.createTextEditorDecorationType({
        before: {
          contentText: "✓",
          color: "#4CAF50",
          margin: "0 3px 0 0",
          width: "12px", // Control size by specifying width
          height: "12px", // Control size by specifying height
        },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
      });

    // Create step decoration type - not implemented (yellow cross)
    this.stepNotImplementedDecorationType =
      vscode.window.createTextEditorDecorationType({
        before: {
          contentText: "✗",
          color: "#FFC107",
          margin: "0 3px 0 0",
          width: "12px", // Control size by specifying width
          height: "12px", // Control size by specifying height
        },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
      });

    // Create step decoration type - conflict (red warning)
    this.stepConflictDecorationType =
      vscode.window.createTextEditorDecorationType({
        before: {
          contentText: "⚠",
          color: "#F44336",
          margin: "0 3px 0 0",
          width: "12px", // Control size by specifying width
          height: "12px", // Control size by specifying height
        },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
      });
  }

  public static getInstance(): CucumberDecorationProvider {
    if (!CucumberDecorationProvider.instance) {
      CucumberDecorationProvider.instance = new CucumberDecorationProvider();
    }
    return CucumberDecorationProvider.instance;
  }
  // Activate decoration provider
  public activate(context: vscode.ExtensionContext): void {
    // Monitor active editor changes
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          // Fix: For feature files, clear cache to ensure decorator recalculation
          if (
            editor.document.languageId === "feature" ||
            editor.document.fileName.endsWith(".feature")
          ) {
            const filePath = editor.document.uri.fsPath;
            this.currentDecorations.delete(filePath);
            console.log(
              `Switched to feature file: ${editor.document.fileName}, Decorator cache cleared`
            );
          }
          this.updateDecorationsWithDebounce(editor);
        }
      })
    );

    // Monitor document changes - use debounce to reduce frequent updates
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        const editor = vscode.window.activeTextEditor;
        if (editor && event.document === editor.document) {
          this.updateDecorationsWithDebounce(editor);
        }
      })
    ); // Monitor automation status changes, update decorations in real-time - use debounce
    this.disposables.push(
      this.automationCache.onDidChangeStatus((change) => {
        for (const editor of vscode.window.visibleTextEditors) {
          if (editor.document.uri.fsPath === change.filePath) {
            this.updateDecorationsWithDebounce(editor);
            break;
          }
        }
      })
    ); // New: Monitor Python file changes, update all visible feature file decorators in real-time
    // Listen to user manually saved files
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((document) => {
        this.handlePythonFileChange(document.uri.fsPath, "save");
      })
    );

    // New: Monitor file system level file changes (including background program writes)
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        // Only handle saved file changes, avoid handling files being edited
        if (
          !event.document.isDirty &&
          event.document.fileName.endsWith(".py")
        ) {
          this.handlePythonFileChange(
            event.document.uri.fsPath,
            "fileSystemChange"
          );
        }
      })
    ); // New: Monitor file system create/delete/modify events - only monitor Python files in steps-related directories
    const pythonFileWatcher =
      vscode.workspace.createFileSystemWatcher("**/steps/**/*.py");

    this.disposables.push(
      pythonFileWatcher.onDidChange((uri) => {
        this.handlePythonFileChange(uri.fsPath, "fileSystemWrite");
      })
    );

    this.disposables.push(
      pythonFileWatcher.onDidCreate((uri) => {
        this.handlePythonFileChange(uri.fsPath, "fileCreate");
      })
    );

    this.disposables.push(
      pythonFileWatcher.onDidDelete((uri) => {
        this.handlePythonFileChange(uri.fsPath, "fileDelete");
      })
    );

    // Register file watcher to disposables
    this.disposables.push(pythonFileWatcher); // Initial update of current editor decorations - use debounce
    if (vscode.window.activeTextEditor) {
      this.updateDecorationsWithDebounce(vscode.window.activeTextEditor);
    }

    // Register disposal function
    context.subscriptions.push(...this.disposables);

    // Add delayed initialization to ensure code lens provider has finished loading - use debounce
    setTimeout(() => {
      if (vscode.window.activeTextEditor) {
        this.updateDecorationsWithDebounce(vscode.window.activeTextEditor);
      }
    }, 1500);
  }

  // Private method: Force refresh all visible feature file decorators
  private forceRefreshAllVisibleFeatureFiles(): void {
    const editors = vscode.window.visibleTextEditors;
    this.automationCache.clearAllCache();

    try {
      const { BehaveDryRunService } = require("./BehaveDryRunService");
      const behaveDryRunService = BehaveDryRunService.getInstance();
      behaveDryRunService.invalidateCache();
    } catch (error) {
      console.error("Error clearing BehaveDryRunService cache:", error);
    }

    let featureFileCount = 0;
    for (const editor of editors) {
      if (
        editor.document.languageId === "feature" ||
        editor.document.fileName.endsWith(".feature")
      ) {
        featureFileCount++;
        const filePath = editor.document.uri.fsPath;

        console.log(
          `🔄 [${featureFileCount}] Force refresh: ${editor.document.fileName}`
        );

        // Step 3: Clear all cache for this file
        this.currentDecorations.delete(filePath);
        this.automationCache.clearFileCache(filePath);

        // Step 4: Clear debounce timeout
        const existingTimeout = this.updateTimeouts.get(filePath);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
          this.updateTimeouts.delete(filePath);
        }

        // Step 5: Clear all decorators on editor
        editor.setDecorations(this.stepImplementedDecorationType, []);
        editor.setDecorations(this.stepNotImplementedDecorationType, []);
        editor.setDecorations(this.stepConflictDecorationType, []);
        editor.setDecorations(this.automatedDecorationType, []);
        editor.setDecorations(this.notAutomatedDecorationType, []);
      }
    }

    setTimeout(() => {
      for (const editor of editors) {
        if (
          editor.document.languageId === "feature" ||
          editor.document.fileName.endsWith(".feature")
        ) {
          this.updateDecorations(editor);
        }
      }

      if (this.codeLensProvider) {
        this.codeLensProvider.refresh();
      }
    }, 100);
  }

  // Decorator update method with debounce functionality
  private updateDecorationsWithDebounce(editor: vscode.TextEditor): void {
    const filePath = editor.document.uri.fsPath;

    // Clear previous timeout
    const existingTimeout = this.updateTimeouts.get(filePath);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      this.updateDecorations(editor);
      this.updateTimeouts.delete(filePath);
    }, this.DEBOUNCE_DELAY);

    this.updateTimeouts.set(filePath, timeout);
  }

  // Update decorations for a specific editor
  public async updateDecorations(editor: vscode.TextEditor): Promise<void> {
    const document = editor.document;

    // Only process feature files
    if (
      document.languageId !== "feature" &&
      !document.fileName.endsWith(".feature")
    ) {
      return;
    }

    const automatedRanges: vscode.Range[] = [];
    const notAutomatedRanges: vscode.Range[] = [];

    // Array of step decoration ranges
    const stepImplementedRanges: vscode.Range[] = [];
    const stepNotImplementedRanges: vscode.Range[] = [];
    const stepConflictRanges: vscode.Range[] = [];

    const text = document.getText();
    const lines = text.split("\n"); // Clear all decorators first, but use smarter strategy to reduce flickering
    // We don't clear immediately, but directly override old decorators with new ones
    // This can reduce visual jumping effects

    // Used to track current scenario and its steps, and background steps
    let currentScenarioLine: number | null = null;
    let currentStepImplementations: any[] = [];
    let backgroundStepImplementations: any[] = [];
    let backgroundProcessed = false;

    // Find all Scenario lines and their steps, and Background steps
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Match Background line
      if (line.startsWith("Background:") && !backgroundProcessed) {
        // Get background automation status and implementation details
        const backgroundAutomationStatus = await this.checkBackgroundAutomation(
          document,
          i,
          lines
        );
        backgroundStepImplementations =
          backgroundAutomationStatus.implementationDetails || [];

        // Cache background implementation information
        this.automationCache.setImplementationDetails(
          document.uri.fsPath,
          i,
          backgroundStepImplementations
        );
        this.automationCache.setAutomationStatus(
          document.uri.fsPath,
          i,
          backgroundAutomationStatus.isFullyAutomated
        );

        backgroundProcessed = true;
      }
      // Match Scenario or Scenario Outline lines
      else if (
        line.startsWith("Scenario:") ||
        line.startsWith("Scenario Outline:")
      ) {
        // If new scenario is found, update current scenario line number
        currentScenarioLine = i;

        // Get scenario automation status and implementation details
        const automationStatus = await this.checkScenarioAutomation(
          document,
          i,
          lines
        );
        currentStepImplementations =
          automationStatus.implementationDetails || [];

        // Cache implementation information and automation status
        this.automationCache.setImplementationDetails(
          document.uri.fsPath,
          i,
          currentStepImplementations
        );
        this.automationCache.setAutomationStatus(
          document.uri.fsPath,
          i,
          automationStatus.isFullyAutomated
        );

        // Create scenario line range
        const range = new vscode.Range(i, 0, i, 0);

        // Apply scenario decorator based on automation status
        if (automationStatus.isFullyAutomated) {
          automatedRanges.push(range);
        } else {
          notAutomatedRanges.push(range);
        }
      }
      // Find step lines (Given, When, Then, And, But, *) - for both Scenario and Background
      else if (
        line.startsWith("Given ") ||
        line.startsWith("When ") ||
        line.startsWith("Then ") ||
        line.startsWith("And ") ||
        line.startsWith("But ") ||
        line.startsWith("* ")
      ) {
        // Create decoration range for this step line
        const stepRange = new vscode.Range(i, 0, i, 0);

        // Determine which implementation array to use based on context
        let stepImplementations: any[] = [];

        // Check if this step belongs to a Background section
        let isBackgroundStep = false;
        for (let j = i - 1; j >= 0; j--) {
          const prevLine = lines[j].trim();
          if (prevLine.startsWith("Background:")) {
            isBackgroundStep = true;
            stepImplementations = backgroundStepImplementations;
            break;
          } else if (
            prevLine.startsWith("Scenario:") ||
            prevLine.startsWith("Scenario Outline:")
          ) {
            isBackgroundStep = false;
            stepImplementations = currentStepImplementations;
            break;
          }
        }

        // If not in background and has current scenario, use scenario implementations
        if (!isBackgroundStep && currentScenarioLine !== null) {
          stepImplementations = currentStepImplementations;
        }

        if (stepImplementations.length > 0) {
          // Extract key parts from step text (remove Given/When/Then prefixes)
          const stepText = line.substring(line.indexOf(" ") + 1).trim();

          // Find matching step in the appropriate step implementation array
          const matchingStep = stepImplementations.find((step) => {
            // Try multiple matching strategies
            if (step.text === line) {
              return true;
            } // Full text match
            if (step.text === stepText) {
              return true;
            } // Match without prefix
            if (step.text.trim() === stepText.trim()) {
              return true;
            } // Match after trimming whitespace

            // If step text has prefix, remove prefix and compare
            const stepPrefix = step.text.split(" ")[0].toLowerCase();
            if (
              ["given", "when", "then", "and", "but", "*"].includes(stepPrefix)
            ) {
              const stepWithoutPrefix = step.text
                .substring(step.text.indexOf(" ") + 1)
                .trim();
              if (stepWithoutPrefix === stepText) {
                return true;
              }
            }

            return false;
          });

          if (matchingStep) {
            if (matchingStep.implemented) {
              // Explicitly check if there are multiple implementations (conflicts)
              const implementationsCount =
                matchingStep.implementations?.length || 0;
              const hasMultipleImplementations =
                matchingStep.hasMultipleImplementations ||
                implementationsCount > 1;

              if (hasMultipleImplementations) {
                // Conflicting situation - use warning decorator
                stepConflictRanges.push(stepRange);
              } else {
                // Implemented and no conflicts
                stepImplementedRanges.push(stepRange);
              }
            } else {
              // Not implemented
              stepNotImplementedRanges.push(stepRange);
            }
          } else {
            // Mark as not implemented when matching step is not found in implementation list
            stepNotImplementedRanges.push(stepRange);
          }
        } else {
          // If no implementation information is found, default to not implemented
          stepNotImplementedRanges.push(stepRange);
        }
      }
    }

    // Smart decorator update strategy - only update decorators when truly needed
    const filePath = document.uri.fsPath;
    const newDecorations = {
      stepImplemented: stepImplementedRanges,
      stepNotImplemented: stepNotImplementedRanges,
      stepConflict: stepConflictRanges,
      automated: automatedRanges,
      notAutomated: notAutomatedRanges,
    };

    // Check if decorator update is needed
    const currentDecorations = this.currentDecorations.get(filePath);
    const needsUpdate =
      !currentDecorations ||
      !this.decorationsEqual(currentDecorations, newDecorations);

    if (needsUpdate) {
      // Apply all decorators at once to avoid flickering
      editor.setDecorations(this.automatedDecorationType, automatedRanges);
      editor.setDecorations(
        this.notAutomatedDecorationType,
        notAutomatedRanges
      );
      editor.setDecorations(
        this.stepImplementedDecorationType,
        stepImplementedRanges
      );
      editor.setDecorations(
        this.stepNotImplementedDecorationType,
        stepNotImplementedRanges
      );
      editor.setDecorations(
        this.stepConflictDecorationType,
        stepConflictRanges
      );

      // Update cache
      this.currentDecorations.set(filePath, newDecorations);
    }
  }

  // Compare if two decorator configurations are the same
  private decorationsEqual(a: any, b: any): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  // Check scenario automation status
  private async checkScenarioAutomation(
    document: vscode.TextDocument,
    lineNumber: number,
    lines: string[]
  ): Promise<{
    isFullyAutomated: boolean;
    implementationDetails?: any[];
  }> {
    try {
      // Use StepImplementationService to extract all steps in the scenario
      const steps = this.stepService.extractScenarioSteps(lines, lineNumber);

      if (steps.length === 0) {
        return { isFullyAutomated: false };
      }

      // Use StepImplementationService to check step implementation status
      const stepImplementations = this.stepService.checkStepsImplementation(
        document,
        steps
      );

      // Use unified isScenarioFullyAutomated method to determine automation status
      const isFullyAutomated =
        this.stepService.isScenarioFullyAutomated(stepImplementations);

      return {
        isFullyAutomated,
        implementationDetails: stepImplementations,
      };
    } catch (error) {
      console.error("Error checking scenario automation status:", error);
      return { isFullyAutomated: false };
    }
  } // Disposal method
  public dispose(): void {
    // Clear all unfinished debounce timeouts
    for (const timeout of this.updateTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.updateTimeouts.clear();

    // Clear decorator state cache
    this.currentDecorations.clear();

    // Clean up event emitter
    this.onPythonFileChangedEmitter.dispose();

    this.automatedDecorationType.dispose();
    this.notAutomatedDecorationType.dispose();

    // Release step decorator resources
    this.stepImplementedDecorationType.dispose();
    this.stepNotImplementedDecorationType.dispose();
    this.stepConflictDecorationType.dispose();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  private handlePythonFileChange(
    pythonFilePath: string,
    changeType:
      | "save"
      | "fileSystemChange"
      | "fileSystemWrite"
      | "fileCreate"
      | "fileDelete"
  ): void {
    const isStepsRelated = pythonFilePath.includes("steps");

    if (isStepsRelated) {
      this.onPythonFileChangedEmitter.fire({
        filePath: pythonFilePath,
        changeType: changeType,
      });

      // Use debounce mechanism to avoid frequent refresh
      const debounceKey = `python-file-change-${pythonFilePath}`;
      const existingTimeout = this.updateTimeouts.get(debounceKey);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      const timeout = setTimeout(() => {
        this.forceRefreshAllVisibleFeatureFiles();
        this.updateTimeouts.delete(debounceKey);
      }, 300);

      this.updateTimeouts.set(debounceKey, timeout);
    }
  }

  /**
   * Set CodeLens provider reference for synchronized refresh
   */
  public setCodeLensProvider(codeLensProvider: CucumberCodeLensProvider): void {
    this.codeLensProvider = codeLensProvider;
  }

  // Check background automation status
  private async checkBackgroundAutomation(
    document: vscode.TextDocument,
    lineNumber: number,
    lines: string[]
  ): Promise<{
    isFullyAutomated: boolean;
    implementationDetails?: any[];
  }> {
    try {
      // Use StepImplementationService to extract all steps in the background
      const steps = this.stepService.extractBackgroundSteps(lines, lineNumber);

      if (steps.length === 0) {
        return { isFullyAutomated: false };
      }

      // Use StepImplementationService to check step implementation status
      const stepImplementations = this.stepService.checkStepsImplementation(
        document,
        steps
      );

      // Use unified isScenarioFullyAutomated method to determine automation status
      const isFullyAutomated =
        this.stepService.isScenarioFullyAutomated(stepImplementations);

      return {
        isFullyAutomated,
        implementationDetails: stepImplementations,
      };
    } catch (error) {
      console.error("Error checking background automation status:", error);
      return { isFullyAutomated: false };
    }
  }
}
