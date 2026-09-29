import express from "express";
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

// ─── 1. Return the Google OAuth URL ───────────────────────────────────────────
router.get("/auth-url", authenticate, (req: AuthRequest, res) => {
  const oAuth2Client = getOAuthClient();
  //   console.log(">>> REDIRECT URI:", process.env.GOOGLE_REDIRECT_URI);
  const url = oAuth2Client.generateAuthUrl({
    access_type: "offline", // gives us a refresh token
    prompt: "consent", // forces refresh token every time
    scope: SCOPES,
    state: req.user?._id.toString(), // pass userId through OAuth so callback knows who this is
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
  const { code, state: userId } = req.query;

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

    let calendar = await Calendar.findOne({ owner: userId, googleCalendarId: calendarId });
    if (!calendar) {
      calendar = await Calendar.create({
        name: calendarName,
        color: calendarColor || '#4285F4',
        owner: userId,
        googleCalendarId: calendarId,
      });
    }

    const eventsRes = await calendarApi.events.list({
      calendarId,
      timeMin: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
      timeMax: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      singleEvents: true,
      maxResults: 2500,
    });

    const googleEvents = eventsRes.data.items || [];
    for (const gEvent of googleEvents) {
      if (!gEvent.start) continue;
      await CalendarEvent.findOneAndUpdate(
        { googleEventId: gEvent.id },
        {
          title: gEvent.summary || '(No title)',
          description: gEvent.description || '',
          startDate: new Date(gEvent.start.dateTime || gEvent.start.date!),
          endDate: new Date(gEvent.end?.dateTime || gEvent.end?.date || gEvent.start.dateTime || gEvent.start.date!),
          allDay: !gEvent.start.dateTime,
          calendar: calendar._id,
          createdBy: userId,
          googleEventId: gEvent.id,
        },
        { upsert: true, new: true }
      );
    }

    res.json({ message: 'OK', eventCount: googleEvents.length });
  } catch (err) {
    console.error('sync-one error:', err);
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

    for (const gCal of googleCalendars) {
      // Upsert calendar — don't create duplicates on re-sync
      let calendar = await Calendar.findOne({
        owner: userId,
        googleCalendarId: gCal.id,
      });

      if (!calendar) {
        calendar = await Calendar.create({
          name: gCal.summary,
          color: gCal.backgroundColor || "#4285F4",
          owner: userId,
          googleCalendarId: gCal.id,
        });
      }

      // Fetch events from this Google calendar (last 6 months → next 1 year)
      const eventsRes = await calendarApi.events.list({
        calendarId: gCal.id!,
        timeMin: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
        timeMax: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        singleEvents: true,
        maxResults: 2500,
      });

      const googleEvents = eventsRes.data.items || [];

      for (const gEvent of googleEvents) {
        if (!gEvent.start) continue;

        // Upsert events — safe to call sync multiple times
        await CalendarEvent.findOneAndUpdate(
          { googleEventId: gEvent.id },
          {
            title: gEvent.summary || "(No title)",
            description: gEvent.description || "",
            startDate: new Date(gEvent.start.dateTime || gEvent.start.date!),
            endDate: new Date(
              gEvent.end?.dateTime ||
                gEvent.end?.date ||
                gEvent.start.dateTime ||
                gEvent.start.date!,
            ),
            allDay: !gEvent.start.dateTime,
            calendar: calendar._id,
            createdBy: userId,
            googleEventId: gEvent.id,
          },
          { upsert: true, new: true },
        );
      }
    }

    res.json({ message: "Import successful" });
  } catch (err) {
    console.error("Google Calendar sync error:", err);
    res.status(500).json({ message: "Import failed" });
  }
});

export default router;
