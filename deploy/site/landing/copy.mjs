/**
 * Copy, navigation metadata, and sample fixture rows for the public landing page.
 */
import { AGENT_GUIDE_URL, CPA_URL, GITHUB_URL, RELEASES_DOWNLOAD_URL } from '../site-meta.mjs';

export const LANDING_PAGES = [
  { lang: 'en', path: '/', file: 'index.html', hreflang: 'en' },
];

/**
 * The commands behind each install step, keyed by the name a step refers to (`install.tabs`).
 * Long commands fold with shell line continuations, so they read cleanly in a narrow block and
 * still paste as they are.
 */
export function installCode(keyPlaceholder) {
  return {
    files: [
      'mkdir -p oh-my-cpa && cd oh-my-cpa',
      `curl -fsSL \\\n  ${RELEASES_DOWNLOAD_URL}/compose.full.yml \\\n  -o compose.yml`,
      `curl -fsSL \\\n  ${RELEASES_DOWNLOAD_URL}/cpa.config.example.yaml \\\n  -o config.yaml`,
    ],
    keys: [
      `printf 'CPA_MANAGEMENT_KEY=%s\\nOMCPA_MASTER_KEY=%s\\n' \\\n  "$(openssl rand -hex 24)" "$(openssl rand -hex 32)" > .env`,
      'chmod 600 .env',
    ],
    start: ['docker compose up -d'],
    consoleFiles: ['mkdir -p oh-my-cpa && cd oh-my-cpa', `curl -fsSL \\\n  ${RELEASES_DOWNLOAD_URL}/compose.omc.yml \\\n  -o compose.yml`],
    connect: [
      `printf 'OMCPA_CPA_BASE_URL=http://host.docker.internal:8317\\nOMCPA_MASTER_KEY=%s\\n' \\\n  "$(openssl rand -hex 32)" > .env`,
      `cat >> .env <<'EOF'\nOMCPA_CPA_MANAGEMENT_KEY='${keyPlaceholder}'\nEOF`,
      'chmod 600 .env',
    ],
  };
}

export const COPY = {
  en: {
    htmlLang: 'en',
    title: 'Oh My CPA: the self-hosted AI gateway console',
    description:
      'Centralize APIs, OAuth and routing, and observe requests, quota and cost. Open source and self-hosted beside CLIProxyAPI, with a built-in agent and MCP.',
    ogAlt: 'The Oh My CPA dashboard in light and dark themes',
    skip: 'Skip to content',
    nav: {
      docs: 'Docs',
      api: 'API',
      demo: 'Demo',
      github: 'GitHub',
      theme: 'Switch theme',
      toDark: 'Switch to dark theme',
      toLight: 'Switch to light theme',
      home: 'Oh My CPA home',
      start: 'Quick start',
    },
    starBanner: {
      text: 'Open source under MIT — if Oh My CPA helps you, give it a star on GitHub',
      cta: 'Star on GitHub',
      close: 'Dismiss banner',
    },
    docs: '/docs/en',
    release: (version) => `<strong data-release-version>v${version}</strong> release notes`,
    hero: {
      lead: 'Centralize APIs, OAuth and routing, observe requests, quota and cost. Open source, self-hosted.',
      primary: 'Quick start',
      secondary: 'Live demo',
      github: 'GitHub',
    },
    console: {
      caption:
        'An operator asks the Oh My CPA agent to compare requests and failure rates by provider over the last 24 hours, sees Codex is failing due to team-2 nearing its 5-hour limit, and approves moving team-3 to the top of the Codex route with an automatic configuration backup.',
      nav: [
        ['Operate', [['layout-grid', 'Dashboard'], ['bot', 'Agent'], ['square-terminal', 'Playground'], ['boxes', 'Model Square']]],
        ['Gateway', [['server', 'AI providers'], ['log-in', 'OAuth management'], ['key-round', 'Key management'], ['layers', 'Routing']]],
        ['Observe', [['chart-line', 'Insights'], ['history', 'Request Events'], ['dollar-sign', 'Model Pricing'], ['file-text', 'Logs'], ['scroll-text', 'Audit trail']]],
        ['Plugins', [['puzzle', 'Plugin management'], ['store', 'Plugin store']]],
        ['Control', [['sliders-horizontal', 'Config panel'], ['settings', 'OMC settings'], ['info', 'System info']]],
      ],
      crumb: ['Operate', 'Agent'],
      placeholder: 'Ask or operate this deployment',
      mode: 'Chat',
      u1: 'Compare requests and failure rate by provider over the last 24 hours',
      thinking: 'Thinking',
      readTools: ['Read 24h usage summary', 'Read OAuth quota & health'],
      a1: '1,284 requests in the last 24 hours, 98.8% succeeded. <b>Codex</b> had the highest failure rate (4.1%), mostly from account <b>team-2</b> hitting 92% of its 5-hour window.',
      compare: {
        cols: ['Provider', 'Requests', 'Failure rate'],
        rows: [
          ['codex', 'Codex', '512', '4.1%', 82, 'warn'],
          ['claude', 'Claude', '418', '0.5%', 10, 'ok'],
          ['gemini', 'Gemini', '246', '0.4%', 8, 'ok'],
          ['openrouter', 'OpenRouter', '108', '0.0%', 0, 'ok'],
        ],
      },
      u2: 'Move the highest-quota Codex credential to top priority',
      planTool: 'Read OAuth quota & draft routing plan',
      a2: 'team-3 has 81% of its 5-hour window left. This plan puts it first and team-2 second, saving an encrypted configuration backup before applying.',
      approval: { title: 'Waiting for your approval', approved: 'Approved', route: 'Codex route', approve: 'Approve', diff: 'View diff' },
      a3: '<b>team-3</b> is now top priority on the Codex route, with team-2 moved to second. The routing board is at revision 42, and the pre-change encrypted backup has been saved.',
    },
    beside: {
      title: 'Beside your gateway',
      body: [
        'Clients keep talking straight to CLIProxyAPI, with no extra hop in your inference path. Oh My CPA reads the management API to record every request, latency and cost locally.',
        'Your gateway stays independent either way. Open the console on desktop or mobile to manage providers, OAuth accounts, routing and live usage in one place.',
      ],
      providersLabel: 'Supported providers and protocols',
      providers: [
        ['claude', 'Claude'],
        ['codex', 'Codex'],
        ['gemini', 'Gemini'],
        ['antigravity', 'Antigravity'],
        ['kimi', 'Kimi'],
        ['xai', 'xAI'],
        ['devin', 'Devin'],
        ['meta', 'Meta Muse'],
        ['vertex', 'Vertex AI'],
        ['deepseek', 'DeepSeek'],
        ['opencode', 'OpenCode'],
        ['openai', 'OpenAI compatible'],
        ['anthropic', 'Anthropic (Messages)'],
      ],
    },
    map: {
      title: 'See how models route to credentials',
      modelsHead: 'Models called',
      credentialsHead: 'Credentials & providers',
      requests: '{count} req',
      clients: [
        ['claude', 'claude-opus-5.5', '418', '0,3'],
        ['openai', 'gpt-6-astra', '512', '1,2'],
        ['gemini', 'gemini-4-hydrogen', '246', '3'],
        ['deepseek', 'deepseek-v4.1-flash', '108', '4'],
      ],
      credentials: [
        ['claude', 'Claude', 'claude-max (OAuth)'],
        ['codex', 'Codex', 'team-3 (OAuth)'],
        ['codex', 'Codex', 'team-2 (OAuth)'],
        ['antigravity', 'Antigravity', 'ag-pro (OAuth)'],
        ['openai', 'OpenAI compatible', 'relay-de••••••••mary'],
      ],
      stats: ['Requests', 'Spent'],
      caption: 'Model calls enter Oh My CPA and route across OAuth credentials and OpenAI-compatible endpoints.',
    },
    features: {
      title: 'Everything your gateway does, in plain sight',
      cards: {
        requests: { title: 'Every request, accounted for', body: 'Records stream in live with model, account, tokens, latency and cost.' },
        cost: { title: 'Know what each model costs', body: 'Prices follow the OpenRouter catalog, and each request keeps the price it was billed at.' },
        oauth: { title: 'OAuth accounts that stay ready', body: 'Watch every quota window and warm accounts on a schedule, so capacity is there when work starts.' },
        receipt: { title: 'A daily receipt you can print', body: 'Generate a usage receipt for today or any range, ready to copy, export or print.' },
      },
      columns: { time: 'Time', model: 'Model', account: 'Account', tokens: 'Tokens', cost: 'Cost' },
      costTotal: 'Last 30 days',
      windows: ['5h', '7d'],
      warming: 'Warming',
      ready: 'Ready',
      receipt: {
        title: 'TODAY’S RECEIPT',
        tagline: 'Metered by Oh My CPA',
        totalLabel: 'API COST TOTAL',
        total: '$18.42',
        summary: [
          ['Requests', '1,284'],
          ['Success rate', '99.2%'],
          ['vs previous', '-12.4%', 'down'],
        ],
        itemsHead: ['KEY / MODEL', 'REQ', 'COST'],
      },
    },
    install: {
      title: 'Up in about three minutes',
      tabs: [
        {
          id: 'compose',
          label: 'New stack',
          link: { href: '/start/quickstart', text: 'Read the quickstart' },
          steps: [
            ['Get the files', 'The Compose file and the gateway configuration.', 'files'],
            ['Make the keys', 'One to sign in, one to encrypt local data.', 'keys'],
            ['Start', 'Then open <code>http://127.0.0.1:8080</code> and sign in with <code>CPA_MANAGEMENT_KEY</code> from <code>.env</code>.', 'start'],
          ],
        },
        {
          id: 'agent',
          label: 'Coding agent',
          link: { href: '/start/agent', text: 'What the agent does' },
          steps: [
            ['Copy one sentence', 'It points to an install guide written for agents.', 'prompt'],
            ['Paste it to your agent', 'Claude Code, Codex or Cursor. It reports the console address when done.'],
          ],
        },
        {
          id: 'standalone',
          label: 'Existing CPA',
          link: { href: '/install', text: 'Choose an install path' },
          steps: [
            ['Get the console', 'The Compose file for Oh My CPA.', 'consoleFiles'],
            ['Connect CPA', 'Fill in its management key; CPA itself stays as it is.', 'connect'],
            ['Start', 'Then open <code>http://127.0.0.1:8080</code> and sign in with the CPA management key.', 'start'],
          ],
        },
      ],
      agentPrompt: `Install Oh My CPA for me by following ${AGENT_GUIDE_URL}`,
      keyPlaceholder: '<CPA management key>',
      copy: 'Copy',
      copied: 'Copied',
      copyFailed: 'Copy failed',
    },
    faqTitle: 'Questions',
    faq: [
      [
        'What is CLIProxyAPI?',
        `An open-source gateway that serves OpenAI, Claude and Gemini compatible APIs from your provider keys and OAuth accounts. <a href="${CPA_URL}">CLIProxyAPI</a> handles the traffic; Oh My CPA is its console.`,
      ],
      [
        'Will it change my gateway configuration?',
        'Only when you save a change in the console. Each save checks the revision, lists the paths it touches and keeps an encrypted copy of the previous file to download or restore.',
      ],
      ['Where does my data live?', 'Usage records, settings and encrypted secrets live in one SQLite database on your machine. There is no hosted service behind the console.'],
      ['Can my own agents use it?', 'Yes. The capabilities the built-in agent uses are open over MCP, and anything that changes state waits for an administrator to approve it in the browser.'],
      ['How do updates work?', 'The console checks GitHub releases and, with the updater running, upgrades in one click. The updater keeps the previous container until the new one is healthy.'],
      ['What does it cost?', `Nothing. Oh My CPA is open source under the MIT license, and the <a href="${GITHUB_URL}">source is on GitHub</a>.`],
    ],
    cta: { title: 'Try it now', lead: 'The live demo runs on sample data, with nothing to install.' },
    footer: {
      navLabel: 'Open-source links',
      demo: 'Live demo',
      api: 'API reference',
      docs: 'Docs',
      releases: 'Releases',
      github: 'GitHub',
      issues: 'Issues',
      cpa: 'CLIProxyAPI',
      license: 'MIT License',
    },
  },
};

// Sample rows for the request and cost cards. Model names follow the demo deployment.
export const REQUEST_ROWS = [
  ['claude', 'claude-opus-5.5', 'claude-max', '18.2K', '$0.214', 'ok'],
  ['codex', 'gpt-6-luna', 'team-3', '9.6K', '$0.041', 'ok'],
  ['gemini', 'gemini-4-hydrogen', 'gemini-pro', '42.7K', '$0.087', 'ok'],
  ['codex', 'gpt-6-luna', 'team-2', '3.1K', '$0.013', 'fail'],
  ['deepseek', 'deepseek-v4.1-flash', 'router-key', '6.4K', '$0.004', 'ok'],
  ['claude', 'claude-opus-5.5', 'claude-max', '27.9K', '$0.318', 'ok'],
  ['codex', 'gpt-6-luna', 'team-3', '12.0K', '$0.052', 'ok'],
  ['gemini', 'gemini-4-hydrogen', 'gemini-pro', '8.8K', '$0.019', 'ok'],
];

export const COST_MODELS = [
  ['gemini', 'gemini-4-hydrogen', 41.2, 25],
  ['claude', 'claude-opus-5.5', 38.6, 23],
  ['codex', 'gpt-6-luna', 33.1, 20],
  ['deepseek', 'deepseek-v4.1-flash', 21.4, 13],
  ['openrouter', 'glm-5.3-flash', 18.9, 11],
];

export const OAUTH_ROWS = [
  ['claude', 'claude-max', [64, 82]],
  ['codex', 'team-3', [81, 57]],
  ['codex', 'team-2', [8, 34]],
  ['gemini', 'gemini-pro', [100, 100], 'warm'],
];

export const RECEIPT_LINES = [
  ['claude', 'claude-opus-5.5', '418', '$8.94'],
  ['codex', 'gpt-6-luna', '512', '$5.62'],
  ['gemini', 'gemini-4-hydrogen', '246', '$2.96'],
];
