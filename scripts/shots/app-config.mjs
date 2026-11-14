// The description of one app for shot-app.mjs (apps/<slug>.json): what is checked before
// anything is started, and how its placeholders become paths. No I/O here, so
// `pnpm test` covers it (tests/shots-config.test.ts).

/** The placeholders an app file may use instead of a path of one machine. */
export const PLACEHOLDERS = ['REPOS_DIR', 'ROOT', 'DEMO', 'HERE'];
const PLACEHOLDER = new RegExp(`\\$(${PLACEHOLDERS.join('|')})\\b`, 'g');

/** What a step may do before the picture is taken. */
export const ACTIONS = ['click', 'has', 'frame', 'wait', 'hash', 'key'];

/**
 * Replaces the placeholders in every string of a value (objects and lists are walked).
 * @template T
 * @param {T} value
 * @param {Record<string, string>} vars placeholder name -> path
 * @returns {T}
 */
export function expand(value, vars) {
  if (typeof value === 'string') {
    return /** @type {T} */ (
      value.replace(PLACEHOLDER, (_, name) => {
        const path = vars[name];
        if (path === undefined) throw new Error(`$${name} has no value here`);
        return path.replaceAll('\\', '/');
      })
    );
  }
  if (Array.isArray(value)) return /** @type {T} */ (value.map((v) => expand(v, vars)));
  if (value && typeof value === 'object') {
    return /** @type {T} */ (
      Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expand(v, vars)]))
    );
  }
  return value;
}

/**
 * One step, "click=View" or "Escape", as what to do and with what.
 * @param {string} step
 * @returns {{ action: string, arg: string }}
 */
export function parseStep(step) {
  const at = step.indexOf('=');
  if (at < 0) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(step)) throw new Error(`not a key name: "${step}"`);
    return { action: 'key', arg: step };
  }
  const action = step.slice(0, at);
  const arg = step.slice(at + 1);
  if (action === 'key' || !ACTIONS.includes(action)) throw new Error(`unknown action: "${step}"`);
  if (!arg) throw new Error(`"${action}=" needs a value`);
  if (action === 'wait' && !/^\d+$/.test(arg))
    throw new Error(`wait takes milliseconds: "${step}"`);
  return { action, arg };
}

const HUB_FIELDS = ['exe', 'prefix', 'api', 'session'];
const PREVIEW_FIELDS = ['app', 'map'];

/**
 * Checks an app file and returns it; throws with every problem at once.
 * @param {unknown} raw the parsed JSON
 * @param {string} slug the file name without .json, for the messages
 */
export function validateApp(raw, slug) {
  const problems = [];
  const app = /** @type {Record<string, any>} */ (raw && typeof raw === 'object' ? raw : {});
  if (app.kind !== 'hub' && app.kind !== 'preview')
    problems.push('kind must be "hub" or "preview"');
  for (const field of app.kind === 'hub'
    ? HUB_FIELDS
    : app.kind === 'preview'
      ? PREVIEW_FIELDS
      : []) {
    if (typeof app[field] !== 'string' || !app[field]) problems.push(`${field} is missing`);
  }
  if (app.kind === 'preview' && app.demo) problems.push('a preview has no demo command');
  if (app.demo && !(Array.isArray(app.demo) && app.demo.every((a) => typeof a === 'string'))) {
    problems.push('demo must be a command as a list of strings');
  }
  for (const side of ['width', 'height']) {
    if (app[side] !== undefined && !(Number.isInteger(app[side]) && app[side] >= 320)) {
      problems.push(`${side} must be a whole number of pixels`);
    }
  }
  const shots = Array.isArray(app.shots) ? app.shots : [];
  if (shots.length === 0) problems.push('shots is empty');
  const seen = new Set();
  for (const shot of shots) {
    // The name becomes a file name under public/shots/<slug>/.
    if (typeof shot?.name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(shot.name)) {
      problems.push(`a shot needs a plain name (a-z, 0-9, -): ${JSON.stringify(shot?.name)}`);
      continue;
    }
    if (seen.has(shot.name)) problems.push(`the shot ${shot.name} is listed twice`);
    seen.add(shot.name);
    for (const step of Array.isArray(shot.steps) ? shot.steps : []) {
      try {
        const { action } = parseStep(String(step));
        if (action === 'frame' && app.kind !== 'preview') {
          problems.push(`${shot.name}: frame= is for a preview (the map in its iframe)`);
        }
      } catch (error) {
        problems.push(`${shot.name}: ${/** @type {Error} */ (error).message}`);
      }
    }
  }
  if (shots.length > 0 && shots.every((s) => s?.shot === false)) problems.push('no shot is taken');
  if (problems.length > 0) throw new Error(`${slug}: ${problems.join('; ')}`);
  return app;
}

/**
 * Paths of one machine in a text: a drive letter, a home folder, AppData. An app file
 * names the checkouts through $REPOS_DIR and everything else through $ROOT and $DEMO.
 * @param {string} text
 * @returns {string[]}
 */
export function machinePaths(text) {
  return [...text.matchAll(/\b[A-Za-z]:[\\/]+[\w.-]*|\/(?:Users|home)\/[\w.-]+|\bAppData\b/g)].map(
    (m) => m[0],
  );
}
