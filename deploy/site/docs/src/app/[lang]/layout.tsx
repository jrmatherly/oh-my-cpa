import { i18nProvider } from 'fumadocs-ui/i18n';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SiteRootProvider } from '@/components/site-root-provider';
import { i18n } from '@/lib/i18n';
import { translations } from '@/lib/layout.shared';
import { SITE_ORIGIN } from '@/lib/site';
import '../global.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    template: '%s | Oh My CPA Docs',
    default: 'Oh My CPA Docs',
  },
  description: 'Install, operate and extend Oh My CPA, the self-hosted AI gateway console.',
  applicationName: 'Oh My CPA',
  icons: { icon: '/docs/favicon.svg' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f7f8' },
    { media: '(prefers-color-scheme: dark)', color: '#131314' },
  ],
};

export function generateStaticParams() {
  return i18n.languages.map((lang) => ({ lang }));
}

export default async function LangRootLayout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) {
  const { lang } = await params;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <SiteRootProvider
          i18n={i18nProvider(translations, lang)}
          search={{
            options: {
              type: 'static',
              api: '/docs/search-index.json',
            },
          }}
        >
          {children}
        </SiteRootProvider>
      </body>
    </html>
  );
}
