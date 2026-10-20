# Submission PDF template

Build all three PDFs with `pnpm docs:pdf`, or one with `pnpm docs:pdf technical`, `security`, or `evidence`. Output is written to the ignored `docs/tech/build/` directory. The build requires Pandoc and Typst. Mermaid CLI is required only when a selected source contains a Mermaid diagram.

The approved design uses blue covers with the original Monara mascot, white A4 interiors, compact geometric page-edge artwork, branded headers, and page-number/progress footers. `page-frame.svg` supplies the interior edge decoration; `cover-background.svg` supplies the cover artwork. Both are vector assets. The temporary header/footer alternatives and picker were removed after selection.

`monara.typst` owns the typesetting. Montserrat is used for display headings, Nunito Sans for body text, and Geist Mono for code at the surrounding text size. Tables have a rounded outer border and can continue across pages with repeated headings. Bold-only lead-in paragraphs stay with the following content via `links.lua`. Body text remains searchable and selectable.

This is a finalized visual template, not content sign-off. Source Markdown and review statuses remain unchanged. `pnpm docs:pdf --final` continues to require reviewed content and no TODOs; changing the design does not waive that requirement.
