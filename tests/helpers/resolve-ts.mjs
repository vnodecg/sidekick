/*
 * Source files import siblings as "./x.js" (required for the tsc build). Node's
 * type stripping runs the .ts sources directly, so retry a missing .js as .ts.
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const isMissingJs =
      error.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".") && specifier.endsWith(".js");
    if (!isMissingJs) throw error;
    return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
  }
}
