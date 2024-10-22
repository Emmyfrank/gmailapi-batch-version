import { OAuth2Client } from "google-auth-library";
import { fetchFullMessages, fetchInboxMessageIds } from "./gmail_batch_fetch";
import { getAttachments } from "./get-attachment";

export const searchEmails = async (auth: OAuth2Client, query: string, pageToken?: string, pageSize: number = 5) => {
  console.log(`Searching emails with query: "${query}", pageToken: "${pageToken}", pageSize: ${pageSize}`);
  try {
    const { messageIds, nextPageToken } = await fetchInboxMessageIds(auth, `${query} AND has:attachment`, pageToken, pageSize);
    console.log(`Fetched ${messageIds.length} message IDs`);
    
    if (messageIds.length === 0) {
      console.log('No messages found matching the criteria');
      return { emails: [], nextPageToken: null };
    }
    
    const messages = await fetchFullMessages(auth, messageIds);
    console.log(`Fetched ${messages.length} full messages`);
    
    const emailsWithAttachments = await Promise.all(
      messages.map(async (message: any) => {
        if (!message || !message.id) {
          console.log('Invalid message object:', message);
          return null;
        }
        try {
          const attachments = await getAttachments(auth, message.id);
          console.log(`Message ${message.id} has ${attachments.length} attachments`);
          if (attachments.length === 0) {
            console.log(`Message ${message.id} has no attachments, skipping`);
            return null;
          }
          const headers = message.payload?.headers || [];
          const dateHeader = headers.find((header: any) => header.name?.toLowerCase() === 'date');
          const fromHeader = headers.find((header: any) => header.name?.toLowerCase() === 'from');
          const date = dateHeader ? new Date(dateHeader.value || '') : null;
          const [name, emailAddress] = (fromHeader?.value || '').split('<');
          return {
            id: message.id,
            threadId: message.threadId,
            snippet: message.snippet,
            date: date ? date.toISOString() : null,
            name: name?.trim() || '',
            email: emailAddress?.replace('>', '').trim() || '',
            attachments: attachments.map(att => ({
              mimeType: att.mimeType,
              filename: att.filename,
              attachmentId: att.attachmentId,
            })),
          };
        } catch (error) {
          console.error(`Error processing message ${message.id}:`, error);
          return null;
        }
      })
    );
    
    const filteredEmails = emailsWithAttachments.filter((email:any) => email !== null);
    console.log(`Filtered to ${filteredEmails.length} emails with attachments`);
    
    return {
      emails: filteredEmails,
      nextPageToken: nextPageToken,
    };
  } catch (error) {
    console.error('Error in searchEmails:', error);
    throw error;
  }
};