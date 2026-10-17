import { BackButton } from "@/components/back-button";
import { Logo } from "@/components/logo";
import type { LegalDocument } from "@/lib/legal/types";

/** A plain public page for a legal document. */
export function LegalPage({ document }: { document: LegalDocument }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col gap-6 px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-12">
      <div className="flex flex-col items-start gap-4">
        <BackButton />
        <Logo />
      </div>
      <header className="flex flex-col gap-2">
        <h1 className="font-extrabold text-3xl tracking-tight">{document.title}</h1>
        <p className="text-[var(--muted)] text-sm">Updated {document.updated}</p>
        <p className="text-[15px] leading-6">{document.intro}</p>
      </header>
      {document.sections.map((section) => (
        <section className="flex flex-col gap-2" key={section.heading}>
          <h2 className="font-extrabold text-lg tracking-tight">{section.heading}</h2>
          {section.blocks.map((block) =>
            typeof block === "string" ? (
              <p className="text-[15px] text-[var(--muted)] leading-6" key={block}>
                {block}
              </p>
            ) : (
              <ul className="ml-5 list-disc space-y-1.5" key={block.list.join()}>
                {block.list.map((item) => (
                  <li className="text-[15px] text-[var(--muted)] leading-6" key={item}>
                    {item}
                  </li>
                ))}
              </ul>
            ),
          )}
        </section>
      ))}
    </main>
  );
}
