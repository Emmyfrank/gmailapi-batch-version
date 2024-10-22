import { Router } from "express";
import { google } from "googleapis";
import { authenticate, generateAuthToken } from "../gmail";
import { searchEmails } from "../search-email";
import { OAuth2Client } from "google-auth-library";
import fs from "fs";
import { TOKEN_PATH } from "../gmail";

const router = Router();

router.post("/generate", async (req, res) => {
  try {
    const code = req.body.code as string | undefined;
    if (!code || code === "") {
      return res.status(400).send("Bad Request: Code is required");
    }
    
    const generated = await generateAuthToken(code);
    res.json({
      success: generated,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
});
router.get("/search", async (req, res) => {
  try {
    const auth = await authenticate();
    if (typeof auth === "string") {
      return res.status(401).send({
        error: "Credentials have expired. Please re-authenticate.",
        authUrl: auth,
      });
    }
    if (!(auth instanceof OAuth2Client)) {
      return res.status(500).send("Internal Server Error: Invalid auth object");
    }
    const query = req.query.q as string;
    const pageToken = req.query.pageToken as string | undefined;
    const pageSize = Number(req.query.pageSize) || 5;
    if (!query) {
      return res.status(400).send("Bad Request: Query parameter 'q' is required");
    }
    console.log(`Received search request with query: "${query}", pageToken: "${pageToken}", pageSize: ${pageSize}`);
    const { emails, nextPageToken } = await searchEmails(auth, query, pageToken, pageSize);
    if (emails.length === 0) {
      console.log('No emails found matching the criteria');
    } else {
      console.log(`Found ${emails.length} emails matching the criteria`);
    }
    const emailDetails = emails.map((email: any) => ({
      ...email,
      attachments: email.attachments.map((att: any) => ({
        ...att,
        downloadUrl: `${req.protocol}://${req.get("host")}/api/download/${email.id}/${att.attachmentId}/${encodeURIComponent(att.filename || "")}`,
      })),
    }));
    res.json({
      emails: emailDetails,
      nextPageToken: nextPageToken,
    });
  } catch (error) {
    console.error("Error in search route:", error);
    res.status(500).send("Internal Server Error: " + (error as Error).message);
  }
});

router.get(
  "/download/:messageId/:attachmentId/:filename?",
  async (req, res) => {
    try {
      const auth = await authenticate();
      const { messageId, attachmentId, filename } = req.params;
      
      if (!(auth instanceof OAuth2Client)) {
        return res
          .status(500)
          .send("Internal Server Error: Invalid auth object");
      }
      
      const gmail = google.gmail({ version: "v1", auth });
      const attachment = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId,
        id: attachmentId,
      });
      
      if (!attachment.data.data) {
        return res.status(404).send("Attachment not found");
      }
      
      const buffer = Buffer.from(attachment.data.data, "base64");
      
      const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
      const safeFilename = filename || `${timestamp}.pdf`;
      
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeFilename}"`
      );
      res.send(buffer);
    } catch (error) {
      console.error("Error:", error);
      res.status(500).send("Internal Server Error");
    }
  }
);

router.post('/logout', (req, res) => {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      fs.unlinkSync(TOKEN_PATH);
    }
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Error logging out:', error);
    res.status(500).send('Internal Server Error');
  }
});

export default router;