import express from "express";
import { google } from "googleapis";
import User from '../users/user.model';
import Calendar from './calendar.model';
import CalendarEvent from './calendarEvent.model';
import { authenticate, AuthRequest } from '../../shared/middlewares/auth.middleware'; // your existing auth middleware

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
router.get("/callback", async (req, res) => {
  res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
  const { code, state: userId } = req.query;

  try {
    const oAuth2Client = getOAuthClient();
    const { tokens } = await oAuth2Client.getToken(code as string);

    // Save refresh token to the user
    await User.findByIdAndUpdate(userId, {
      googleRefreshToken: tokens.refresh_token,
    });

    // Close the popup — frontend is polling for this
    res.send(`<!DOCTYPE html>
<html>
<body>
<p>Authorization complete. Returning to FlowDesk...</p>
<script>
  window.location.href = 'flowdesk://google-auth-success';
</script>
</body>
</html>`);
  } catch (err) {
    res.send(`<!DOCTYPE html>
<html>
<body>
<p>Authorization complete. Returning to FlowDesk...</p>
<script>
  window.location.href = 'flowdesk://google-auth-success';
</script>
</body>
</html>`);
    console.log(err);
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
