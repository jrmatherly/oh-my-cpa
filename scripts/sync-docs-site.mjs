import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GITHUB_URL, SITE_ORIGIN } from '../deploy/site/site-meta.mjs';

const GITHUB_WEB = GITHUB_URL;
export { SITE_ORIGIN };
export const DOCS_LANGUAGES = ['en'];

function readBranch() {
  // Always link to `main` (matching GITHUB_SOURCE in deploy/site/docs/src/lib/site.ts)
  // unless an explicit repository branch override is provided; PR builds set GITHUB_REF_NAME to `<pr>/merge`.
  const override = process.env.OMCPA_DOCS_REF?.trim();
  return override || 'main';
}

/** Console assets the public site reuses: `[repository source, published file name]`. */
export const BRAND_ASSETS = [
  ['web/src/assets/brand/omc-wordmark-light.svg', 'wordmark-light.svg'],
  ['web/src/assets/brand/omc-wordmark-dark.svg', 'wordmark-dark.svg'],
  ['web/public/favicon.svg', 'mark.svg'],
];

/**
 * The documentation site's navigation, from simple to advanced. Each section is a sidebar
 * group; each page names its canonical repository source per language.
 */
export const DOCS_SECTIONS = [
  {
    dir: 'start',
    title: { en: 'Get started' },
    description: { en: 'First deployment, agent-assisted install and how the pieces fit.' },
    icon: 'Rocket',
    pages: [
      {
        slug: 'quickstart',
        source: { en: 'docs/quickstart.md' },
        title: { en: 'Quickstart' },
        description: {
          en: 'Run the gateway, Oh My CPA and the updater with Docker Compose in about three minutes.',
        },
      },
      {
        slug: 'agent',
        source: { en: 'docs/install-for-agents.md' },
        title: { en: 'Install with an agent' },
        description: {
          en: 'Paste one prompt into Claude Code, Codex or Cursor and let it install Oh My CPA safely.',
        },
      },
      {
        slug: 'how-it-works',
        source: { en: 'docs/how-it-works.md' },
        title: { en: 'How it works' },
        description: {
          en: 'How Oh My CPA sits beside CLIProxyAPI, which keys it needs and where data lives.',
        },
      },
    ],
  },
  {
    dir: 'install',
    title: { en: 'Install' },
    description: { en: 'Every install path, remote access, upgrades and troubleshooting.' },
    icon: 'Download',
    index: {
      source: { en: 'docs/install.md' },
      title: { en: 'Choose an install path' },
      description: {
        en: 'Pick the installation that matches where your gateway runs today.',
      },
    },
    pages: [
      {
        slug: 'standalone',
        source: { en: 'docs/install/standalone.md' },
        title: { en: 'Standalone' },
        description: {
          en: 'Add Oh My CPA beside a running gateway and leave the gateway as it is.',
        },
      },
      {
        slug: 'compose',
        source: { en: 'docs/install/compose.md' },
        title: { en: 'Existing Compose file' },
        description: {
          en: 'Add Oh My CPA and its updater to the Compose file that already runs the gateway.',
        },
      },
      {
        slug: 'native',
        source: { en: 'docs/install/native.md' },
        title: { en: 'Native executable' },
        description: {
          en: 'Run the single executable on macOS, Windows, Linux or FreeBSD without Docker.',
        },
      },
      {
        slug: 'source',
        source: { en: 'docs/install/source.md' },
        title: { en: 'Build from source' },
        description: {
          en: 'Build the console and server from a checkout with Go, Node.js and pnpm.',
        },
      },
      {
        slug: 'remote-access',
        source: { en: 'docs/install/remote-access.md' },
        title: { en: 'Remote access and HTTPS' },
        description: {
          en: 'Reach the console over an SSH tunnel or a reverse proxy, and install it as an app.',
        },
      },
      {
        slug: 'upgrade',
        source: { en: 'docs/install/upgrade.md' },
        title: { en: 'Upgrading' },
        description: {
          en: 'Update from the console in one click, by hand, or add the updater to an older install.',
        },
      },
      {
        slug: 'troubleshooting',
        source: { en: 'docs/install/troubleshooting.md' },
        title: { en: 'Troubleshooting' },
        description: {
          en: 'Check health and fix port, permission, connection and sign-in problems.',
        },
      },
    ],
  },
  {
    dir: 'operate',
    title: { en: 'Operate' },
    description: { en: 'Ports, storage, updates, backups, keys and time zone.' },
    icon: 'Server',
    index: {
      source: { en: 'docs/operations.md' },
      title: { en: 'Operations' },
      description: {
        en: 'Day-to-day tasks for a running console and the rules a deployment must keep.',
      },
    },
    pages: [
      {
        slug: 'ports-storage',
        source: { en: 'docs/operate/ports-storage.md' },
        title: { en: 'Ports and storage' },
        description: {
          en: 'Change the listening port and keep the database in a volume or a host directory.',
        },
      },
      {
        slug: 'updates',
        source: { en: 'docs/operate/updates.md' },
        title: { en: 'Updates' },
        description: {
          en: 'How release checks work and how the signed, isolated updater replaces containers.',
        },
      },
      {
        slug: 'backup',
        source: { en: 'docs/ops/sqlite-operations.md' },
        title: { en: 'Backup and restore' },
        description: {
          en: 'Encrypted backups, cloud recovery, master key governance and database maintenance.',
        },
      },
      {
        slug: 'keys',
        source: { en: 'docs/operate/keys.md' },
        title: { en: 'Keys' },
        description: {
          en: 'Keep the master key safe and rotate the CPA management key.',
        },
      },
      {
        slug: 'time-zone',
        source: { en: 'docs/operate/time-zone.md' },
        title: { en: 'Time zone' },
        description: {
          en: 'Choose the calendar that daily statistics and timestamps follow.',
        },
      },
    ],
  },
  {
    dir: 'features',
    title: { en: 'Features' },
    description: { en: 'Agent and MCP, routing, quota, pricing, playground and plugins.' },
    icon: 'Sparkles',
    pages: [
      {
        slug: 'agent',
        source: { en: 'docs/features/agent.md' },
        title: { en: 'Agent and MCP' },
        description: {
          en: 'Operate the console in conversation and connect external agents over MCP.',
        },
      },
      {
        slug: 'routing',
        source: { en: 'docs/features/routing.md' },
        title: { en: 'Routing and model rules' },
        description: {
          en: 'Arrange providers and OAuth credentials into priority tiers and edit model rules.',
        },
      },
      {
        slug: 'quota',
        source: { en: 'docs/features/quota.md' },
        title: { en: 'Quota and warmup' },
        description: {
          en: 'Observe quota windows and cooldowns, and start windows on a schedule.',
        },
      },
      {
        slug: 'pricing',
        source: { en: 'docs/pricing.md' },
        title: { en: 'Pricing and cost' },
        description: {
          en: 'How each request is priced, which rates apply and how cost evidence is kept.',
        },
      },
      {
        slug: 'playground',
        source: { en: 'docs/features/playground.md' },
        title: { en: 'Playground and models' },
        description: {
          en: 'Try a model with a real client key and browse the live model directory.',
        },
      },
      {
        slug: 'plugins',
        source: { en: 'docs/features/plugins.md' },
        title: { en: 'Plugins' },
        description: {
          en: 'Install plugins from the store and open their pages inside the console.',
        },
      },
      {
        slug: 'display',
        source: { en: 'docs/features/display.md' },
        title: { en: 'Display and icons' },
        description: {
          en: 'Display currency, TPS calculation and custom provider icons.',
        },
      },
    ],
  },
  {
    dir: 'reference',
    title: { en: 'Reference' },
    description: { en: 'Environment variables, the CPA contract, glossary and API.' },
    icon: 'BookMarked',
    pages: [
      {
        slug: 'environment',
        source: { en: 'docs/reference/environment.md' },
        title: { en: 'Environment variables' },
        description: {
          en: 'Every setting Oh My CPA, its Compose files and its updater read.',
        },
      },
      {
        slug: 'cpa-contract',
        source: { en: 'docs/cpa-v8-compat.md' },
        title: { en: 'CPA contract' },
        description: {
          en: 'What Oh My CPA reads from and writes to the CLIProxyAPI v8 Management API.',
        },
      },
      {
        slug: 'glossary',
        source: { en: 'CONTEXT.md' },
        title: { en: 'Glossary' },
        description: {
          en: 'Canonical terms for identity, usage, billing and automation.',
        },
      },
    ],
    links: [
      { title: { en: 'API reference' }, url: '/api-reference/' },
      { title: { en: 'Release notes' }, url: `${GITHUB_WEB}/releases` },
    ],
  },
  {
    dir: 'develop',
    title: { en: 'Develop' },
    description: { en: 'Architecture, agent capabilities and contributing.' },
    icon: 'Code',
    pages: [
      {
        slug: 'architecture',
        source: { en: 'docs/dev/architecture.md' },
        title: { en: 'Architecture' },
        description: {
          en: 'Module ownership, trust boundaries, write gates and frontend delivery.',
        },
      },
      {
        slug: 'capabilities',
        source: { en: 'docs/agent-capabilities.md' },
        title: { en: 'Agent capabilities' },
        description: {
          en: 'The shared capability registry behind the Agent and MCP, and how to add an operation.',
        },
      },
      {
        slug: 'contributing',
        source: { en: 'CONTRIBUTING.md' },
        title: { en: 'Contributing' },
        description: {
          en: 'Local development, verification and contribution workflow.',
        },
      },
    ],
  },
];

export const DOCS_HOME = {
  title: { en: 'Documentation' },
  description: {
    en: 'Install, operate and extend Oh My CPA, the self-hosted AI gateway console.',
  },
};

/** Every content page with its section, in navigation order; section indexes come first. */
export function listDocsPages() {
  const pages = [];
  for (const section of DOCS_SECTIONS) {
    if (section.index) pages.push({ ...section.index, section: section.dir, slug: section.dir, isIndex: true });
    for (const page of section.pages) pages.push({ ...page, section: section.dir, slug: `${section.dir}/${page.slug}` });
  }
  return pages;
}

export function docsUrl(lang, slug = '') {
  return slug ? `/${lang}/${slug}/` : `/${lang}/`;
}

export function buildSourceLinkMap() {
  const map = new Map();
  for (const page of listDocsPages()) map.set(page.source.en, { en: docsUrl('en', page.slug) });
  for (const readme of ['README.md', 'docs/README.md']) map.set(readme, { en: '/en/' });
  return map;
}

function metaFiles() {
  const files = [];
  for (const lang of DOCS_LANGUAGES) {
    const suffix = lang === 'en' ? '' : `.${lang}`;
    files.push({
      file: `meta${suffix}.json`,
      data: { title: DOCS_HOME.title[lang], pages: ['index', ...DOCS_SECTIONS.map((section) => section.dir)] },
    });
    for (const [index, section] of DOCS_SECTIONS.entries()) {
      const links = (section.links ?? []).map((link) => `[${link.title[lang]}](${link.url})`);
      files.push({
        file: `${section.dir}/meta${suffix}.json`,
        data: {
          title: section.title[lang],
          description: section.description[lang],
          icon: section.icon,
          // Only the first-run section starts expanded; the sidebar opens the active page's folder itself.
          ...(index === 0 ? { defaultOpen: true } : {}),
          pages: [...(section.index ? ['index'] : []), ...section.pages.map((page) => page.slug), ...links],
        },
      });
    }
  }
  return files;
}

function rewriteMarkdownForMdx(markdown, {
  sourcePath,
  lang,
  repoRoot,
  sourceLinkMap,
  branch,
}) {
  let text = markdown.replace(/\r\n/g, '\n');
  text = text.replace(/^#\s+[^\n]+\n+/, '');
  text = text.replace(/<a\s+id="([^"]+)"\s*><\/a>/g, '<span id="$1" />');

  // Convert GitHub callouts (> [!TIP], > [!IMPORTANT], > [!NOTE], > [!WARNING]) into Fumadocs Callout blocks.
  text = text.replace(
    /(^> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\n(?:^>.*\n?)*)/gm,
    (block, _all, kind) => {
      const typeMap = {
        NOTE: 'info',
        TIP: 'info',
        IMPORTANT: 'warn',
        WARNING: 'warn',
        CAUTION: 'error',
      };
      const calloutType = typeMap[kind] ?? 'info';
      const innerLines = block
        .split('\n')
        .slice(1)
        .filter((line, idx, arr) => !(idx === arr.length - 1 && line === ''))
        .map((line) => line.replace(/^>\s?/, ''));
      return `<Callout type="${calloutType}">\n\n${innerLines.join('\n')}\n\n</Callout>\n`;
    },
  );

  // Protect fenced code blocks first (` ```...``` `) so single backticks inside code blocks
  // never split out of alignment.
  const fencedRegex = /```[\s\S]*?```/g;
  const fencedParts = [];
  let lastIndex = 0;
  for (const match of text.matchAll(fencedRegex)) {
    if (match.index > lastIndex) {
      fencedParts.push({ isCode: false, value: text.slice(lastIndex, match.index) });
    }
    fencedParts.push({ isCode: true, value: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    fencedParts.push({ isCode: false, value: text.slice(lastIndex) });
  }

  const sourceDir = path.posix.dirname(sourcePath);

  const rewriteLinksInProse = (prose) => {
    const protectedChunks = [];
    const tokenRe = /!?\[(?:`[^`\n]+`|[^\]\n])*\]\([^)\s]+(?:\s+"[^"]*")?\)|`[^`\n]+`/g;
    let cursor = 0;
    for (const m of prose.matchAll(tokenRe)) {
      if (m.index > cursor) {
        protectedChunks.push({ type: 'text', value: prose.slice(cursor, m.index) });
      }
      const raw = m[0];
      if (raw.startsWith('`')) {
        protectedChunks.push({ type: 'code', value: raw });
      } else {
        protectedChunks.push({ type: 'link', value: raw });
      }
      cursor = m.index + raw.length;
    }
    if (cursor < prose.length) {
      protectedChunks.push({ type: 'text', value: prose.slice(cursor) });
    }
    return protectedChunks
      .map((chunk) => {
        if (chunk.type === 'code') return chunk.value;
        if (chunk.type === 'link') {
          return chunk.value.replace(/^(!?)\[((?:`[^`\n]+`|[^\]\n])*)\]\(([^)\s]+(?:\s+"[^"]*")?)\)$/, (full, bang, label, rawTarget) => {
            const target = rawTarget.split(/\s+"/)[0];
            if (/^(?:https?:|mailto:|#)/i.test(target)) {
              if (!bang && target.startsWith('https://omc-demo.junze.dev')) {
                return `[${label}](/demo/)`;
              }
              if (!bang && target.startsWith('https://omc.junze.dev/api-reference/')) {
                return `[${label}](/api-reference/)`;
              }
              if (!bang && target === 'https://omc.junze.dev/docs/') {
                return `[${label}](/en/)`;
              }
              return full;
            }
            const [rawPath, hash] = target.split('#');
            const resolved = path.posix.normalize(sourceDir === '.' ? rawPath : path.posix.join(sourceDir, rawPath));

            if (bang === '!') {
              if (resolved.startsWith('docs/images/readme/')) {
                return `![${label}](/docs/images/${path.posix.basename(resolved)})`;
              }
              return `![${label}](${GITHUB_WEB}/raw/${branch}/${resolved})`;
            }

            if (sourceLinkMap.has(resolved)) {
              const targetUrl = sourceLinkMap.get(resolved)[lang];
              const suffix = hash ? `#${hash}` : '';
              return `[${label}](${targetUrl}${suffix})`;
            }

            const absOnDisk = path.join(repoRoot, resolved);
            const isDir = fs.existsSync(absOnDisk) && fs.statSync(absOnDisk).isDirectory();
            const kind = isDir ? 'tree' : 'blob';
            const suffix = hash ? `#${hash}` : '';
            return `[${label}](${GITHUB_WEB}/${kind}/${branch}/${resolved}${suffix})`;
          });
        }
        let out = chunk.value;
        out = out.replace(/<br\s*\/?>/g, '<br />');
        out = out.replace(/<((?!\/?(?:Callout|span|div|figure|figcaption|img|strong|br)\b)(?!https?:\/\/)[^>\n]{1,80})>/g, '&lt;$1&gt;');
        out = out.replace(/(^|[^\\$])\{([A-Za-z_][A-Za-z0-9_]*)\}/g, '$1\\{$2\\}');
        return out;
      })
      .join('');
  };

  const rewritten = fencedParts
    .map((chunk) => {
      if (chunk.isCode) {
        return chunk.value.replace(/^```caddyfile\b/, '```text');
      }
      return rewriteLinksInProse(chunk.value);
    })
    .join('');

  return `${rewritten.trim()}\n`;
}

function formatFrontmatter({ title, description, source }) {
  const esc = (v) => JSON.stringify(String(v));
  const lines = ['---', `title: ${esc(title)}`, `description: ${esc(description)}`];
  if (source) lines.push(`source: ${esc(source)}`);
  return [...lines, '---', ''].join('\n');
}

/** Turns a page's MDX body into plain Markdown for agents: absolute links, no JSX wrappers. */
function toAgentMarkdown({ title, description, body }) {
  const withoutWrappers = body
    .replace(/<Callout type="[a-z]+">\n\n([\s\S]*?)\n\n<\/Callout>/g, (_m, inner) => inner.split('\n').map((line) => `> ${line}`.trimEnd()).join('\n'))
    .replace(/<span id="[^"]+" \/>\n*/g, '')
    .replace(/\]\(\/en\//g, `](${SITE_ORIGIN}/docs/en/`)
    .replace(/\]\(\/(api-reference|demo)\//g, `](${SITE_ORIGIN}/$1/`)
    .replace(/\]\(\/docs\//g, `](${SITE_ORIGIN}/docs/`);
  // Unescape MDX-specific prose escapes outside fenced code blocks.
  const plain = withoutWrappers
    .split(/(```[\s\S]*?```)/g)
    .map((part, idx) =>
      idx % 2 === 1
        ? part
        : part
            .replace(/\\([{}])/g, '$1')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>'),
    )
    .join('');
  return `# ${title}\n\n> ${description}\n\n${plain.trim()}\n`;
}

function llmsIndex(lang, entries) {
  const home = DOCS_HOME;
  const lines = [`# Oh My CPA`, '', `> ${home.description[lang]}`, ''];
  for (const section of DOCS_SECTIONS) {
    lines.push(`## ${section.title[lang]}`, '');
    for (const entry of entries.filter((e) => e.section === section.dir)) {
      lines.push(`- [${entry.title}](${SITE_ORIGIN}/docs${docsUrl(lang, entry.slug).replace(/\/$/, '')}.md): ${entry.description}`);
    }
    lines.push('');
  }
  return `${lines.join('\n').trim()}\n`;
}

export async function syncDocsSite({ repoRoot }) {
  const docsAppDir = path.join(repoRoot, 'deploy', 'site', 'docs');
  const contentDir = path.join(docsAppDir, 'content', 'docs');
  const publicDir = path.join(docsAppDir, 'public');
  const publicImagesDir = path.join(publicDir, 'images');
  const readmeImagesDir = path.join(repoRoot, 'docs', 'images', 'readme');
  const branch = readBranch();
  const sourceLinkMap = buildSourceLinkMap();

  fs.rmSync(contentDir, { recursive: true, force: true });
  fs.mkdirSync(contentDir, { recursive: true });
  for (const lang of DOCS_LANGUAGES) fs.rmSync(path.join(publicDir, lang), { recursive: true, force: true });

  const write = (rel, text) => {
    const abs = path.join(contentDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  };
  const writePublic = (rel, text) => {
    const abs = path.join(publicDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  };

  // The home page is rendered by the docs app; its MDX entry only carries metadata.
  for (const lang of DOCS_LANGUAGES) {
    write(lang === 'en' ? 'index.mdx' : `index.${lang}.mdx`, formatFrontmatter({ title: DOCS_HOME.title[lang], description: DOCS_HOME.description[lang] }));
  }

  const pages = listDocsPages();
  for (const lang of DOCS_LANGUAGES) {
    const entries = [];
    for (const page of pages) {
      const sourceRel = page.source[lang];
      const sourceAbs = path.join(repoRoot, sourceRel);
      if (!fs.existsSync(sourceAbs)) {
        throw new Error(`Missing docs source file: ${sourceRel}`);
      }
      const body = rewriteMarkdownForMdx(fs.readFileSync(sourceAbs, 'utf8'), {
        sourcePath: sourceRel,
        lang,
        repoRoot,
        sourceLinkMap,
        branch,
      });
      const title = page.title[lang];
      const description = page.description[lang];
      const suffix = lang === 'en' ? '' : `.${lang}`;
      const file = page.isIndex ? `${page.slug}/index${suffix}.mdx` : `${page.slug}${suffix}.mdx`;
      write(file, `${formatFrontmatter({ title, description, source: sourceRel })}\n${body}`);
      writePublic(`${lang}/${page.slug}.md`, toAgentMarkdown({ title, description, body }));
      entries.push({ section: page.section, slug: page.slug, title, description });
    }
    writePublic(lang === 'en' ? 'llms.txt' : `${lang}/llms.txt`, llmsIndex(lang, entries));
  }

  for (const meta of metaFiles()) {
    write(meta.file, `${JSON.stringify(meta.data, null, 2)}\n`);
  }

  // Copy README WebP screenshots into public/images so `/docs/images/*.webp` resolves offline.
  fs.rmSync(publicImagesDir, { recursive: true, force: true });
  if (fs.existsSync(readmeImagesDir)) {
    fs.mkdirSync(publicImagesDir, { recursive: true });
    for (const file of fs.readdirSync(readmeImagesDir)) {
      if (file.endsWith('.webp')) {
        fs.copyFileSync(path.join(readmeImagesDir, file), path.join(publicImagesDir, file));
      }
    }
  }

  // Brand artwork and the code typeface are copied from the console so the two never drift.
  const brandDir = path.join(publicDir, 'brand');
  fs.rmSync(brandDir, { recursive: true, force: true });
  fs.mkdirSync(brandDir, { recursive: true });
  for (const [from, to] of BRAND_ASSETS) fs.copyFileSync(path.join(repoRoot, from), path.join(brandDir, to));

  return {
    contentDir,
    pageCount: pages.length * DOCS_LANGUAGES.length,
  };
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(selfPath)) {
  const repoRoot = path.resolve(path.dirname(selfPath), '..');
  const result = await syncDocsSite({ repoRoot });
  console.log(`synced ${result.pageCount} MDX pages to ${path.relative(repoRoot, result.contentDir)}`);
}
