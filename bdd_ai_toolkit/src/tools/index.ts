import * as vscode from "vscode";
import { TestCaseGeneratorTool } from "./testCaseGenerator";
import { XMindParser } from "./xmindParser";
// import { FigmaExtractor } from './figmaExtractor';
// import { TestCaseOptimizerTool } from './testCaseOptimizer';
import {
  NaturalLanguageTaskExecutor,
  executeNaturalLanguageTask,
} from "./naturalLanguageTaskExecutor";
// import { XMindToTestCaseTool } from './xmindToTestCase';

export function registerTools(context: vscode.ExtensionContext) {
  // Register Language Model Tools

  // Internal tools - registered but not exposed in package.json contributions
  // These tools are used internally by other tools or workflows
  context.subscriptions.push(
    vscode.lm.registerTool("testCaseGenerator", new TestCaseGeneratorTool())
  );
  context.subscriptions.push(
    vscode.lm.registerTool("xmindParser", new XMindParser())
  );

  // Public tools - exposed to users
  // Figma extractor - hidden from public release
  // context.subscriptions.push(vscode.lm.registerTool('extractFigmaLogic', new FigmaExtractor()));
  // Test case optimizer - hidden from public release
  // context.subscriptions.push(vscode.lm.registerTool('testCaseOptimizer', new TestCaseOptimizerTool()));
  context.subscriptions.push(
    vscode.lm.registerTool(
      "sendNaturalLanguageTask",
      new NaturalLanguageTaskExecutor()
    )
  );
  // context.subscriptions.push(vscode.lm.registerTool('xmindToTestCase', new XMindToTestCaseTool()));

  // Register VS Code Commands
  registerNaturalLanguageTaskCommand(context);
}

// Re-export interfaces and the executeNaturalLanguageTask function for use in main extension
export { executeNaturalLanguageTask } from "./naturalLanguageTaskExecutor";
// Command registration function moved from naturalLanguageTaskExecutor.ts
function registerNaturalLanguageTaskCommand(
  context: vscode.ExtensionContext
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "bddAiToolkit.executeNaturalLanguageTask",
      async () => {
        const taskDescription = await vscode.window.showInputBox({
          prompt: "Enter natural language task description",
          placeHolder:
            'Describe the task you want to execute (e.g., "Click the login button and enter credentials")',
          value: "",
        });

        if (taskDescription) {
          await executeNaturalLanguageTask(taskDescription);
        }
      }
    )
  );
}

// Re-export interfaces
export * from "./interfaces";
