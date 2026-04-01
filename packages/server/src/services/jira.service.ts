import { env } from '../env.js';
import type { HelpTicketInput, HelpTicketResult } from '@itatti/shared';

export async function createHelpTicket(
  input: HelpTicketInput
): Promise<HelpTicketResult> {
  const authToken = Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString(
    'base64'
  );

  const description = [
    `*Full Name:* ${input.fullName}`,
    `*Contact Email:* ${input.contactEmail}`,
    `*Fellowship Year:* ${input.fellowshipYear}`,
    input.message ? `*Message:* ${input.message}` : '',
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
          summary: `VIT ID Help Request: ${input.fullName}`,
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
