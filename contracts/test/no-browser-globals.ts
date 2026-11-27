// Checked by the type check only. The code runs on Node.js, not in a web
// browser, so the type check must not know browser globals. If the `lib`
// setting in tsconfig.json stops leaving them out, the line below stops being
// an error and the type check fails.

// @ts-expect-error `document` is a web-browser global.
export type NoBrowserGlobals = typeof document;
