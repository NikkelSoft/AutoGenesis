import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { DEFAULT_COPILOT_PROMPT } from "../constants/prompts";

/**
 * Cucumber Debug Configuration Manager
 * Used to manage test case root directory and implementation file patterns
 */
export class CucumberConfigManager {
  private static instance: CucumberConfigManager;

  private constructor() {}

  public static getInstance(): CucumberConfigManager {
    if (!CucumberConfigManager.instance) {
      CucumberConfigManager.instance = new CucumberConfigManager();
    }
    return CucumberConfigManager.instance;
  } /**
   * Get test case root directory
   * Returns the configured value if root directory is set; otherwise returns null
   */
  public getRootDirectory(): string | null {
    const config = vscode.workspace.getConfiguration("bddAiToolkit.cucumber");
    const rootDir = config.get<string>("rootDirectory");

    if (!rootDir || rootDir.trim() === "") {
      return null;
    }

    // If absolute path, return directly
    if (path.isAbsolute(rootDir)) {
      return fs.existsSync(rootDir) ? rootDir : null;
    }

    // If relative path, resolve relative to workspace
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }

    // Try to resolve path using the first workspace folder
    const resolvedPath = path.join(workspaceFolders[0].uri.fsPath, rootDir);
    return fs.existsSync(resolvedPath) ? resolvedPath : null;
  }

  /**
   * Get implementation file patterns
   */
  public getImplementationPatterns(): string[] {
    const config = vscode.workspace.getConfiguration("bddAiToolkit.cucumber");
    const patterns = config.get<string[]>("implementationPattern");

    return patterns || ["*.py", "steps/*.py"];
  }

  /**
   * Set test case root directory
   */
  public async setRootDirectory(rootDir: string): Promise<void> {
    const config = vscode.workspace.getConfiguration("bddAiToolkit.cucumber");
    await config.update(
      "rootDirectory",
      rootDir,
      vscode.ConfigurationTarget.Workspace
    );
  }

  /**
   * Set implementation file patterns
   */
  public async setImplementationPatterns(patterns: string[]): Promise<void> {
    const config = vscode.workspace.getConfiguration("bddAiToolkit.cucumber");
    await config.update(
      "implementationPattern",
      patterns,
      vscode.ConfigurationTarget.Workspace
    );
  } /**
   * Get Copilot prompt text
   * Returns the configured value for the prompt appended to scenarios sent to Copilot
   */
  public getCopilotPrompt(): string {
    const config = vscode.workspace.getConfiguration("bddAiToolkit.cucumber");
    const prompt = config.get<string>("copilotPrompt");

    return prompt || DEFAULT_COPILOT_PROMPT;
  }

  /**
   * Set Copilot prompt text
   */
  public async setCopilotPrompt(prompt: string): Promise<void> {
    const config = vscode.workspace.getConfiguration("bddAiToolkit.cucumber");
    await config.update(
      "copilotPrompt",
      prompt,
      vscode.ConfigurationTarget.Workspace
    );
  }

  /**
   * Get Copilot prompt text with priority: bdd_ai_conf.json > VS Code settings > default
   * @param featurePath Optional path to the feature file to help locate bdd_ai_conf.json
   * @returns The Copilot prompt text
   */
  public getCopilotPromptWithPriority(featurePath?: string): string {
    // Try to find bdd_ai_conf.json first
    let confJsonPath: string | null = null;

    if (featurePath) {
      // Try to find bdd_ai_conf.json in the same directory as the feature file or its parent directories
      let currentDir = path.dirname(featurePath);
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

      while (
        currentDir &&
        (workspaceRoot ? currentDir.startsWith(workspaceRoot) : true)
      ) {
        const testPath = path.join(currentDir, "bdd_ai_conf.json");
        if (fs.existsSync(testPath)) {
          confJsonPath = testPath;
          break;
        }
        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) {
          break;
        } // Reached root
        currentDir = parentDir;
      }
    }

    // If not found through feature path, try workspace root
    if (!confJsonPath && vscode.workspace.workspaceFolders?.[0]) {
      const workspaceConfPath = path.join(
        vscode.workspace.workspaceFolders[0].uri.fsPath,
        "bdd_ai_conf.json"
      );
      if (fs.existsSync(workspaceConfPath)) {
        confJsonPath = workspaceConfPath;
      }
    }

    // Try to read from bdd_ai_conf.json
    if (confJsonPath) {
      try {
        const confContent = fs.readFileSync(confJsonPath, "utf8");
        const confData = JSON.parse(confContent);
        if (
          confData.COPILOT_PROMPT &&
          typeof confData.COPILOT_PROMPT === "string" &&
          confData.COPILOT_PROMPT.trim() !== ""
        ) {
          console.log(
            `Using Copilot prompt from bdd_ai_conf.json: ${confJsonPath}`
          );
          return confData.COPILOT_PROMPT;
        }
      } catch (error) {
        console.warn(
          `Failed to read COPILOT_PROMPT from bdd_ai_conf.json (${confJsonPath}):`,
          error
        );
      }
    }

    // Fallback to VS Code settings or default
    console.log("Using Copilot prompt from VS Code settings or default");
    return this.getCopilotPrompt();
  }

  /**
   * Set Copilot prompt text with priority: save to conf.json if it exists, otherwise to VS Code settings
   * @param prompt The prompt text to save
   * @param featurePath Optional path to the feature file to help locate bdd_ai_conf.json
   */
  public async setCopilotPromptWithPriority(
    prompt: string,
    featurePath?: string
  ): Promise<void> {
    // Try to find bdd_ai_conf.json first
    let confJsonPath: string | null = null;

    if (featurePath) {
      // Try to find bdd_ai_conf.json in the same directory as the feature file or its parent directories
      let currentDir = path.dirname(featurePath);
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

      while (
        currentDir &&
        (workspaceRoot ? currentDir.startsWith(workspaceRoot) : true)
      ) {
        const testPath = path.join(currentDir, "bdd_ai_conf.json");
        if (fs.existsSync(testPath)) {
          confJsonPath = testPath;
          break;
        }
        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) {
          break;
        } // Reached root
        currentDir = parentDir;
      }
    }

    // If not found through feature path, try workspace root
    if (!confJsonPath && vscode.workspace.workspaceFolders?.[0]) {
      const workspaceConfPath = path.join(
        vscode.workspace.workspaceFolders[0].uri.fsPath,
        "bdd_ai_conf.json"
      );
      if (fs.existsSync(workspaceConfPath)) {
        confJsonPath = workspaceConfPath;
      }
    }

    // Try to save to bdd_ai_conf.json if it exists
    if (confJsonPath) {
      try {
        const confContent = fs.readFileSync(confJsonPath, "utf8");
        const confData = JSON.parse(confContent);
        confData.COPILOT_PROMPT = prompt;

        fs.writeFileSync(
          confJsonPath,
          JSON.stringify(confData, null, 4),
          "utf8"
        );
        console.log(
          `Copilot prompt saved to bdd_ai_conf.json: ${confJsonPath}`
        );
        return;
      } catch (error) {
        console.warn(
          `Failed to save COPILOT_PROMPT to bdd_ai_conf.json (${confJsonPath}):`,
          error
        );
      }
    }

    // Fallback to VS Code settings
    console.log("Saving Copilot prompt to VS Code settings");
    await this.setCopilotPrompt(prompt);
  }

  /**
   * Get suitable search directories based on feature file and user configuration
   * @param featurePath Full path of the feature file
   * @returns List of directories where step implementations should be searched
   */
  public getSearchDirectories(featurePath: string): string[] {
    // Get user configured root directory
    const userRootDir = this.getRootDirectory();

    // If user configured a root directory, only use that directory
    // if (userRootDir) {
    //     return [userRootDir];
    // }    // Otherwise, use enhanced search strategy
    const featureDir = path.dirname(featurePath);
    const searchDirs: string[] = [];

    // 1. Add feature file current directory
    searchDirs.push(featureDir);

    // 2. Add steps subdirectory under feature file current directory
    searchDirs.push(path.join(featureDir, "steps"));

    const parentDir = path.dirname(featureDir);

    // 4. Add steps subdirectory under parent directory
    searchDirs.push(path.join(parentDir, "steps"));

    return searchDirs;
  }

  /**
   * Find all matching implementation files based on feature file path and implementation patterns
   * @param featurePath Full path of the feature file
   * @returns List of all matching Python implementation file paths
   */
  public findImplementationFiles(featurePath: string): string[] {
    const patterns = this.getImplementationPatterns();
    const searchDirs = this.getSearchDirectories(featurePath);
    const implementationFiles: string[] = [];
    const visitedDirs = new Set<string>(); // Prevent circular references

    // Recursively find files in directory
    const findFilesRecursively = (dir: string, pattern: string, depth = 0) => {
      // Avoid too deep recursion and duplicate directories
      if (depth > 5 || visitedDirs.has(dir)) {
        return;
      }
      visitedDirs.add(dir);

      try {
        if (!fs.existsSync(dir)) {
          return;
        }
        const files = fs.readdirSync(dir);

        // Process files in current directory
        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stats = fs.statSync(fullPath);

          if (stats.isDirectory()) {
            // If it's a directory, process recursively
            // Especially when directory is under steps subdirectory
            findFilesRecursively(fullPath, pattern, depth + 1);
          } else if (this.matchPattern(file, pattern)) {
            // If it's a file and matches pattern, add to results
            implementationFiles.push(fullPath);
          }
        }
      } catch (error) {
        console.error(`Error recursively finding files (${dir}): ${error}`);
      }
    };

    // Process each search directory
    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) {
        continue;
      }
      for (const pattern of patterns) {
        try {
          // If pattern contains "/", parse as subdirectory
          if (pattern.includes("/")) {
            const parts = pattern.split("/");
            const subDirPart = parts.slice(0, -1).join("/");
            const filePart = parts[parts.length - 1];

            const subPath = path.join(dir, subDirPart);
            if (fs.existsSync(subPath)) {
              findFilesRecursively(subPath, filePart);
            }
          } else {
            // Simple pattern, search files in current directory
            // Also recursively search subdirectories
            findFilesRecursively(dir, pattern);
          }
        } catch (error) {
          console.error(`Error finding implementation files: ${error}`);
        }
      }
    }

    return implementationFiles;
  }

  /**
   * Simple wildcard matching function
   * @param fileName File name
   * @param pattern Pattern
   * @returns Whether it matches
   */
  private matchPattern(fileName: string, pattern: string): boolean {
    // Convert to regular expression
    const regexPattern = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*");

    const regex = new RegExp(`^${regexPattern}$`, "i");
    return regex.test(fileName);
  }
}
