import type { LegalDocument } from "@/lib/legal/types";

export const terms: LegalDocument = {
  title: "Terms",
  updated: "19 October 2026",
  intro:
    "These terms are the agreement between you and Monara when you use the app. They are written to be read. If something here is unclear, please ask us before you use Monara.",
  sections: [
    {
      heading: "What Monara is",
      blocks: [
        "Monara is a personal-finance app. It helps you see where your money goes by logging payments from your bank and e-wallet emails, by letting you add them yourself, and by answering questions about your spending in the app or on WhatsApp.",
        "Monara is an early version. Features can change, and some are still being built.",
      ],
    },
    {
      heading: "Your account",
      blocks: [
        "You sign in with your Google account. You must be at least 18 years old, and you are responsible for what happens under your account.",
        "The demo does not need an account. Anything you do in the demo stays in your browser and is not saved to a ledger.",
      ],
    },
    {
      heading: "Connecting Gmail and WhatsApp",
      blocks: [
        "Connecting Gmail is your choice and is separate from signing in. Monara only reads, and only emails from banks and e-wallets. It never sends, deletes or changes your email. You can disconnect Gmail at any time, and Monara stops reading it.",
        "You may connect only a mailbox that is yours. To use WhatsApp you link your own number and verify it. Monara does not accept messages from numbers that have not been linked and verified.",
        "How your data is handled is described in the Privacy Policy.",
      ],
    },
    {
      heading: "Your records and what Monara can get wrong",
      blocks: [
        "Monara reads emails with an AI model, and AI can make mistakes. A transaction it finds starts as pending, and you review it before it counts toward your totals. The one exception is a payment from a sender Gmail has verified, where Monara is confident and has an amount, a date and a matching account. That transaction is confirmed automatically. You can edit or delete any transaction at any time.",
        "Monara does not invent amounts, dates or accounts. When it is not sure, it leaves the field empty and asks you. Please still check your records, because you are the one who decides what is right.",
      ],
    },
    {
      heading: "Not financial advice",
      blocks: [
        "Monara is a tool for tracking and understanding your own spending. It is not a bank, it does not hold or move your money, and it does not give investment, tax, insurance or credit advice.",
        "Figures such as how much you have spent, what is safe to spend, forecasts and suggestions come from the records in Monara. They are only as complete as those records. Do not rely on them alone for decisions that matter, and do not treat them as a bank statement.",
      ],
    },
    {
      heading: "Using Monara properly",
      blocks: [
        "Please do not:",
        {
          list: [
            "use Monara for anything unlawful, or to handle someone else's accounts or mailbox without their permission;",
            "try to get into another person's data, or to find or exploit weaknesses in the service;",
            "overload or disrupt the service, or use automated tools against it beyond the app itself;",
            "copy, resell or reverse engineer Monara, except where the law lets you.",
          ],
        },
      ],
    },
    {
      heading: "Your data stays yours",
      blocks: [
        "Your records belong to you. You give Monara permission to process them only to run the app for you, as the Privacy Policy describes. Monara does not sell your data.",
      ],
    },
    {
      heading: "Availability and responsibility",
      blocks: [
        "Monara is provided as it is. It may be unavailable at times, and an email can arrive late, be missed or be read wrongly. We work to keep it reliable, but we cannot promise it will always work or always be right.",
        "To the extent the law allows, Monara is not responsible for indirect or consequential losses, such as a missed bill or a budget decision made on a wrong figure. Nothing here limits any right you have under the law that cannot be limited by agreement.",
      ],
    },
    {
      heading: "Stopping",
      blocks: [
        "You can stop using Monara at any time, disconnect Gmail and WhatsApp, or permanently delete your account in Profile Settings. Deletion requires typing DELETE MY ACCOUNT, checking the acknowledgement and selecting Delete permanently. There is no undo or recovery period. Access stops when deletion is accepted; connection and chat cleanup may take longer and retries automatically. Contact us if you need help.",
        "Deletion removes your personal Monara data and connections. Your Google account, original emails and already-delivered WhatsApp messages remain. Provider-held copies, operational logs and backups follow their own retention rules, as explained in the Privacy Policy. After cleanup completes, signing in again creates a fresh Monara account and starts setup from the beginning.",
        "We may suspend an account that breaks these terms or puts the service or other people at risk. We will explain why where we can.",
      ],
    },
    {
      heading: "Changes to these terms",
      blocks: [
        "We may update these terms as Monara grows. The date at the top shows when they last changed. If a change matters to you, we will tell you in the app. Using Monara after a change means you accept it.",
      ],
    },
    {
      heading: "Contact",
      blocks: [
        { contact: "Questions about these terms, and requests to have your data deleted, go to" },
      ],
    },
  ],
};
