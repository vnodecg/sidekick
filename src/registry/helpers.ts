import * as path from "node:path";
import { pathToFileURL } from "node:url";
import fastGlob from "fast-glob";

/**
 * Extracts the module name from a file path by removing the .js extension
 * @param filePath - The full path to the module file
 * @returns The module name without extension
 */
export function getModuleName(filePath: string): string {
  return path.basename(filePath, ".js");
}

/**
 * Converts a file system path to a file:// URL for dynamic imports
 * @param filePath - The file system path to convert
 * @returns A file:// URL string
 */
export function filePathToUrl(filePath: string): string {
  return pathToFileURL(filePath).href;
}

/**
 * Generates glob patterns for finding module files in standard directories
 * @param rootDir - The root directory to search from
 * @returns Array of glob patterns for module discovery
 */
export function getModulePatterns(rootDir: string): Array<string> {
  return [
    path.join(rootDir, "tools", "*.js"),
    path.join(rootDir, "resources", "*.js"),
    path.join(rootDir, "prompts", "*.js"),
  ];
}

/**
 * Extracts the root directory from an import.meta.url
 * @param importMetaUrl - The import.meta.url from the calling module
 * @returns The root directory path
 */
export function getRootDir(importMetaUrl: string): string {
  return path.dirname(path.dirname(new URL(importMetaUrl).pathname));
}

/**
 * Checks if a Promise settled result represents a successful module load
 * @param result - The Promise settled result to check
 * @returns True if the module loaded successfully
 */
export function isSuccessfulResult(result: PromiseSettledResult<{ success: boolean }>): boolean {
  if (result.status === "rejected") return false;
  return result.value.success;
}

/**
 * Counts successful and failed results from an array of Promise settled results
 * @param results - Array of Promise settled results to count
 * @returns Object with successful and failed counts
 */
export function countResults(
  results: Array<PromiseSettledResult<{ success: boolean }>>
): { successful: number; failed: number } {
  const successful = results.filter(isSuccessfulResult).length;
  return { successful, failed: results.length - successful };
}

/**
 * Type definition for module load results
 */
export type ModuleLoadResult = {
  success: boolean;
  name: string;
  type?: string;
  error?: unknown;
};

/**
 * Dynamically imports a module from a file path
 * @param filePath - The path to the module file
 * @returns Promise resolving to the imported module
 */
export async function loadModule(filePath: string): Promise<{ default?: unknown }> {
  const fileUrl = filePathToUrl(filePath);
  return await import(fileUrl) as { default?: unknown };
}

/**
 * Finds all module files in the standard module directories
 * @param rootDir - The root directory to search from
 * @returns Promise resolving to array of absolute file paths
 */
export async function findModuleFiles(rootDir: string): Promise<Array<string>> {
  return fastGlob(getModulePatterns(rootDir), {
    absolute: true,
    onlyFiles: true,
  });
}

/**
 * Creates a successful module load result
 * @param name - The name of the successfully loaded module
 * @param type - The type of the successfully loaded module
 * @returns A success result object
 */
export function createSuccessResult(name: string, type: string): ModuleLoadResult {
  return { success: true, name, type };
}

/**
 * Creates a failed module load result
 * @param name - The name of the module that failed to load
 * @param error - The error that occurred
 * @returns A failure result object
 */
export function createErrorResult(name: string, error: unknown): ModuleLoadResult {
  return { success: false, name, error };
}
