import * as vscode from "vscode";
import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import { Platform } from "./platform";
import { checkCommandExists } from "./environment";

/**
 * Interface for detailed Python check results
 */
export interface PythonCheckResult {
  isValid: boolean;
  version?: string;
  error?: string;
  executable?: string;
  detailedError?: string;
  foundVersions?: Array<{
    command: string;
    version: string;
    isCompatible: boolean;
  }>;
  installationGuidance?: string;
}

/**
 * Get the Python executable path for a UV virtual environment
 * @param venvPath Path to the UV virtual environment
 * @returns The path to the Python executable in the virtual environment
 */
export function getUvVenvPythonPath(venvPath: string): string {
  return Platform.isWindows
    ? path.join(venvPath, "Scripts", "python.exe")
    : path.join(venvPath, "bin", "python");
}

/**
 * Clean package name by removing version specifiers
 * @param packageName The package name to clean
 * @returns The cleaned package name
 */
export function cleanPackageName(packageName: string): string {
  return packageName
    .split(/[>=<!=~]/)[0]
    .trim()
    .toLowerCase();
}

/**
 * Parse requirements.txt and extract package names
 * @param requirementsPath Path to requirements.txt file
 * @returns Array of package names
 */
export async function getRequiredPackagesFromFile(
  requirementsPath: string
): Promise<string[]> {
  try {
    const content = fs.readFileSync(requirementsPath, "utf8");
    const lines = content.split("\n");
    const packages: string[] = [];

    console.log(`Parsing requirements file: ${requirementsPath}`);
    console.log(`File content:\n${content}`);

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and comments (# or //)
      if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("//")) {
        // Extract package name using the helper function
        const packageName = cleanPackageName(trimmed);
        if (packageName) {
          packages.push(packageName);
          console.log(`Found package in requirements.txt: ${packageName}`);
        }
      } else if (trimmed) {
        console.log(`Skipping line as comment or empty: ${trimmed}`);
      }
    }

    console.log(
      `Parsed ${packages.length} packages from requirements.txt:`,
      packages
    );
    return packages;
  } catch (error) {
    console.error("Error reading requirements.txt:", error);
    return [];
  }
}

/**
 * Check Python installation and version compatibility with enhanced error reporting
 * @returns Promise with detailed Python status information
 */
export async function checkPythonInstallation(): Promise<PythonCheckResult> {
  console.log("Checking Python installation...");

  // Helper function to get pyenv Python paths
  function getPyenvPythonPaths(): string[] {
    const homeDir = require("os").homedir();
    const pyenvPaths: string[] = [];

    if (Platform.isWindows) {
      // Windows pyenv paths
      const pyenvRoot = process.env.PYENV_ROOT || path.join(homeDir, ".pyenv");
      const pyenvWinRoot =
        process.env.PYENV_ROOT || path.join(homeDir, ".pyenv-win");

      try {
        // Check .pyenv/pyenv-win/shims
        if (fs.existsSync(path.join(pyenvRoot, "pyenv-win", "shims"))) {
          pyenvPaths.push(
            path.join(pyenvRoot, "pyenv-win", "shims", "python.exe")
          );
          pyenvPaths.push(
            path.join(pyenvRoot, "pyenv-win", "shims", "python3.exe")
          );
        }

        // Check .pyenv-win/shims
        if (fs.existsSync(path.join(pyenvWinRoot, "shims"))) {
          pyenvPaths.push(path.join(pyenvWinRoot, "shims", "python.exe"));
          pyenvPaths.push(path.join(pyenvWinRoot, "shims", "python3.exe"));
        }
      } catch (error) {
        console.log("Error checking pyenv Windows paths:", error);
      }
    } else {
      // Unix-like systems pyenv paths
      const pyenvRoot = process.env.PYENV_ROOT || path.join(homeDir, ".pyenv");

      try {
        if (fs.existsSync(path.join(pyenvRoot, "shims"))) {
          pyenvPaths.push(path.join(pyenvRoot, "shims", "python"));
          pyenvPaths.push(path.join(pyenvRoot, "shims", "python3"));
        }
      } catch (error) {
        console.log("Error checking pyenv Unix paths:", error);
      }
    }

    return pyenvPaths.filter((p) => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    });
  }

  // List of Python executables to try (in order of preference)
  const systemPythonExecutables = Platform.isWindows
    ? ["python", "python3", "py"]
    : ["python3", "python"];

  // Get pyenv Python paths
  const pyenvPythonPaths = getPyenvPythonPaths();

  // Get Homebrew Python paths for macOS - dynamically discover installed versions
  let homebrewPythonPaths: string[] = [];
  if (Platform.isMacOS) {
    try {
      // Check common Homebrew prefixes
      const homebrewPrefixes = ["/opt/homebrew", "/usr/local"];

      for (const prefix of homebrewPrefixes) {
        const optDir = path.join(prefix, "opt");

        if (fs.existsSync(optDir)) {
          // Find all python@X.Y directories
          const entries = fs.readdirSync(optDir);
          const pythonDirs = entries.filter((entry) =>
            entry.match(/^python@\d+\.\d+$/)
          );

          // Add python3 executable paths from each version directory
          for (const pythonDir of pythonDirs) {
            const pythonPath = path.join(optDir, pythonDir, "bin", "python3");
            if (fs.existsSync(pythonPath)) {
              homebrewPythonPaths.push(pythonPath);
            }
          }
        }

        // Also check the main bin directory
        const mainBinPython = path.join(prefix, "bin", "python3");
        if (fs.existsSync(mainBinPython)) {
          homebrewPythonPaths.push(mainBinPython);
        }
      }

      // Sort paths to prioritize newer versions (higher version numbers first)
      homebrewPythonPaths.sort((a, b) => {
        const versionA = a.match(/python@(\d+\.\d+)/);
        const versionB = b.match(/python@(\d+\.\d+)/);

        if (versionA && versionB) {
          const [majorA, minorA] = versionA[1].split(".").map(Number);
          const [majorB, minorB] = versionB[1].split(".").map(Number);

          // Sort by major version first, then minor version (descending)
          if (majorA !== majorB) {
            return majorB - majorA;
          }
          return minorB - minorA;
        }

        // Put versioned paths before non-versioned ones
        if (versionA && !versionB) return -1;
        if (!versionA && versionB) return 1;

        return a.localeCompare(b);
      });

      console.log(
        "Dynamically found Homebrew Python paths:",
        homebrewPythonPaths
      );
    } catch (error) {
      console.log("Error discovering Homebrew Python paths:", error);
      // Fallback to checking common locations
      const fallbackPaths = [
        "/opt/homebrew/bin/python3",
        "/usr/local/bin/python3",
      ];

      homebrewPythonPaths = fallbackPaths.filter((p) => {
        try {
          return fs.existsSync(p);
        } catch {
          return false;
        }
      });

      console.log("Using fallback Homebrew Python paths:", homebrewPythonPaths);
    }
  }

  // Combine system executables with pyenv and homebrew paths, with Homebrew paths prioritized for macOS
  const allPythonExecutables = Platform.isMacOS
    ? [...homebrewPythonPaths, ...systemPythonExecutables, ...pyenvPythonPaths]
    : [...systemPythonExecutables, ...pyenvPythonPaths];

  console.log("Checking Python executables:", allPythonExecutables);

  const foundVersions: Array<{
    command: string;
    version: string;
    isCompatible: boolean;
  }> = [];
  const seenVersions = new Set<string>(); // Track versions to avoid duplicates
  let detailedError = "";
  let hasAnyPython = false;

  for (const pythonCmd of allPythonExecutables) {
    try {
      const result = await new Promise<{ version?: string; error?: string }>(
        (resolve) => {
          cp.exec(
            `"${pythonCmd}" --version`,
            { timeout: 5000 },
            (error, stdout, stderr) => {
              if (error) {
                resolve({ error: error.message });
                return;
              }

              const output = stdout || stderr;
              const versionMatch = output.match(/Python (\d+\.\d+\.\d+)/);

              if (versionMatch) {
                const version = versionMatch[1];
                resolve({ version });
              } else {
                resolve({ error: "Could not parse Python version" });
              }
            }
          );
        }
      );

      if (result.version) {
        hasAnyPython = true;

        // Skip if we've already seen this version (avoid duplicate reporting)
        if (seenVersions.has(result.version)) {
          console.log(
            `Skipping duplicate Python ${result.version} from command: ${pythonCmd}`
          );
          continue;
        }

        seenVersions.add(result.version);
        const [major, minor] = result.version.split(".").map(Number);
        // Keep minimum compatibility at 3.10, while recommending 3.13.3
        const isCompatible = major > 3 || (major === 3 && minor >= 10);

        foundVersions.push({
          command: pythonCmd,
          version: result.version,
          isCompatible,
        });

        if (isCompatible) {
          const sourceInfo = pyenvPythonPaths.includes(pythonCmd)
            ? " (pyenv)"
            : "";
          console.log(
            `✅ Found compatible Python ${result.version} using command: ${pythonCmd}${sourceInfo}`
          );
          return {
            isValid: true,
            version: result.version,
            executable: pythonCmd,
            foundVersions,
          };
        } else {
          const sourceInfo = pyenvPythonPaths.includes(pythonCmd)
            ? " (pyenv)"
            : "";
          console.log(
            `⚠️ Found Python ${result.version} but version < 3.10 (using ${pythonCmd}${sourceInfo})`
          );
        }
      }
    } catch (error) {
      console.log(`Failed to check Python with command '${pythonCmd}':`, error);
    }
  }

  // Generate detailed error message and installation guidance
  if (!hasAnyPython) {
    detailedError = "Python is not installed on this system";
    const installationGuidance =
      generatePythonInstallationGuidance("not_installed");
    console.log("❌ No Python installation found");
    return {
      isValid: false,
      error: "Python not installed",
      detailedError,
      foundVersions,
      installationGuidance,
    };
  } else {
    // Python found but incompatible versions
    // Create a more user-friendly error message - show unique versions only
    const uniqueVersions = [...new Set(foundVersions.map((v) => v.version))];
    const versionList = uniqueVersions.join(", ");

    if (uniqueVersions.length === 1) {
      detailedError = `Found Python ${uniqueVersions[0]}, but version >= 3.10 is required`;
    } else {
      detailedError = `Found Python versions: ${versionList}, but none meet the minimum requirement (>= 3.10)`;
    }

    const installationGuidance = generatePythonInstallationGuidance(
      "incompatible_version",
      foundVersions
    );
    console.log("❌ No compatible Python installation found (>= 3.10)");
    return {
      isValid: false,
      error: "Python >= 3.10 not found",
      detailedError,
      foundVersions,
      installationGuidance,
    };
  }
}

/**
 * Generate platform-specific Python installation guidance
 */
function generatePythonInstallationGuidance(
  issue: "not_installed" | "incompatible_version",
  foundVersions?: Array<{
    command: string;
    version: string;
    isCompatible: boolean;
  }>
): string {
  let guidance = "";

  if (issue === "not_installed") {
    guidance += "📋 Python Installation Required\n\n";
    guidance +=
      "Python is not installed on your system. Please install Python 3.13.3 or later:\n\n";
  } else {
    guidance += "📋 Python Version Upgrade Required\n\n";
    guidance +=
      "Found Python installations, but none meet the minimum version requirement (>= 3.10):\n\n";
    if (foundVersions) {
      foundVersions.forEach((v) => {
        guidance += `  • ${v.command}: Python ${v.version} ${v.isCompatible ? "✅" : "❌"}\n`;
      });
    }
    guidance += "\nPlease install or upgrade to Python 3.13.3 or later:\n\n";
  }

  // Platform-specific installation instructions
  if (Platform.isWindows) {
    guidance += "🪟 Windows Installation Options:\n";
    guidance += "  1. Microsoft Store (Recommended):\n";
    guidance += '     - Search for "Python 3.13" in Microsoft Store\n';
    guidance += '     - Click "Get" to install\n\n';
    guidance += "  2. Official Python.org:\n";
    guidance += "     - Visit: https://www.python.org/downloads/windows/\n";
    guidance += "     - Download Python 3.13.3+ installer\n";
    guidance += '     - Run installer and check "Add to PATH"\n\n';
    guidance += "  3. Package Manager:\n";
    guidance += "     - Winget: winget install Python.Python.3.13\n";
    guidance += "     - Chocolatey: choco install python313\n";
  } else if (Platform.isMacOS) {
    guidance += "🍎 macOS Installation Options:\n";
    guidance += "  1. Homebrew (Recommended):\n";
    guidance += "     - brew install python@3.13\n";
    guidance += "     - brew link --force python@3.13\n";
    guidance +=
      "     - Add to PATH: echo 'export PATH=\"/usr/local/opt/python@3.13/bin:$PATH\"' >> ~/.zshrc\n";
    guidance +=
      "     - Or for Apple Silicon Macs: echo 'export PATH=\"/opt/homebrew/opt/python@3.13/bin:$PATH\"' >> ~/.zshrc\n\n";
    guidance += "  2. Official Python.org:\n";
    guidance += "     - Visit: https://www.python.org/downloads/macos/\n";
    guidance += "     - Download and install Python 3.13.3+ package\n\n";
    guidance += "  3. pyenv (Version Management):\n";
    guidance += "     - brew install pyenv\n";
    guidance += "     - pyenv install 3.13.3\n";
    guidance += "     - pyenv global 3.13.3\n";
  }

  guidance += "\n🔄 After Installation:\n";
  guidance += "  1. Restart VS Code\n";
  guidance +=
    '  2. Reload this window (Ctrl+Shift+P → "Developer: Reload Window")\n';
  guidance += "  3. Check environment status again\n";

  return guidance;
}

/**
 * Handle Python installation guidance with enhanced error messages
 * @param terminal The terminal to use for guidance
 * @returns A promise that resolves to true if guidance was provided successfully
 */
export async function handlePythonInstallation(
  terminal: vscode.Terminal
): Promise<boolean> {
  console.log("Handling Python installation...");

  try {
    // Check current Python status with detailed information
    const pythonCheck = await checkPythonInstallation();

    if (pythonCheck.isValid) {
      console.log(`Python ${pythonCheck.version} is already available`);
      vscode.window.showInformationMessage(
        `Python ${pythonCheck.version} is already installed and compatible.`
      );
      return true;
    }

    let pythonInstallSuccess = false;
    // On macOS, try to auto-install Python using Homebrew
    if (Platform.isMacOS) {
      console.log("Attempting to auto-install Python on macOS...");

      // First check if Homebrew is installed
      const brewAvailable = await checkCommandExists("brew");
      console.log(`Homebrew availability check: ${brewAvailable}`);

      if (!brewAvailable) {
        console.log("Homebrew is not installed, installing it first...");
        vscode.window.showInformationMessage(
          "Homebrew is required for Python installation on macOS. Installing Homebrew first..."
        );

        // Import installHomebrew function
        const { installHomebrew } = await import("./environment");
        const brewInstallSuccess = await installHomebrew(terminal);
        if (!brewInstallSuccess) {
          console.error(
            "Failed to install Homebrew, falling back to manual guidance"
          );
          // Fall through to manual guidance
        } else {
          console.log(
            "✅ Homebrew installed successfully, proceeding with Python installation..."
          );
        }
      }

      // If Homebrew is available (either was already installed or just installed)
      if (brewAvailable || (await checkCommandExists("brew"))) {
        console.log("Installing Python using Homebrew...");
        vscode.window.showInformationMessage(
          "Installing Python 3.13.3 using Homebrew..."
        );

        const { executeInTerminal } = await import("./terminal");
        // Chain the commands to install Python 3.13.3 and create necessary symlinks
        const installCommands = [
          "brew install python@3.13",
          'echo "Setting up Python 3.13 as the default Python version..."',
          "brew link --force python@3.13",
          'echo "PATH is now being updated to include Python 3.13..."',
          'export PATH="/usr/local/opt/python@3.13/bin:$PATH"',
          'echo "Verifying Python version after installation:"',
          "python3 --version",
          'echo "Verifying pip3 version after installation:"',
          "pip3 --version",
        ].join(" && ");

        pythonInstallSuccess = await executeInTerminal(
          installCommands,
          "Python Installation",
          {
            useExistingTerminal: terminal, // Use the same terminal that was passed in
            commandSuccessCheck: async () => {
              console.log(
                "Running post-installation success check for Python..."
              );
              // Wait a bit for installation to complete
              await new Promise((resolve) => setTimeout(resolve, 10000));

              // Try to force a refresh of the environment variables
              try {
                if (Platform.isMacOS) {
                  terminal.sendText(
                    "source ~/.zshrc || source ~/.bash_profile || source ~/.bashrc || true"
                  );
                  await new Promise((resolve) => setTimeout(resolve, 1000));
                }
              } catch (err) {
                console.log("Error refreshing shell environment:", err);
              }

              const updatedPythonCheck = await checkPythonInstallation();
              console.log(
                `Python availability after installation: ${updatedPythonCheck.isValid}`
              );

              if (updatedPythonCheck.isValid) {
                console.log(
                  `✅ Python ${updatedPythonCheck.version} installation verification successful`
                );
              } else {
                console.log(
                  "❌ Python installation verification failed - checking other paths"
                );

                // If the standard check failed, try checking for Python 3.10 in Homebrew paths directly
                try {
                  const brewPythonVersion = await new Promise<string | null>(
                    (resolve) => {
                      cp.exec(
                        "/usr/local/opt/python@3.10/bin/python3 --version || /opt/homebrew/opt/python@3.10/bin/python3 --version",
                        (error, stdout, stderr) => {
                          if (error) {
                            console.log(
                              "Error checking brew Python path:",
                              error
                            );
                            resolve(null);
                            return;
                          }
                          const output = stdout || stderr;
                          const versionMatch = output.match(
                            /Python (\d+\.\d+\.\d+)/
                          );
                          if (versionMatch) {
                            console.log(
                              `Found Homebrew Python ${versionMatch[1]} at alternate location`
                            );
                            resolve(versionMatch[1]);
                          } else {
                            resolve(null);
                          }
                        }
                      );
                    }
                  );

                  if (brewPythonVersion) {
                    console.log(
                      `✅ Found compatible Python ${brewPythonVersion} in Homebrew path, updating PATH information...`
                    );

                    // Note: Success message will be shown by SetupWebViewProvider
                    // Don't show additional messages here to avoid duplication
                    return true;
                  }
                } catch (err) {
                  console.log(
                    "Error checking alternate Python locations:",
                    err
                  );
                }
              }

              return updatedPythonCheck.isValid;
            },
            autoExit: false, // Don't exit automatically so we can use the same terminal for fallback
            timeout: 600000, // 10 minutes timeout for Python installation
          }
        );

        if (pythonInstallSuccess) {
          console.log("✅ Python installation completed successfully");
          // Note: Success message will be shown by SetupWebViewProvider
          return true;
        } else {
          console.log(
            "❌ Python installation failed, falling back to manual guidance"
          );
          // Fall through to manual guidance, using the same terminal
        }
      }
    }

    // Only proceed with manual guidance if auto-install failed or not available
    if (!pythonInstallSuccess) {
      // Fall back to providing manual guidance (original behavior)
      console.log("Providing manual Python installation guidance...");

      // Show detailed guidance in terminal - reuse the same terminal that was passed in
      terminal.show();
      terminal.sendText(
        'echo "=============================================="'
      );
      terminal.sendText('echo "   BDD AI Toolkit - Python Setup Required   "');
      terminal.sendText(
        'echo "=============================================="'
      );
      terminal.sendText('echo ""');

      // Show current status with detailed error
      if (pythonCheck.detailedError) {
        terminal.sendText(
          `echo "Current Status: ${pythonCheck.detailedError}"`
        );
      } else {
        terminal.sendText(
          `echo "Current Status: ${pythonCheck.error || "Python >= 3.10 not found"}"`
        );
      }
      terminal.sendText('echo ""');

      // Show found versions if any
      if (pythonCheck.foundVersions && pythonCheck.foundVersions.length > 0) {
        terminal.sendText('echo "Found Python Installations:"');
        pythonCheck.foundVersions.forEach((v) => {
          const status = v.isCompatible ? "✅ Compatible" : "❌ Too Old";
          terminal.sendText(
            `echo "  • ${v.command}: Python ${v.version} - ${status}"`
          );
        });
        terminal.sendText('echo ""');
      }

      // Display installation guidance
      if (pythonCheck.installationGuidance) {
        const guidanceLines = pythonCheck.installationGuidance.split("\n");
        guidanceLines.forEach((line) => {
          if (line.trim()) {
            terminal.sendText(`echo "${line}"`);
          } else {
            terminal.sendText('echo ""');
          }
        });
      }

      terminal.sendText('echo ""');
      terminal.sendText(
        'echo "=============================================="'
      );

      // Show user-friendly message with action buttons
      const actionButton = Platform.isWindows
        ? "Open Python Download"
        : "Learn More";
      const detailsButton = "Show Details";

      const selection = await vscode.window.showWarningMessage(
        `Python >= 3.10 is required for BDD AI Toolkit. ${pythonCheck.detailedError || pythonCheck.error}`,
        { modal: false },
        actionButton,
        detailsButton,
        "Close"
      );

      if (selection === actionButton) {
        if (Platform.isWindows) {
          // Open Python download page
          vscode.env.openExternal(
            vscode.Uri.parse("https://www.python.org/downloads/windows/")
          );
        } else {
          // Open Python download page
          vscode.env.openExternal(
            vscode.Uri.parse("https://www.python.org/downloads/")
          );
        }
      } else if (selection === detailsButton) {
        // Show detailed information in an information message
        const detailMessage = `Python Environment Check Results:

${pythonCheck.detailedError || pythonCheck.error}

Found Installations:
${
  pythonCheck.foundVersions
    ?.map(
      (v) =>
        `• ${v.command}: Python ${v.version} ${v.isCompatible ? "(Compatible)" : "(Incompatible)"}`
    )
    .join("\n") || "None found"
}

Required: Python >= 3.10

Installation guidance has been provided in the terminal.`;

        vscode.window.showInformationMessage(detailMessage, { modal: true });
      }
    }

    // Return false if we only provided manual guidance, not actual installation
    return false; // Manual guidance provided, but Python not actually installed
  } catch (error) {
    console.error("Error providing Python installation guidance:", error);
    vscode.window.showErrorMessage(
      `Error providing Python installation guidance: ${error}`
    );
    return false;
  }
}
