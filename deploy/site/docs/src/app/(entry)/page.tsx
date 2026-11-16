import Link from 'next/link';

/** `/docs/` holds no page of its own; it sends the reader to the documentation home. */
export default function DocsEntryPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
      <script
        dangerouslySetInnerHTML={{
          __html: "location.replace('/docs/en/' + location.search + location.hash);",
        }}
      />
      <noscript>
        <meta httpEquiv="refresh" content="0;url=/docs/en/" />
      </noscript>
      <h1 className="text-2xl font-semibold tracking-tight">Oh My CPA Documentation</h1>
      <Link
        href="/en"
        className="mt-6 rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground"
      >
        Open the documentation
      </Link>
    </main>
  );
}
