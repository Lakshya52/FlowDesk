import express from "express";
import crypto from "crypto";
import { google } from "googleapis";
import User from "../models/User";
import Calendar from "../models/Calendar";
import CalendarEvent from "../models/CalendarEvent";
import { authenticate, AuthRequest } from "../middlewares/auth"; // your existing auth middleware

const router = express.Router();

const getOAuthClient = () =>
  new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );

const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

// ─── Signed OAuth state (CSRF protection: unguessable, HMAC-bound) ──────────
const stateSecret = () => process.env.JWT_SECRET || "flowdesk";

const signState = (userId: string): string => {
  const nonce = crypto.randomBytes(16).toString("hex");
  const sig = crypto
    .createHmac("sha256", stateSecret())
    .update(`${userId}.${nonce}`)
    .digest("hex");
  return `${userId}.${nonce}.${sig}`;
};

const verifyState = (state: unknown): string | null => {
  if (typeof state !== "string") return null;
  const [userId, nonce, sig] = state.split(".");
  if (!userId || !nonce || !sig) return null;
  const expected = crypto
    .createHmac("sha256", stateSecret())
    .update(`${userId}.${nonce}`)
    .digest("hex");
  if (sig.length !== expected.length) return null;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    ? userId
    : null;
};

// True when Google rejected our credentials (revoked/expired grant) — the
// client uses this to prompt a reconnect instead of a generic retry.
const isGoogleAuthError = (err: any): boolean =>
  err?.response?.data?.error === "invalid_grant" || err?.code === 401;

// ─── Shared Google → local date mapping ─────────────────────────────────────
// All-day `end.date` values from Google are EXCLUSIVE (day after the last
// day); plain `new Date("yyyy-MM-dd")` would also parse as UTC midnight.
// Both are normalised to local time here to match app conventions.
const parseGoogleStart = (gEvent: any): Date => {
  if (gEvent.start.dateTime) return new Date(gEvent.start.dateTime);
  const [y, m, d] = (gEvent.start.date as string).split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0);
};

const parseGoogleEnd = (gEvent: any): Date => {
  if (gEvent.end?.dateTime) return new Date(gEvent.end.dateTime);
  if (gEvent.end?.date) {
    return new Date(new Date(gEvent.end.date).getTime() - 1);
  }
  if (gEvent.start.dateTime) return new Date(gEvent.start.dateTime);
  return new Date(new Date(gEvent.start.date as string).getTime() - 1);
};

// ─── Shared import logic (Google calendar → local, idempotent) ──────────────
const syncGoogleCalendarIntoLocal = async (
  userId: any,
  calendarApi: any,
  gCalId: string,
  gCalName: string,
  gCalColor?: string,
): Promise<number> => {
  let calendar = await Calendar.findOne({ owner: userId, googleCalendarId: gCalId });
  if (!calendar) {
    calendar = await Calendar.create({
      name: gCalName,
      color: gCalColor || "#4285F4",
      owner: userId,
      googleCalendarId: gCalId,
    });
  }

  let pageToken: string | undefined;
  let count = 0;
  do {
    const eventsRes = await calendarApi.events.list({
      calendarId: gCalId,
      timeMin: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
      timeMax: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      singleEvents: true,
      maxResults: 2500,
      pageToken,
    });

    const googleEvents: any[] = eventsRes.data.items || [];
    for (const gEvent of googleEvents) {
      // Deleted in Google → remove the local copy instead of resurrecting it
      if (gEvent.status === "cancelled") {
        await CalendarEvent.deleteOne({ googleEventId: gEvent.id, createdBy: userId });
        continue;
      }
      if (!gEvent.start) continue;
      // Scoped to the importing user: the same shared Google event imported
      // by two colleagues must not overwrite each other's local copy.
      await CalendarEvent.findOneAndUpdate(
        { googleEventId: gEvent.id, createdBy: userId },
        {
          title: gEvent.summary || "(No title)",
          description: gEvent.description || "",
          startDate: parseGoogleStart(gEvent),
          endDate: parseGoogleEnd(gEvent),
          allDay: !gEvent.start.dateTime,
          calendar: calendar._id,
          createdBy: userId,
          googleEventId: gEvent.id,
        },
        { upsert: true, new: true },
      );
      count++;
    }
    pageToken = eventsRes.data.nextPageToken || undefined;
  } while (pageToken);

  return count;
};

// ─── 1. Return the Google OAuth URL ───────────────────────────────────────────
router.get("/auth-url", authenticate, (req: AuthRequest, res) => {
  const userId = req.user?._id?.toString();
  if (!userId) {
    res.status(401).json({ message: "Not authenticated." });
    return;
  }
  const oAuth2Client = getOAuthClient();
  //   console.log(">>> REDIRECT URI:", process.env.GOOGLE_REDIRECT_URI);
  const url = oAuth2Client.generateAuthUrl({
    access_type: "offline", // gives us a refresh token
    prompt: "consent", // forces refresh token every time
    scope: SCOPES,
    state: signState(userId), // signed + unguessable (CSRF-safe)
  });
  res.json({ authUrl: url });
});

// ─── 2. OAuth Callback (Google redirects here) ────────────────────────────────
// NOTE: this page is loaded in the SYSTEM BROWSER (Electron opens the auth
// URL via shell.openExternal). The global helmet CSP
// (script-src 'self' ...) would block the inline <script> below, so we
// override CSP for this response AND avoid depending on JS alone:
// a <meta refresh> + clickable link performs the flowdesk:// deep-link
// redirect even when scripts are blocked.
router.get("/callback", async (req, res) => {
  res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
  res.setHeader("Cache-Control", "no-store");
  // Allow the small inline helper script on THIS page only. No user input
  // is reflected into the HTML, so 'unsafe-inline' here is safe.
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
  );
  const { code, state } = req.query;
  const userId = verifyState(state);

  const successHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta http-equiv="refresh" content="0;url=flowdesk://google-auth-success" />
<title>FlowDesk — Authorization complete</title>
</head>
<body>
<p>Authorization complete. Returning to FlowDesk...</p>
<p>If you are not redirected automatically, <a href="flowdesk://google-auth-success">click here to return to FlowDesk</a>.</p>
<script>
  try {
    if (window.opener) window.opener.postMessage('google-oauth-success', '*');
  } catch (e) {}
  try {
    window.location.href = 'flowdesk://google-auth-success';
  } catch (e) {}
  setTimeout(function () { try { window.close(); } catch (e) {} }, 800);
</script>
</body>
</html>`;

  const errorHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>FlowDesk — Authorization failed</title>
</head>
<body>
<p>Google authorization failed. You can close this window and try again in FlowDesk.</p>
<script>
  try {
    if (window.opener) window.opener.postMessage('google-oauth-error', '*');
  } catch (e) {}
  try {
    window.location.href = 'flowdesk://google-auth-error';
  } catch (e) {}
</script>
</body>
</html>`;

  try {
    if (!code || !userId) {
      res.status(400).send(errorHtml);
      return;
    }
    const oAuth2Client = getOAuthClient();
    const { tokens } = await oAuth2Client.getToken(code as string);

    // Save refresh token to the user (only overwrite when Google gave us one)
    if (tokens.refresh_token) {
      await User.findByIdAndUpdate(userId, {
        googleRefreshToken: tokens.refresh_token,
      });
    } else {
      // No refresh token (e.g. user already consented): only proceed if the
      // user already has one stored, otherwise this auth did not connect.
      const existing = await User.findById(userId).select("googleRefreshToken").lean();
      if (!(existing as any)?.googleRefreshToken) {
        res.status(400).send(errorHtml);
        return;
      }
    }

    // Frontend polls GET /list as a fallback, so even if the deep link /
    // postMessage is blocked the modal still advances.
    res.send(successHtml);
  } catch (err) {
    console.log(err);
    res.status(500).send(errorHtml);
  }
});

// ─── 3. List — return Google calendars for user to pick ───────────────────────
router.get("/list", authenticate, async (req: AuthRequest, res) => {
  const userId = req.user?._id;

  try {
    const user = await User.findById(userId);
    if (!user?.googleRefreshToken) {
      return res.status(400).json({ message: "Google account not connected." });
    }

    const oAuth2Client = getOAuthClient();
    oAuth2Client.setCredentials({ refresh_token: user.googleRefreshToken });

    const calendarApi = google.calendar({ version: "v3", auth: oAuth2Client });
    const calendarList = await calendarApi.calendarList.list();

    const calendars = (calendarList.data.items || []).map((c) => ({
      id: c.id,
      name: c.summary,
      color: c.backgroundColor || "#4285F4",
      primary: c.primary || false,
    }));

    res.json({ calendars });
  } catch (err) {
    console.error("List calendars error:", err);
    if (isGoogleAuthError(err)) {
      return res.status(401).json({ message: "Google authorization expired. Please reconnect your account.", needsReconnect: true });
    }
    res.status(500).json({ message: "Failed to fetch calendars" });
  }
});

// ─── Single calendar sync (for progress tracking) ─────────────────────────────
router.post("/sync-one", authenticate, async (req: AuthRequest, res) => {
  const userId = req.user?._id;
  const { calendarId, calendarName, calendarColor } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user?.googleRefreshToken) {
      return res.status(400).json({ message: 'Google account not connected.' });
    }

    const oAuth2Client = getOAuthClient();
    oAuth2Client.setCredentials({ refresh_token: user.googleRefreshToken });
    const calendarApi = google.calendar({ version: 'v3', auth: oAuth2Client });

    const eventCount = await syncGoogleCalendarIntoLocal(
      userId,
      calendarApi,
      calendarId,
      calendarName,
      calendarColor,
    );

    res.json({ message: 'OK', eventCount });
  } catch (err) {
    console.error('sync-one error:', err);
    if (isGoogleAuthError(err)) {
      return res.status(401).json({ message: 'Google authorization expired. Please reconnect your account.', needsReconnect: true });
    }
    res.status(500).json({ message: 'Failed to sync calendar' });
  }
});

router.post("/sync", authenticate, async (req: AuthRequest, res) => {
  const userId = req.user?._id;
  const { calendarIds } = req.body;
  try {
    const user = await User.findById(userId);
    if (!user?.googleRefreshToken) {
      return res.status(400).json({
        message: "Google account not connected. Please authorize first.",
      });
    }

    const oAuth2Client = getOAuthClient();
    oAuth2Client.setCredentials({ refresh_token: user.googleRefreshToken });

    const calendarApi = google.calendar({ version: "v3", auth: oAuth2Client });

    // Only fetch selected calendars
    const calendarList = await calendarApi.calendarList.list();
    const allCalendars = calendarList.data.items || [];
    const googleCalendars = calendarIds?.length
      ? allCalendars.filter(c => calendarIds.includes(c.id))
      : allCalendars;

    let eventCount = 0;
    for (const gCal of googleCalendars) {
      eventCount += await syncGoogleCalendarIntoLocal(
        userId,
        calendarApi,
        gCal.id!,
        gCal.summary || 'Calendar',
        gCal.backgroundColor || undefined,
      );
    }

    res.json({ message: "Import successful", eventCount });
  } catch (err) {
    console.error("Google Calendar sync error:", err);
    if (isGoogleAuthError(err)) {
      return res.status(401).json({ message: "Google authorization expired. Please reconnect your account.", needsReconnect: true });
    }
    res.status(500).json({ message: "Import failed" });
  }
});

export default router;
