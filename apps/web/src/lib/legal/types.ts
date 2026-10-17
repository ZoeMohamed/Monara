/** A block of a legal page: a paragraph, or a bulleted list. */
type LegalBlock = string | { list: readonly string[] };

type LegalSection = { heading: string; blocks: readonly LegalBlock[] };

export type LegalDocument = {
  title: string;
  /** Shown as the effective date, so keep it in step with any change to the text. */
  updated: string;
  intro: string;
  sections: readonly LegalSection[];
};
