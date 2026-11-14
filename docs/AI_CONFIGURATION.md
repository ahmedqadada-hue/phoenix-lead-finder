# AI configuration

AI is optional. Without it the app still discovers, verifies, scores by rules, and drafts messages from templates. With it you also get business analysis, evidence-quoted opportunity detection, an AI fit assessment in the score, and personalised messages in several Arabic styles.

## The primary method: OpenAI API key

Use an **OpenAI API account that is separate from your personal ChatGPT account**.

Important: a ChatGPT subscription (Plus, Pro, Team) and OpenAI API billing are two different products. A subscription does **not** give API credit.

1. Create or sign in to an API account at https://platform.openai.com/ (you can use a different e-mail from your ChatGPT one).
2. Add a payment method and, recommended, a monthly budget limit in the OpenAI billing settings.
3. Create a key at https://platform.openai.com/api-keys.
4. In Phoenix: **AI Connections → OpenAI API** → paste the key → **Save** → **Test connection**.
5. After a successful test the **Model** field offers the models your key can use. Pick one. Smaller models cost much less and are enough for this work.
6. Set the **Monthly limit** (number of AI tasks). One analysis or one generated message is one task.

## Alternatives with free allowances

The same page offers **Google Gemini** (https://aistudio.google.com/apikey) and **Groq** (https://console.groq.com/keys). Both had free allowances at the time of writing; check their current limits. Arabic writing quality varies by model, so compare a few messages before settling.

When several AI providers are enabled, the one with the most monthly allowance left is used.

Default model names in the form are only starting suggestions and may be outdated; always choose from the list shown after **Test connection**.

## Where the key lives

- Encrypted with AES-256-GCM using `ENCRYPTION_KEY` from the server's `.env`, stored in the database.
- Used only on the server. It is never sent to the browser; the page shows only the last 4 characters.
- Not written to logs or to Git.

## Cost and usage control

- **Monthly limit** per provider, enforced in the database; when reached, AI features report "limit reached" instead of spending more.
- Usage this month and token counts are shown on each card. Multiply the token counts by your provider's current prices to estimate cost; prices are not hard-coded because they change.
- Message generation is rate-limited per user.

## How the AI is kept honest

- It receives only the stored sources (search snippets and the text of the business's own website), wrapped and labelled as untrusted data that must never be followed as instructions.
- Every opportunity must cite one of the supplied source URLs and quote its evidence. The server then checks: an opportunity citing an unknown URL is **dropped**; a quote that does not appear in the source is kept only as **low confidence, uncertain**.
- If there is not enough evidence the analysis says so, and no opportunity is shown.
- Messages may mention only an evidenced signal. Generated text is checked for the company name, unfilled placeholders, and links or phone numbers that are not in your agency profile; problems are shown as warnings before you use the text.

## Sign in with ChatGPT — status: unavailable

Reference: https://developers.openai.com/siwc/quickstart

This option is shown on the AI Connections page as **Unavailable** and is not implemented. Reasons:

- Phoenix needs unattended background processing on a server (analysing leads while no user is present). A sign-in flow identifies a person in an app; it is not a way to spend a ChatGPT subscription on server-side background jobs.
- Eligibility for that programme depends on OpenAI approving the specific app and deployment, which cannot be assumed.

If your deployment is later approved for an official flow that covers this use, it can be added as another provider adapter. Until then use an API key.

The app never uses ChatGPT browser cookies, session tokens or passwords.
