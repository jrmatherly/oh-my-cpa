/**
 * The translation gate: structural and formatting checks for the i18n catalogs.
 *
 * This fork reads English only, and the English catalog is the typed source of every message id.
 * What this automated gate verifies:
 *
 * - The registry, locale directories and language-switcher flags strictly agree;
 * - No id is defined in multiple domain files (preventing silent overwrite during catalog assembly);
 * - Balanced braces, valid ICU plural structures (mandatory `other` branch, valid category names);
 * - Each translation reads the exact same placeholders as its source sentence;
 * - Empty, whitespace-padded, or structurally malformed translation values are rejected;
 * - Every key in the source catalog is referenced somewhere in codebase or through a computed prefix;
 * - Every registered Agent capability has localized copy.
 * - No `.ts` or `.tsx` source file under web/src outside the catalog holds a Chinese character
 *   (`pnpm check:english` covers every other tracked file).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { messagePlaceholders, pluralBranches } from '../web/src/i18n/format.ts';
import { LANGUAGES } from '../web/src/i18n/language.ts';
import { ensureDemoDataset } from './generate-demo-data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const I18N = path.join(ROOT, 'web', 'src', 'i18n');
const LOCALES = path.join(I18N, 'locales');
const SOURCE_LANG = 'en';

type Messages = Record<string, string>;

export interface Problem {
  kind: string;
  message: string;
}

async function loadModule(file: string): Promise<Messages> {
  return (await import(pathToFileURL(file).href)).default as Messages;
}

function domainFiles(lang: string): string[] {
  return fs.readdirSync(path.join(LOCALES, lang)).filter((name) => name.endsWith('.ts') && name !== 'index.ts').sort();
}

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (fullPath !== LOCALES) files.push(...sourceFiles(fullPath));
    } else if (/\.(?:ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.')) {
      files.push(fullPath);
    }
  }
  return files;
}

/** Strips comments so a key mentioned in prose does not count as code. */
function withoutComments(text: string): string {
  // Newlines inside a block comment are kept, so a reported line number is still the file's.
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ''))
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

function validateTemplateFormat(template: string): string | undefined {
  let depth = 0;
  for (let i = 0; i < template.length; i++) {
    if (template[i] === '{') depth++;
    else if (template[i] === '}') {
      depth--;
      if (depth < 0) return 'unmatched closing brace `}`';
    }
  }
  if (depth !== 0) return 'unclosed opening brace `{`';

  let index = 0;
  while (index < template.length) {
    const open = template.indexOf('{', index);
    if (open < 0) break;
    let d = 0;
    let close = -1;
    for (let j = open; j < template.length; j++) {
      if (template[j] === '{') d++;
      else if (template[j] === '}') {
        d--;
        if (d === 0) {
          close = j;
          break;
        }
      }
    }
    if (close < 0) break;
    const body = template.slice(open + 1, close);
    const pluralHead = /^\s*([A-Za-z0-9_]+)\s*,\s*plural\s*,/.exec(body);
    if (pluralHead) {
      const remainder = body.slice(pluralHead[0].length);
      const branches = pluralBranches(remainder);
      if (!branches.has('other')) return 'a plural form needs an `other` branch';
      for (const [category, text] of branches.entries()) {
        if (!/^(=[0-9]+|zero|one|two|few|many|other)$/.test(category)) {
          return `invalid plural category: "${category}"`;
        }
        const inner = validateTemplateFormat(text);
        if (inner) return `inside plural branch "${category}": ${inner}`;
      }
    }
    index = close + 1;
  }
  return undefined;
}

export async function checkCatalogs(): Promise<{ problems: Problem[] }> {
  const problems: Problem[] = [];
  const fail = (kind: string, message: string) => problems.push({ kind, message });

  // Registry, directories and flags.
  const registered = LANGUAGES.map((language) => language.id as string);
  const directories = fs.readdirSync(LOCALES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  for (const id of registered) {
    if (!directories.includes(id)) fail('registry', `language "${id}" is registered but web/src/i18n/locales/${id} is not a directory`);
  }
  for (const id of directories) {
    if (!registered.includes(id)) fail('registry', `web/src/i18n/locales/${id} is not registered in web/src/i18n/language.ts`);
  }

  // The source catalog: ids are unique across its files.
  const sourceDomains = domainFiles(SOURCE_LANG);
  const owners = new Map<string, string>();
  const source: Messages = {};
  for (const file of sourceDomains) {
    const messages = await loadModule(path.join(LOCALES, SOURCE_LANG, file));
    for (const [key, value] of Object.entries(messages)) {
      const owner = owners.get(key);
      if (owner) fail('duplicate', `"${key}" is defined in both ${owner} and ${file}`);
      owners.set(key, file);
      source[key] = value;
    }
  }

  // Every language, against the source.
  const catalogs = new Map<string, Messages>();
  for (const lang of registered) {
    // A registered language with no directory is already a registry problem; reading the missing
    // directory would throw instead of reporting it.
    if (!directories.includes(lang)) continue;
    const files = domainFiles(lang);
    for (const file of sourceDomains) if (!files.includes(file)) fail('structure', `locales/${lang}/ has no ${file}`);
    for (const file of files) if (!sourceDomains.includes(file)) fail('structure', `locales/${lang}/${file} has no source file in locales/${SOURCE_LANG}/`);
    const index = fs.readFileSync(path.join(LOCALES, lang, 'index.ts'), 'utf8');
    for (const file of files) {
      if (!index.includes(`from './${file.replace(/\.ts$/, '')}'`)) fail('structure', `locales/${lang}/index.ts does not import ${file}`);
    }
    // Files are kept in the source's order, so a reviewer can read two languages side by side.
    for (const file of files.filter((name) => sourceDomains.includes(name))) {
      const sourceOrder = Object.keys(await loadModule(path.join(LOCALES, SOURCE_LANG, file)));
      const order = Object.keys(await loadModule(path.join(LOCALES, lang, file)));
      const misplaced = order.findIndex((key, index) => key !== sourceOrder[index]);
      if (misplaced >= 0 && order.length === sourceOrder.length) {
        fail('order', `locales/${lang}/${file}: "${order[misplaced]}" is out of order; the source has "${sourceOrder[misplaced]}" there`);
      }
    }
    const catalog = await loadModule(path.join(LOCALES, lang, 'index.ts'));
    catalogs.set(lang, catalog);
  }

  for (const lang of registered) {
    const catalog = catalogs.get(lang);
    if (!catalog) continue;
    for (const [key, sourceValue] of Object.entries(source)) {
      const value = catalog[key];
      if (typeof value !== 'string') {
        fail('missing', `${lang}: "${key}" has no translation`);
        continue;
      }
      if (value.trim() === '' && sourceValue.trim() !== '') fail('empty', `${lang}: "${key}" is empty`);
      if (value !== value.trim() && sourceValue === sourceValue.trim()) fail('whitespace', `${lang}: "${key}" has leading or trailing whitespace`);
      const expected = messagePlaceholders(sourceValue).join(', ');
      const actual = messagePlaceholders(value).join(', ');
      if (expected !== actual) fail('placeholder', `${lang}: "${key}" reads {${actual}} but the source reads {${expected}}`);
      const formatProblem = validateTemplateFormat(value);
      if (formatProblem) fail('format', `${lang}: "${key}": ${formatProblem}`);
    }
  }

  // Every id is referenced, by its literal or by a computed prefix such as `insights.metric.${...}`.
  const code = sourceFiles(path.join(ROOT, 'web', 'src')).map((file) => withoutComments(fs.readFileSync(file, 'utf8'))).join('\n');
  const literals = new Set(code.match(/['"`][A-Za-z0-9_.-]+['"`]/g)?.map((literal) => literal.slice(1, -1)) ?? []);
  const prefixes = [
    ...[...code.matchAll(/`([a-z_]+\.[A-Za-z0-9_.-]*)\$\{/g)].map((match) => match[1]),
    // `prefixedKey('audit.cat.', value)`: the prefix is spelled out on its own, and the runtime
    // suffix is what `hasMessage` answers for.
    ...[...code.matchAll(/prefixedKey\('([A-Za-z0-9_.-]+)'/g)].map((match) => match[1]),
  ];
  for (const key of Object.keys(source)) {
    if (literals.has(key)) continue;
    if (prefixes.some((prefix) => key.startsWith(prefix))) continue;
    if (key.startsWith(CAPABILITY_PREFIX)) continue;
    fail('unused', `"${key}" (${owners.get(key)}) is not referenced by any source file`);
  }

  // Capability copy is looked up by computed id, so the reference scan cannot see a missing one.
  const datasetPath = await ensureDemoDataset(ROOT);
  const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
  const names = new Set<string>(JSON.parse(dataset.responses.capabilities.body).capabilities.map((capability: { name: string }) => capability.name));
  for (const name of names) {
    for (const key of [`${CAPABILITY_PREFIX}${name}`, `${CAPABILITY_PREFIX}${name}.description`]) {
      if (!(key in source)) fail('capability', `capability "${name}" has no copy "${key}"`);
    }
  }
  for (const key of Object.keys(source)) {
    if (key.startsWith(CAPABILITY_PREFIX) && !names.has(key.slice(CAPABILITY_PREFIX.length).replace(/\.description$/, ''))) {
      fail('capability', `"${key}" names no registered capability`);
    }
  }

  // Spellings GLOSSARY.md has settled. The table is prose for a reader and a block at the end of the
  // same file for this check, so the two cannot drift into disagreeing about what is enforced.
  const glossaryPath = path.join(I18N, 'GLOSSARY.md');
  const glossary = fs.existsSync(glossaryPath) ? fs.readFileSync(glossaryPath, 'utf8') : '';
  const enforcedBlock = /```glossary-enforced\n([\s\S]*?)```/.exec(glossary)?.[1];
  // An absent block is a glossary problem, not a pass: removing the fence would otherwise switch
  // every spelling check off while `GLOSSARY.md` still reads as though it enforced them.
  if (!enforcedBlock?.trim()) fail('glossary', 'GLOSSARY.md has no glossary-enforced block');
  for (const line of (enforcedBlock ?? '').split('\n')) {
    if (!line.trim()) continue;
    const [lang, rejected, preferred] = line.split('\t');
    if (!lang || !rejected || !preferred) {
      fail('glossary', `GLOSSARY.md line "${line}" is not "language<TAB>rejected<TAB>preferred"`);
      continue;
    }
    const catalog = catalogs.get(lang);
    if (!catalog) {
      fail('glossary', `GLOSSARY.md enforces a spelling for "${lang}", which is not a registered language`);
      continue;
    }
    for (const [key, value] of Object.entries(catalog)) {
      if (value.toLowerCase().includes(rejected.toLowerCase())) fail('glossary', `${lang}: "${key}" writes ${rejected}; GLOSSARY.md says ${preferred}`);
    }
  }

  // This fork reads English only, so no source file here may hold a Chinese character, in code or
  // in a comment. A label that has to match Chinese data is written with escapes.
  const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
  for (const file of sourceFiles(path.join(ROOT, 'web', 'src'))) {
    const relative = path.relative(path.join(ROOT, 'web'), file).split(path.sep).join('/');
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (const [index, line] of lines.entries()) {
      if (CJK.test(line)) fail('hardcoded', `${relative}:${index + 1} holds Chinese text`);
    }
  }

  return { problems };
}

const CAPABILITY_PREFIX = 'agent.capability.';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { problems } = await checkCatalogs();
  for (const problem of problems) console.error(`${problem.kind.toUpperCase()}: ${problem.message}`);
  console.log(problems.length === 0 ? `i18n: ${LANGUAGES.length} languages consistent` : `i18n: ${problems.length} problems`);
  if (problems.length > 0) process.exitCode = 1;
}
