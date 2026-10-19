# PDF fonts

Static Nunito Sans (Regular, Bold, Italic, Bold Italic) used only to typeset the submission PDFs. They are instances cut from the app's own variable fonts in `apps/web/public/fonts`, converted from WOFF2 to TTF because Typst cannot read WOFF2 or variable fonts. License: SIL OFL 1.1, see `apps/web/public/fonts/OFL.txt`.

Montserrat Bold and ExtraBold are bundled for display headings and covers, matching the approved deck visual direction. Static TTFs from the local Montserrat installation; SIL OFL 1.1, see `Montserrat-OFL.txt`. Body text remains Nunito Sans.

Geist Mono Regular is a static weight-400 instance of the local official Geist Mono variable TTF, used for inline and block code at the surrounding text size. SIL OFL 1.1, see `GeistMono-OFL.txt` (vercel/geist-font).
