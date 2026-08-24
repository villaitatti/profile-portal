import { env } from '../env.js';
import { logger } from '../lib/logger.js';
import type { HelpTicketInput, HelpTicketResult } from '@itatti/shared';

export function isJiraConfigured(): boolean {
  return !!(env.JIRA_BASE_URL && env.JIRA_EMAIL && env.JIRA_API_TOKEN && env.JIRA_SERVICE_DESK_ID && env.JIRA_REQUEST_TYPE_ID);
}

/**
 * Neutralise Jira wiki markup in values supplied through the public help form.
 *
 * The ticket description is assembled as wiki markup, so an unescaped field can
 * inject formatting, links, macros or panels into a ticket that staff read as
 * trustworthy internal content. Jira treats a backslash as the escape character
 * for its markup metacharacters; `{` and `[` are the ones that start macros and
 * links, and `*`/`_`/`-`/`+`/`?`/`^`/`~` are inline formatting.
 *
 * NOTE: this escapes inline metacharacters but NOT line breaks. Callers must
 * decide how to handle newlines — inline fields strip them, the free-text
 * message is wrapped verbatim. A newline left in a `\n`-joined description would
 * otherwise start a new block (a fake `*Full Name:*` line, an `h1.` heading, a
 * `----` rule) even with the metacharacters escaped.
 */
function escapeWikiMarkup(value: string): string {
  return value.replace(/[\\{}[\]*_\-+?^~|!]/g, (c) => `\\${c}`);
}

/**
 * Single-line fields: collapse all whitespace runs (including any newline the
 * caller managed to inject) to a single space, then escape inline markup. Used
 * for the summary and the labelled description fields, none of which are
 * legitimately multi-line.
 */
function escapeInline(value: string): string {
  return escapeWikiMarkup(value.replace(/\s+/g, ' ').trim());
}

/**
 * The free-text message IS legitimately multi-line, so render it verbatim inside
 * a {noformat} block instead of escaping it character by character. Strip any
 * {noformat}/{code} tokens from the input first so it cannot close the block and
 * resume writing markup.
 */
function toNoFormatBlock(value: string): string {
  const neutralised = value.replace(/\{(noformat|code)(:[^}]*)?\}/gi, '');
  return `{noformat}\n${neutralised}\n{noformat}`;
}

export async function createHelpTicket(
  input: HelpTicketInput
): Promise<HelpTicketResult> {
  if (!isJiraConfigured()) {
    logger.warn('Jira not configured, skipping help ticket creation');
    return { issueKey: 'JIRA-NOT-CONFIGURED' };
  }

  const authToken = Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString(
    'base64'
  );

  const description = [
    `*Full Name:* ${escapeInline(input.fullName)}`,
    `*Contact Email:* ${escapeInline(input.contactEmail)}`,
    `*Fellowship Year:* ${escapeInline(input.fellowshipYear)}`,
    // The message is a textarea, so keep its line breaks but render it verbatim
    // rather than as wiki markup.
    input.message ? `*Message:*\n${toNoFormatBlock(input.message)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const response = await fetch(
    `${env.JIRA_BASE_URL}/rest/servicedeskapi/request`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authToken}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        serviceDeskId: env.JIRA_SERVICE_DESK_ID,
        requestTypeId: env.JIRA_REQUEST_TYPE_ID,
        requestFieldValues: {
          summary: `VIT ID Help Request: ${escapeInline(input.fullName)}`,
          description,
        },
        raiseOnBehalfOf: input.contactEmail,
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Jira API error: ${response.status} - ${body}`);
  }

  const data = (await response.json()) as { issueKey: string };
  return { issueKey: data.issueKey };
}
