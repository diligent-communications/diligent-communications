// Checked by the type check only. The type-checked code runs on Cloudflare's
// runtime and on Node.js, never in a web browser, so the type check must not
// know browser globals. The screen's own script is plain JavaScript in
// modules/app/public/ and is not type-checked. If the `lib`
// setting in tsconfig.json stops leaving them out, the line below stops being
// an error and the type check fails.

// @ts-expect-error `document` is a web-browser global.
export type NoBrowserGlobals = typeof document;
