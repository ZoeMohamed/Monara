/** A block of a legal page: a paragraph, or a bulleted list. */
/** A paragraph, a bulleted list, or a sentence that ends in the contact address as a link. */
type LegalBlock = string | { list: readonly string[] } | { contact: string };

/** Where Users send questions and requests to delete or copy their data. */
export const legalContactEmail = "monara@abhipraya.dev";

type LegalSection = { heading: string; blocks: readonly LegalBlock[] };

export type LegalDocument = {
  title: string;
  /** Shown as the effective date, so keep it in step with any change to the text. */
  updated: string;
  intro: string;
  sections: readonly LegalSection[];
};
