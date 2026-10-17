import type { LegalDocument } from "@/lib/legal/types";

export const privacy: LegalDocument = {
  title: "Privacy Policy",
  updated: "17 October 2026",
  intro:
    "Monara handles sensitive information: your spending and, if you choose, your bank emails. This page says what we keep, what we do not keep, and who helps us run the app.",
  sections: [
    {
      heading: "What Monara keeps",
      blocks: [
        {
          list: [
            "Your account: the name and email from your Google sign-in, and the full name you give during setup. We use the full name to recognise transfers between your own accounts.",
            "Your finances: the accounts, categories, budgets, reminders and transactions you add or confirm. Account balances are not stored.",
            "Your Gmail connection: the connected address, the connection's ID, and for each email read, its ID and whether it was processed, plus the details taken from it (amount, date, merchant, bank and type).",
            "Your WhatsApp link, if you add one: your verified number.",
            "Your conversations with Monara's assistant, in the app or on WhatsApp, so it can answer and act on your request.",
          ],
        },
      ],
    },
    {
      heading: "What Monara does not keep",
      blocks: [
        {
          list: [
            "The text or subject of your emails. They are read, the payment details are taken out, and the email itself is not saved.",
            "Your Gmail password or access tokens. The Gmail connection is held by our connection provider, and Monara never sees your password.",
            "A copy of your financial data for offline use. Monara needs a connection to show your records.",
          ],
        },
      ],
    },
    {
      heading: "How Gmail is used",
      blocks: [
        "When you connect Gmail, Monara reads only emails from banks and e-wallets that match the accounts you set up, starting with the last 30 days and then new ones as they arrive. It reads and nothing more: it never sends, deletes or changes email.",
        "An AI model reads each of those emails to find the amount, date, merchant and bank. Monara uses this information only to show and organise your own transactions. It does not use your email for advertising, does not sell it, and does not let people read it except where you ask for support, where it is needed to keep the app secure, or where the law requires it.",
        "Monara's use and transfer of information received from Google APIs will follow the Google API Services User Data Policy, including its Limited Use requirements.",
      ],
    },
    {
      heading: "Who helps us run Monara",
      blocks: [
        "Monara uses these services. Each handles your data only to do its job for the app.",
        {
          list: [
            "Supabase: sign-in and the database where your records are stored.",
            "Vercel and Cloudflare: where the app and the assistant run.",
            "Composio: holds your Gmail connection and fetches the emails Monara asks for.",
            "An AI model provider: receives the text of a payment email so it can pick out the details, and your messages to the assistant so it can reply.",
            "Brave Search: receives a merchant's name, so Monara can tell what kind of business it is and suggest a category. It receives nothing about you.",
            "Kapso: carries WhatsApp messages, if you link a number.",
          ],
        },
        "We do not sell your data, and we do not share it for advertising.",
      ],
    },
    {
      heading: "Keeping it safe",
      blocks: [
        "Every record is tied to your account, and the database only lets you see your own. Only the Monara server can change financial records, and the assistant acts through that same server. We do not write raw emails, financial records or sign-in tokens to our logs.",
        "No service is perfectly secure, and we cannot promise it. If something goes wrong that affects your data, we will tell you.",
      ],
    },
    {
      heading: "Your choices",
      blocks: [
        {
          list: [
            "Disconnect Gmail whenever you like, and Monara stops reading it. Records already created stay until you delete them.",
            "Edit or delete any transaction, account, budget or reminder in the app.",
            "Ask us to delete your account and everything stored with it, or to give you a copy of your data.",
          ],
        },
        "We keep your records for as long as you have an account, and delete them when you ask.",
      ],
    },
    {
      heading: "Changes to this policy",
      blocks: [
        "If we change this policy, the date at the top changes and we tell you in the app when it matters to you.",
      ],
    },
    {
      heading: "Contact",
      blocks: [
        "Contact details for the Monara team, for questions and for deletion or copy requests, will be added here before launch.",
      ],
    },
  ],
};
