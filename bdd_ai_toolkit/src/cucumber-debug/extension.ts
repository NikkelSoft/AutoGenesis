import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { CucumberCodeLensProvider } from "./codeLensProvider";
import { ScenarioParser, AutomationStatusCache } from "./scenarioParser";
import { CucumberDecorationProvider } from "./decorationProvider";
import { CucumberConfigManager } from "./configManager";
import { StepImplementationService } from "./stepImplementationService";
import { BehaveDryRunService } from "./BehaveDryRunService";
import { McpServerManager } from "../setup/mcpServerManager";
import { Platform } from "../setup/platform";
import { HtmlTemplateManager } from "./htmlTemplateManager";

export function activate(context: vscode.ExtensionContext) {
  const codeLensProvider = new CucumberCodeLensProvider();
  const scenarioParser = new ScenarioParser();
  const decorationProvider = CucumberDecorationProvider.getInstance();
  const automationCache = AutomationStatusCache.getInstance();
  const htmlTemplateManager = HtmlTemplateManager.getInstance(context);

  decorationProvider.activate(context);
  decorationProvider.setCodeLensProvider(codeLensProvider);

  // Listen to Python file change events to refresh automation detail panels
  decorationProvider.onPythonFileChanged(async (event) => {
    if (currentAutomationPanel) {
      try {
        const dummyDocument = {
          fileName: event.filePath,
          isDirty: false,
        } as vscode.TextDocument;

        await refreshAllAutomationPanels(dummyDocument);
      } catch (error) {
        console.error(`Error refreshing automation detail panel:`, error);
      }
    }
  });

  // Register CodeLens provider
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: "feature" },
      codeLensProvider
    )
  );

  // Trigger initial CodeLens refresh
  setTimeout(() => codeLensProvider.refresh(), 1000);

  // Internal functions used by CodeLens buttons (no command registration needed)

  // Execute scenario function - called directly by CodeLens
  const executeScenarioInternal = async (
    uri: vscode.Uri,
    lineNumber: number,
    scenarioName: string,
    isAutomated: boolean
  ) => {
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const scenario = await scenarioParser.parseScenario(document, lineNumber);

      if (!scenario) {
        vscode.window.showErrorMessage(
          `Unable to parse scenario: ${scenarioName}`
        );
        return;
      }

      const scenarioText = await generateScenarioText(
        scenario,
        uri.fsPath,
        document
      );
      await vscode.env.clipboard.writeText(scenarioText);
      await vscode.commands.executeCommand(
        "workbench.action.chat.open",
        scenarioText
      );
      await new Promise((resolve) => setTimeout(resolve, 800));
    } catch (error) {
      vscode.window.showErrorMessage(
        `Error executing scenario: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  // Run Behave scenario function - called directly by CodeLens
  const runBehaveScenarioInternal = async (
    uri: vscode.Uri,
    lineNumber: number,
    scenarioName: string
  ) => {
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const scenario = await scenarioParser.parseScenario(document, lineNumber);

      if (!scenario) {
        vscode.window.showErrorMessage(
          `Unable to parse scenario: ${scenarioName}`
        );
        return;
      }

      const escapedScenarioName = scenarioName.replace(/"/g, '\\"');
      const featureFilePath = uri.fsPath;
      let workingDirectory = path.dirname(featureFilePath);
      let cdCommand = "";

      if (featureFilePath.includes("features")) {
        const featuresIndex = featureFilePath.lastIndexOf("features");
        if (featuresIndex > 0) {
          const featuresPath = featureFilePath.substring(
            0,
            featuresIndex + "features".length
          );
          workingDirectory = path.dirname(featuresPath);
          const command = `uv run python -m behave --name "${escapedScenarioName}"`;
          cdCommand = Platform.createCdCommand(workingDirectory, command);
        }
      }

      const behaveCommand =
        cdCommand || `uv run python -m behave --name "${escapedScenarioName}"`;
      let terminal = vscode.window.terminals.find(
        (t) => t.name === "BDD Runner"
      );
      if (!terminal) {
        terminal = vscode.window.createTerminal("BDD Runner");
      }

      terminal.show();
      terminal.sendText(behaveCommand);
      vscode.window.showInformationMessage(`Running: ${behaveCommand}`);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Error running behave scenario: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  // Execute background function - called directly by CodeLens
  const executeBackgroundInternal = async (
    uri: vscode.Uri,
    lineNumber: number,
    backgroundName: string,
    isAutomated: boolean
  ) => {
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const background = await scenarioParser.parseBackground(
        document,
        lineNumber
      );

      if (!background) {
        vscode.window.showErrorMessage(
          `Unable to parse background: ${backgroundName}`
        );
        return;
      }

      const backgroundText = await generateBackgroundText(
        background,
        uri.fsPath
      );
      await vscode.env.clipboard.writeText(backgroundText);
      await vscode.commands.executeCommand(
        "workbench.action.chat.open",
        backgroundText
      );
      await new Promise((resolve) => setTimeout(resolve, 800));
    } catch (error) {
      vscode.window.showErrorMessage(
        `Error executing background: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  // Open automation file function - called directly by CodeLens
  const openAutomationFileInternal = async (
    uri: vscode.Uri,
    scenarioName: string,
    implementationDetails: any
  ) => {
    try {
      currentAutomationPanelFilePath = uri.fsPath;
      currentAutomationPanelScenarioName = scenarioName;

      if (
        implementationDetails.length > 0 &&
        implementationDetails[0].lineNumber !== undefined
      ) {
        currentAutomationPanelScenarioLine =
          implementationDetails[0].lineNumber;
      }

      const panel = getOrCreateAutomationPanel(scenarioName);

      const stepsHtml = htmlTemplateManager.buildStepsHtml(
        implementationDetails
      );
      const html = htmlTemplateManager.renderAutomationDetails(
        scenarioName,
        implementationDetails.length,
        implementationDetails.filter((s: any) => s.implemented).length,
        implementationDetails.filter((s: any) => !s.implemented).length,
        stepsHtml
      );

      panel.webview.html = html;

      panel.webview.onDidReceiveMessage(
        async (message) => {
          switch (message.command) {
            case "openStepImplementation":
              try {
                const filePath = message.file;
                const line = message.line;

                if (fs.existsSync(filePath)) {
                  const fileUri = vscode.Uri.file(filePath);
                  const document =
                    await vscode.workspace.openTextDocument(fileUri);
                  await vscode.window.showTextDocument(document, {
                    viewColumn: vscode.ViewColumn.One,
                    selection: new vscode.Selection(line, 0, line, 0),
                  });
                } else {
                  vscode.window.showErrorMessage(
                    `Implementation file not found: ${filePath}`
                  );
                }
              } catch (error) {
                vscode.window.showErrorMessage(
                  `Error opening implementation file: ${error}`
                );
              }
              break;
            case "runTest":
              await executeScenarioInternal(
                uri,
                implementationDetails.lineNumber || 0,
                scenarioName,
                true
              );
              break;
          }
        },
        undefined,
        context.subscriptions
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Unable to display automation details: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  const showMissingStepsInternal = (missingSteps: string[]) => {
    if (!missingSteps || missingSteps.length === 0) {
      vscode.window.showInformationMessage("All steps are implemented");
      return;
    }

    const panel = getOrCreateAutomationPanel("Missing Steps");
    const stepsHtml = htmlTemplateManager.buildMissingStepsHtml(missingSteps);
    const html = htmlTemplateManager.renderAutomationDetails(
      "Missing Steps",
      missingSteps.length,
      0,
      missingSteps.length,
      stepsHtml
    );

    panel.webview.html = html;
  };

  // Register only user-facing commands that are in package.json
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "bddAiToolkit.executeScenario",
      executeScenarioInternal
    )
  );

  // Register internal commands (used by CodeLens) without package.json declaration
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cucumberDebug.runBehaveScenario",
      runBehaveScenarioInternal
    ),
    vscode.commands.registerCommand(
      "cucumberDebug.executeBackground",
      executeBackgroundInternal
    ),
    vscode.commands.registerCommand(
      "cucumberDebug.openAutomationFile",
      openAutomationFileInternal
    ),
    vscode.commands.registerCommand(
      "cucumberDebug.showMissingSteps",
      showMissingStepsInternal
    )
  );
  // Listen to document change events, handle manual and auto save uniformly
  let lastChangeTimestamp = 0;
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(async (event) => {
      // Prevent frequent triggering, add 2-second throttling
      const now = Date.now();
      if (now - lastChangeTimestamp < 2000) {
        return;
      }
      lastChangeTimestamp = now;

      // Trigger update when document is modified and has no unsaved changes (i.e., has been saved)
      if (event.document.isDirty === false) {
        console.log("Detected file save, triggering update");
        await handleDocumentChange(event.document, "save");
      }
    })
  );
  // Extract shared document change handling logic
  async function handleDocumentChange(
    document: vscode.TextDocument,
    triggerType: "save" | "autoSave"
  ): Promise<void> {
    const fileName = document.fileName;

    if (fileName.endsWith(".py") || fileName.endsWith(".feature")) {
      BehaveDryRunService.getInstance().invalidateCache();
      automationCache.clearAllCache();

      if (fileName.endsWith(".feature")) {
        automationCache.clearFileCache(fileName);
      }

      if (currentAutomationPanel) {
        await refreshAllAutomationPanels(document);
      }

      // If it's a Python file, find possibly related feature files and update
      if (fileName.endsWith(".py")) {
        const pyDir = path.dirname(fileName);
        await updateRelatedFeatureFiles(pyDir, fileName);
      }
      // If it's a feature file, directly update its decorations and CodeLens
      else {
        // Refresh CodeLens
        codeLensProvider.refresh();
      }
    }
  }

  async function refreshAllAutomationPanels(
    document: vscode.TextDocument
  ): Promise<void> {
    if (!currentAutomationPanel) {
      return;
    }

    try {
      // Recover scenario name from panel title if missing
      if (!currentAutomationPanelScenarioName) {
        const panelTitle = currentAutomationPanel.title;
        if (
          panelTitle.startsWith("Automation Details: ") &&
          panelTitle !== "Automation Details: Missing Steps"
        ) {
          currentAutomationPanelScenarioName = panelTitle.substring(
            "Automation Details: ".length
          );
        }
      }

      if (
        !currentAutomationPanelFilePath &&
        document.fileName.endsWith(".feature")
      ) {
        currentAutomationPanelFilePath = document.fileName;
      }

      if (
        !currentAutomationPanelFilePath ||
        !currentAutomationPanelScenarioName
      ) {
        return;
      }
      if (currentAutomationPanelScenarioLine === undefined) {
        try {
          const featureDoc = await vscode.workspace.openTextDocument(
            currentAutomationPanelFilePath
          );
          const lines = featureDoc.getText().split("\n");

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (
              (line.startsWith("Scenario:") ||
                line.startsWith("Scenario Outline:")) &&
              line.substring(line.indexOf(":") + 1).trim() ===
                currentAutomationPanelScenarioName
            ) {
              currentAutomationPanelScenarioLine = i;
              break;
            }
          }
        } catch (error) {
          // Ignore error, will use default value
        }
      }

      // Clear all caches
      automationCache.clearAllCache();
      const BehaveDryRunService =
        require("./BehaveDryRunService").BehaveDryRunService;
      BehaveDryRunService.getInstance().invalidateCache();

      // Get Feature file
      let featureDocument: vscode.TextDocument;
      try {
        const uri = vscode.Uri.file(currentAutomationPanelFilePath);
        featureDocument = await vscode.workspace.openTextDocument(uri);
      } catch (error) {
        console.error("Unable to open Feature file:", error);
        return;
      }

      // Get implementation status
      const stepService = StepImplementationService.getInstance();
      const lineNumber =
        currentAutomationPanelScenarioLine !== undefined
          ? currentAutomationPanelScenarioLine
          : 0;
      const scenarioName = currentAutomationPanelScenarioName;
      const lines = featureDocument.getText().split("\n");
      const steps = stepService.extractScenarioSteps(lines, lineNumber);

      if (steps.length === 0) {
        return;
      }

      const implementationDetails = stepService
        .checkStepsImplementation(featureDocument, steps)
        .map((step) => ({
          ...step,
          lineNumber,
        }));

      if (implementationDetails.length > 0) {
        vscode.commands.executeCommand(
          "cucumberDebug.openAutomationFile",
          vscode.Uri.file(currentAutomationPanelFilePath),
          scenarioName,
          implementationDetails
        );
      }
    } catch (error) {
      console.error("Error refreshing automation detail panel:", error);
    }
  }

  // Add command for diagnostics
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "bddAiToolkit.diagnoseFeatureFile",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showInformationMessage("No active editor");
          return;
        }
        const document = editor.document;

        if (
          document.languageId === "feature" ||
          document.fileName.endsWith(".feature")
        ) {
          vscode.window.showInformationMessage(
            "Current file is recognized as a feature file"
          );
        } else {
          vscode.window.showInformationMessage(
            `Current file is not recognized as a feature file (${document.languageId})`
          );
        }
      }
    )
  );

  // Register command to configure test case root directory
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "bddAiToolkit.configureRootDirectory",
      async () => {
        try {
          // Get list of workspace folders
          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage(
              "Unable to configure root directory: No workspace folder is open."
            );
            return;
          }

          const configManager = CucumberConfigManager.getInstance();
          const currentRootDir = configManager.getRootDirectory() || "";

          // Prompt user to input or select root directory
          const options: vscode.OpenDialogOptions = {
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: "Select Test Case Root Directory",
            defaultUri: vscode.Uri.file(
              currentRootDir || workspaceFolders[0].uri.fsPath
            ),
          };

          // Show folder selection dialog
          const folderUris = await vscode.window.showOpenDialog(options);
          if (!folderUris || folderUris.length === 0) {
            return;
          }

          const selectedPath = folderUris[0].fsPath;

          // Check if selected path is within workspace
          let isInWorkspace = false;
          let relativePath = selectedPath;

          for (const folder of workspaceFolders) {
            const folderPath = folder.uri.fsPath;
            if (selectedPath.startsWith(folderPath)) {
              isInWorkspace = true;
              relativePath = selectedPath.substring(folderPath.length);
              // Ensure path starts with a slash
              if (
                relativePath.startsWith("\\") ||
                relativePath.startsWith("/")
              ) {
                relativePath = relativePath.substring(1);
              }
              break;
            }
          }

          // Choose to save relative or absolute path based on whether path is within workspace
          const pathToSave = isInWorkspace ? relativePath : selectedPath;

          // Save configuration
          await configManager.setRootDirectory(pathToSave);

          // Clear cache for all files to recalculate automation status
          automationCache.clearAllCache();

          // Refresh CodeLens and decorations
          codeLensProvider.refresh();

          // Show success message
          vscode.window.showInformationMessage(
            `Test case root directory set to${isInWorkspace ? " (relative path)" : ""}: ${pathToSave}`
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Error configuring root directory: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    )
  );

  async function updateRelatedFeatureFiles(
    pyDir: string,
    pyFile: string
  ): Promise<void> {
    try {
      // Find possible feature files
      // 1. Check for same name feature file
      const featureFile = path.join(
        pyDir,
        `${path.basename(pyFile, ".py")}.feature`
      );
      if (fs.existsSync(featureFile)) {
        automationCache.clearFileCache(featureFile);
        // If currently editing this feature file, update its display
        updateFeatureFileDisplay(featureFile);
      }

      // 2. Check parent directory for feature files (if current directory is steps directory)
      if (path.basename(pyDir) === "steps") {
        const parentDir = path.dirname(pyDir);
        const featureFiles = fs
          .readdirSync(parentDir)
          .filter((f) => f.endsWith(".feature"));

        for (const file of featureFiles) {
          const fullPath = path.join(parentDir, file);
          automationCache.clearFileCache(fullPath);
          updateFeatureFileDisplay(fullPath);
        }
      }

      // 3. Check subdirectory for feature files (if features subdirectory exists)
      const featureDir = path.join(pyDir, "features");
      if (fs.existsSync(featureDir)) {
        const featureFiles = fs
          .readdirSync(featureDir)
          .filter((f) => f.endsWith(".feature"));

        for (const file of featureFiles) {
          const fullPath = path.join(featureDir, file);
          automationCache.clearFileCache(fullPath);
          updateFeatureFileDisplay(fullPath);
        }
      }

      // Refresh CodeLens display
      codeLensProvider.refresh();
    } catch (error) {
      console.error("Error finding related feature files:", error);
    }
  }

  // Helper function: update display of feature file
  function updateFeatureFileDisplay(featureFilePath: string): void {
    // Check all visible editors, find editor with matching path and update its decorations
    const editors = vscode.window.visibleTextEditors;
    for (const editor of editors) {
      if (editor.document.uri.fsPath === featureFilePath) {
        if (
          currentAutomationPanel &&
          currentAutomationPanelFilePath === featureFilePath
        ) {
          const document = editor.document;
          const scenarioName = currentAutomationPanelScenarioName;
          const scenarioLine = currentAutomationPanelScenarioLine;

          if (scenarioName && scenarioLine !== undefined) {
            const stepService = StepImplementationService.getInstance();

            stepService
              .refreshAutomationPanel(document, scenarioName, scenarioLine)
              .then((result) => {
                if (result) {
                  vscode.commands.executeCommand(
                    "cucumberDebug.openAutomationFile",
                    document.uri,
                    result.scenarioName,
                    result.implementationDetails
                  );
                }
              })
              .catch((error) => {
                console.error("Error refreshing automation panel:", error);
              });
          }
        }

        codeLensProvider.refresh();
      }
    }

    // If file is currently not visible but may open later, refresh CodeLens to ensure consistent status
    codeLensProvider.refresh();
  }
}

/**
 * Generate full scenario text, including background steps and scenario steps
 */
async function generateScenarioText(
  scenario: any,
  featureFilePath?: string,
  document?: vscode.TextDocument
): Promise<string> {
  let fullText = "";

  // Build scenario text
  fullText += `Scenario: ${scenario.name}\n`;

  // If document is provided, try to find and include Background steps first
  if (document) {
    const scenarioParser = new ScenarioParser();
    const background = await scenarioParser.findBackground(document);

    if (background && background.steps.length > 0) {
      // Add background steps directly to scenario (without Background: header)
      for (const step of background.steps) {
        fullText += `  ${step.type} ${step.text}\n`;
      }
    }
  }

  // Add all scenario steps
  for (const step of scenario.steps) {
    fullText += `  ${step.type} ${step.text}\n`;
  }

  // Get custom prompt from settings with priority: conf.json > VS Code settings > default
  const configManager = CucumberConfigManager.getInstance();
  let customPrompt =
    configManager.getCopilotPromptWithPriority(featureFilePath);

  // Check if prompt contains scenario_text placeholder
  if (customPrompt.includes("${scenario_text}")) {
    // Replace scenario_text placeholder with actual scenario text
    customPrompt = customPrompt.replace(
      /\$\{scenario_text\}/g,
      fullText.trim()
    );

    // Replace feature_file_path placeholder if present
    if (featureFilePath && customPrompt.includes("${feature_file_path}")) {
      customPrompt = customPrompt.replace(
        /\$\{feature_file_path\}/g,
        featureFilePath
      );
    }

    // Replace profiles_path placeholder if present
    if (featureFilePath && customPrompt.includes("${profiles_path}")) {
      const profilesPath = findProfilesPath(featureFilePath);
      if (profilesPath) {
        customPrompt = customPrompt.replace(
          /\$\{profiles_path\}/g,
          profilesPath
        );
      }
    }

    // Return the customized prompt (scenario text is already included)
    return customPrompt;
  } else {
    // Legacy behavior: append prompt to scenario text
    // Replace feature_file_path placeholder if present
    if (featureFilePath && customPrompt.includes("${feature_file_path}")) {
      customPrompt = customPrompt.replace(
        /\$\{feature_file_path\}/g,
        featureFilePath
      );
    }

    // Replace profiles_path placeholder if present
    if (featureFilePath && customPrompt.includes("${profiles_path}")) {
      const profilesPath = findProfilesPath(featureFilePath);
      if (profilesPath) {
        customPrompt = customPrompt.replace(
          /\$\{profiles_path\}/g,
          profilesPath
        );
      }
    }

    return fullText + `\n${customPrompt}`;
  }
}

/**
 * Generate background text for sending to Copilot
 */
async function generateBackgroundText(
  background: any,
  featureFilePath?: string
): Promise<string> {
  let fullText = "Background:\n";

  // Add all background steps
  for (const step of background.steps) {
    fullText += `  ${step.type} ${step.text}\n`;
  }

  // Get custom prompt from settings with priority: conf.json > VS Code settings > default
  const configManager = CucumberConfigManager.getInstance();
  let customPrompt =
    configManager.getCopilotPromptWithPriority(featureFilePath);

  // Check if prompt contains scenario_text placeholder
  if (customPrompt.includes("${scenario_text}")) {
    // Replace scenario_text placeholder with actual background text
    customPrompt = customPrompt.replace(
      /\$\{scenario_text\}/g,
      fullText.trim()
    );

    // Replace feature_file_path placeholder if present
    if (featureFilePath && customPrompt.includes("${feature_file_path}")) {
      customPrompt = customPrompt.replace(
        /\$\{feature_file_path\}/g,
        featureFilePath
      );
    }

    // Replace profiles_path placeholder if present
    if (featureFilePath && customPrompt.includes("${profiles_path}")) {
      const profilesPath = findProfilesPath(featureFilePath);
      if (profilesPath) {
        customPrompt = customPrompt.replace(
          /\$\{profiles_path\}/g,
          profilesPath
        );
      }
    }

    // Return the customized prompt (background text is already included)
    return customPrompt;
  } else {
    // Legacy behavior: append prompt to background text
    // Replace feature_file_path placeholder if present
    if (featureFilePath && customPrompt.includes("${feature_file_path}")) {
      customPrompt = customPrompt.replace(
        /\$\{feature_file_path\}/g,
        featureFilePath
      );
    }

    // Replace profiles_path placeholder if present
    if (featureFilePath && customPrompt.includes("${profiles_path}")) {
      const profilesPath = findProfilesPath(featureFilePath);
      if (profilesPath) {
        customPrompt = customPrompt.replace(
          /\$\{profiles_path\}/g,
          profilesPath
        );
      }
    }

    return fullText + `\n${customPrompt}`;
  }
}

// Add global variable to track current panel
let currentAutomationPanel: vscode.WebviewPanel | undefined = undefined;
let currentAutomationPanelFilePath: string | undefined = undefined;
let currentAutomationPanelScenarioLine: number | undefined = undefined;
let currentAutomationPanelScenarioName: string | undefined = undefined;

/**
 * Get or create automation details panel
 * Ensure details are always displayed in the right window, reuse existing panel
 */
function getOrCreateAutomationPanel(scenarioName: string): vscode.WebviewPanel {
  // If panel already exists and has not been disposed, reuse it
  if (currentAutomationPanel) {
    try {
      // Update title
      currentAutomationPanel.title = `Automation Details: ${scenarioName}`;
      // Ensure panel is visible and displayed on the right
      currentAutomationPanel.reveal(vscode.ViewColumn.Two);
      return currentAutomationPanel;
    } catch (error) {
      // If panel has been disposed, current variable reference is invalid
      currentAutomationPanel = undefined;
    }
  }

  // Create new panel, specify to open on the right side of the editor (use fixed ViewColumn.Two)
  currentAutomationPanel = vscode.window.createWebviewPanel(
    "automationDetails",
    `Automation Details: ${scenarioName}`,
    vscode.ViewColumn.Two, // Fixed to use second column, i.e., right side
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(path.join(__dirname, "resources"))],
    }
  );

  // Handle panel close event
  currentAutomationPanel.onDidDispose(() => {
    currentAutomationPanel = undefined;
    currentAutomationPanelFilePath = undefined;
    currentAutomationPanelScenarioLine = undefined;
    currentAutomationPanelScenarioName = undefined;
  }, null);

  return currentAutomationPanel;
}
export function deactivate() {
  if (currentAutomationPanel) {
    currentAutomationPanel.dispose();
    currentAutomationPanel = undefined;
  }
}

function findProfilesPath(featureFilePath: string): string | null {
  try {
    let currentDir = path.dirname(featureFilePath);

    // Traverse up two levels
    for (let i = 0; i < 2; i++) {
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        // Reached root directory
        break;
      }
      currentDir = parentDir;
    }

    // Look for profiles directory in the current level
    const profilesPath = path.join(currentDir, "profiles");
    if (
      fs.existsSync(profilesPath) &&
      fs.statSync(profilesPath).isDirectory()
    ) {
      return profilesPath;
    }

    return null;
  } catch (error) {
    console.error("Error finding profiles path:", error);
    return null;
  }
}
