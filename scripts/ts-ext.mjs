// Lets a plain node script import the app's TypeScript modules, which import
// each other without file extensions the way bundlers allow and node does not.
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
    try { return await next(specifier + '.ts', context) } catch {}
  }
  return next(specifier, context)
}
