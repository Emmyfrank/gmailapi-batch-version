import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
const gmailBatchEndpoint = 'https://www.googleapis.com/batch/gmail/v1';
const batchLimit = 5;

function stringifyQuery(obj: Record<string, any>): string {
  return Object.entries(obj)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

async function fetchFullMessages(
  auth: OAuth2Client,
  messageIds: string[] = []
) {
  console.log(`Fetching full messages for ${messageIds.length} message IDs`);
  const messageQueries = messageIds.map(function (id) {
    return { uri: '/gmail/v1/users/me/messages/' + id };
  });
  const limitedMessageQueries = messageQueries.slice(0, batchLimit);
  console.log(`Limited to ${limitedMessageQueries.length} queries due to batch limit`);

  try {
    const results = await fetchBatch(
      (await auth.getAccessToken()).token!,
      limitedMessageQueries,
      'batch_gmail_api',
      gmailBatchEndpoint
    );
    console.log(`Received ${results.length} results from batch fetch`);
    return results;
  } catch (error) {
    console.error('Error in fetchFullMessages:', error);
    throw error;
  }
}

async function fetchInboxMessageIds(
  auth: OAuth2Client,
  query: string,
  pageToken = '',
  maxResults = 5,
  maxDepth = 10,
  currentDepth = 0
): Promise<{ messageIds: string[], nextPageToken:any | undefined }> {
  console.log(`Fetching inbox message IDs with query: "${query}", pageToken: "${pageToken}", maxResults: ${maxResults}, currentDepth: ${currentDepth}`);
  
  if (currentDepth > maxDepth) {
    console.log('Reached max depth for pagination, stopping recursive fetch.');
    return { messageIds: [], nextPageToken: undefined };
  }
  
  const gmail = google.gmail({ version: 'v1', auth });
  
  try {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: maxResults,
      pageToken: pageToken,
    });
    
    const messageIds = (res.data.messages || []).map(message => message.id!);
    console.log(`Fetched---->> ${messageIds.length} message IDs`);
    
    return { messageIds, nextPageToken: res.data.nextPageToken };
  } catch (error) {
    console.error('Error in fetchInboxMessageIds:', error);
    throw error;
  }
}

async function fetchBatch(
  accessToken: string,
  apiCalls: { uri: string; method?: string; qs?: any; body?: string; }[],
  boundary: string = 'batch_gmail_api',
  batchUrl: string = 'https://www.googleapis.com/batch'
) {
  const createBatchBody = function (
    apiCalls: { uri: string; method?: string; qs?: any; body?: string; }[],
    boundary: string
  ) {
    const batchBody: string[] = [];
    apiCalls.forEach(function (call) {
      const method = call.method || 'GET';
      let uri = call.uri;
      if (call.qs) {
        uri += '?' + stringifyQuery(call.qs);
      }
      let body = '\r\n';
      if (call.body) {
        body = [
          'Content-Type: application/json',
          '\r\n\r\n',
          JSON.stringify(call.body),
          '\r\n'
        ].join('');
      }
      batchBody.push(
        `--${boundary}`,
        'Content-Type: application/http',
        '',
        `${method} ${uri}`,
        body
      );
    });
    batchBody.push(`--${boundary}--`);
    return batchBody.join('\r\n');
  };

  const batchBody = createBatchBody(apiCalls, boundary);
  const response = await fetch(batchUrl, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'multipart/mixed; boundary="' + boundary + '"'
    },
    body: batchBody
  });
  const text = await response.text();

const regex = /{[\s]*"name"[\s]*:[\s]*"Reply-To"[\s]*,[\s]*"value"[\s]*:[\s]*"[^"]+"[\s]*}/g;
       const nerRegex = text.match(regex);
       console.log("reply-To--->",nerRegex)
    return parseBatchResponse(text);
   
}

function parseBatchResponse(response: string): any[] {
  const boundaryRegex = /(--batch_[\w-]+)/g;
  const parts = response.split(boundaryRegex).filter(Boolean);
  const result = [];
  for (const part of parts) {
    if (part.includes('Content-Type: application/json')) {
      const jsonStartIndex = part.indexOf('{');
      const jsonEndIndex = part.lastIndexOf('}');
      if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
        try {
          const jsonString = part.substring(jsonStartIndex, jsonEndIndex + 1);
          const parsedPart = JSON.parse(jsonString);
          result.push(parsedPart);
        } catch (e) {
          console.error('Error parsing JSON part:', e);
        }
      } else {
        console.warn('Skipping part without valid JSON:', part);
      }
    } else {
      console.warn('Skipping non-JSON part:', part);
    }
  }
  return result;
}

export { fetchFullMessages, fetchInboxMessageIds };