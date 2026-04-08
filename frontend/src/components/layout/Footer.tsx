import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface/90 px-6 py-6 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-center text-sm text-ink-soft md:flex-row md:text-left">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 md:justify-start">
          <a href="tel:+919520666861" className="transition hover:text-foreground">
            Customer Care: +91-9520666861
          </a>
          <a href="mailto:hello@techmandalae.com" className="transition hover:text-foreground">
            Email: hello@techmandalae.com
          </a>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <span>Designed by Tech Mandalae</span>
          <Link
            href="https://www.techmandalae.com"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground transition hover:text-accent"
          >
            techmandalae.com
          </Link>
        </div>
      </div>
    </footer>
  );
}
