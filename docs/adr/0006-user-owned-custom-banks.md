---
status: accepted
---

# Keep Custom Banks private and separate from Financial Accounts

Custom Banks are reusable definitions owned by one User, alongside the shared built-in institution catalog. A User may associate several Financial Accounts with one Custom Bank; bank name, optional icon, and exact transaction-notification sender addresses belong to the bank, while account nickname and last four digits belong to the Financial Account. This avoids duplicating sender configuration across accounts or publishing a User's additions to the shared catalog.

Custom Banks support Gmail discovery and transaction imports. Require a name and at least one exact sender address, with additional addresses supported. Keep logo selection optional, use the existing logo search and a neutral fallback, and persist the choice with the owned bank so it is available across devices. Image uploads are outside this version.

Creating a Custom Bank also creates its first Financial Account in the same flow. Default the account name to the bank name; account nickname and last four digits remain optional. Support Bank, Credit card, and Wallet as product kinds, with Bank selected initially. A sender already present in the built-in catalog makes the custom-bank submission invalid: tell the User that the bank is already listed in Monara.

The User confirmed the release scope and local implementation, then authorized simple editing through the shared form. Name, logo, and sender addresses may change with version checks; product kind stays fixed to preserve account compatibility. Sender edits refresh the relevant imports without rewriting historical financial records. Defer bank deletion and archiving; existing account deactivation and mailbox unlinking stop imports while history remains.

Use stable owned UUIDs and generated custom institution keys alongside existing built-in keys. Composite ownership references prevent a bank from being hard-deleted while Financial Accounts refer to it, while full User Deletion still clears the owned graph. See the [design notes](../custom-bank-design.md) for implementation and verification; remote migration and deployment require a separate request.
