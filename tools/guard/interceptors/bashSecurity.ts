export type SecurityLevel = "ReadOnly" | "WorkspaceWrite" | "DangerFullAccess";

export interface BashSecurityCheckResult {
  passed: boolean;
  reason?: string;
  matchedString?: string;
}

const DANGEROUS_COMMANDS = [
  /rm\s+-r?[f]/i, // recursive force remove (but allow just 'rm' or 'rm -rf .tmp')
  /mkfs/i, // format
  /dd\s+if=/i, // block copy
  />\s*\/dev\/sd[a-z]/i, // direct disk write
  /wget\s/i, // networking
  /curl\s/i, // networking
];

const OBfuscation_CHECKS = [
  /(["']){3,}/, // More than 2 contiguous quotes, e.g. """
  /["']{2}-[a-z]/i, // Empty quotes before flags like ""'-'f
  /`.*`/, // Backtick execution
  /\$\(.*\)/, // $() execution
  /<\(.*\)/, // Process substitution
  />\(.*\)/, // Process substitution
  /=\(.*\)/, // zsh process expansion
  /zmodload\s+zsh\/net/i, // zsh network module
];

const ZERO_WIDTH_CHARS = /[\u200B-\u200D\uFEFF]/;

/**
 * Validates a bash command string against multiple heuristic security rules.
 */
export function validateBashCommand(
  commandLine: string,
  level: SecurityLevel = "WorkspaceWrite"
): BashSecurityCheckResult {
  // 1. Zero-width character check (Poisoning prevention)
  if (ZERO_WIDTH_CHARS.test(commandLine)) {
    return {
      passed: false,
      reason: "Detected zero-width characters potentially hiding malicious execution paths.",
    };
  }

  // 2. Control character expansion obfuscation
  if (commandLine.includes("\\n") || commandLine.includes("\\r")) {
    // If it's a simple echo with -e, maybe, but to be strict, reject.
    if (!commandLine.trim().startsWith("echo ")) {
      return {
        passed: false,
        reason: "Detected escaped newlines outside of echo strings which may bypass AST parsing.",
      };
    }
  }

  // 3. Obfuscation and substitution block
  for (const regex of OBfuscation_CHECKS) {
    const match = commandLine.match(regex);
    if (match) {
      if (level !== "DangerFullAccess") {
        return {
          passed: false,
          reason: "Command uses restricted sub-shell substitution or obfuscation techniques.",
          matchedString: match[0],
        };
      }
    }
  }

  // 4. Command Type Level Enforcements
  if (level === "ReadOnly") {
    // Whitelist for inspection commands.
    const isReadOnly = /^\s*(ls|cat|grep|find|wc|echo|pwd|whoami|du|df|stat|git status|git diff)\s?/.test(commandLine);
    if (!isReadOnly) {
      return {
        passed: false,
        reason: `Command '${commandLine.split(" ")[0]}' is not in the ReadOnly whitelist for this stage.`,
      };
    }
  } else if (level === "WorkspaceWrite") {
    for (const regex of DANGEROUS_COMMANDS) {
      const match = commandLine.match(regex);
      if (match) {
        return {
          passed: false,
          reason: "Destructive or networking command detected without DangerFullAccess.",
          matchedString: match[0],
        };
      }
    }
  }

  return { passed: true };
}
