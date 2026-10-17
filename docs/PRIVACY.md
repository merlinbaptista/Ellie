# Ellie Privacy Notice

Ellie keeps household information so it can remember home events, estimate what is due, explain reported problems, and send requested information to a phone. The privacy page and the `what_do_you_know` tool show the household inventory, active service sharing, message-consent history, and retention periods.

## Information Stored

Ellie may store household settings (country, city or region, time zone, language, and units), item names and details, events, predictions, diagnoses, resolutions, follow-up answers, consent records, reminder schedules, short links, phone chat, translation cache entries, and queued message records. Ellie does not request or store a full street address. Contact details are kept only after explicit consent and are masked in user-facing inventory and exports.

## Who Receives Data

| Active driver             | Data shared                                                                          | Purpose                        |
| ------------------------- | ------------------------------------------------------------------------------------ | ------------------------------ |
| All mock drivers          | Nothing leaves this computer                                                         | Local development and demo     |
| AWS DynamoDB              | Household records and home history                                                   | Store household data           |
| AWS Bedrock               | Item type, symptom, and history facts; not a person's name, phone, email, or address | Explain problems and translate |
| AWS SNS                   | Consented phone/email and message text                                               | Deliver messages               |
| AWS EventBridge Scheduler | Job id and timing                                                                    | Schedule reminders             |

Only active drivers are shown in an inventory. Phone messages are sent only while the matching consent is active.

## Retention

| Data                                              | Retention                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| Home history, items, predictions, and resolutions | Until you delete it                                                  |
| Outbox messages                                   | `OUTBOX_RETENTION_DAYS` (30 days by default)                         |
| Phone chat                                        | `CHAT_RETENTION_DAYS` (7 days) or link expiry, whichever comes first |
| Diagnosis sessions                                | 24 hours                                                             |
| Short links                                       | Link expiry (72 hours by default)                                    |
| Translation cache                                 | 7 days                                                               |
| Privacy audit records                             | `AUDIT_RETENTION_DAYS` (365 days by default)                         |

## Your Controls

Ask Ellie what she knows to review the inventory. `forget_item` asks for confirmation before deleting one item's records and related links, messages, and schedules. `forget_household` requires a spoken confirmation code before deleting the household. The privacy phone page lets you download a JSON export, forget an item, withdraw message consent, or type `erase` to erase everything. Consent history records when permission was granted or withdrawn and the source of that change.

## Limits

Ellie deletes records and schedules it controls. It cannot delete AWS-side SNS delivery logs, CloudWatch logs, or DynamoDB point-in-time backups. Backups kept by AWS expire on their own schedule. A counts-only audit record is retained after household erasure to show that the erase occurred; it contains no item names or contact details.

OAuth resource protection is optional and off by default. When enabled, Ellie validates access tokens from your authorization server and uses the household claim in the token. Ellie does not issue tokens or forward them to AWS services.
