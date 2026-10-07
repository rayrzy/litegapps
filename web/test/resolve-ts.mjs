// Resolve hook for the tests: the source files import each other without an
// extension ("./paths"), which bundlers accept but Node's own resolver does
// not. Retry with ".ts" so the real source can be loaded unmodified, with no
// dependency beyond Node itself.
export async function resolve(specifier, context, nextResolve) {
	try {
		return await nextResolve(specifier, context);
	} catch (err) {
		const relative = specifier.startsWith("./") || specifier.startsWith("../");
		if (err?.code === "ERR_MODULE_NOT_FOUND" && relative) {
			for (const suffix of [".ts", "/index.ts"]) {
				try {
					return await nextResolve(specifier + suffix, context);
				} catch {
					// try the next candidate
				}
			}
		}
		throw err;
	}
}
