const config = require("./env");
const express = require("express");
const { google } = require("googleapis");

const app = express();
const port = 3000;
interface CalendarListEntry {
  kind: string;
  etag: string;
  id: string;
  summary: string;
  timeZone: string;
  colorId: string;
  backgroundColor: string;
  foregroundColor: string;
  selected: boolean;
  accessRole: string;
  defaultReminders: { method: string; minutes: number }[];
  notificationSettings: {
    notifications: { type: string; method: string }[];
  };
}

interface Event {
  kind: string;
  etag: string;
  id: string;
  status: string;
  htmlLink: string;
  created: string;
  updated: string;
  summary: string;
  creator: {
    email: string;
  };
  organizer: {
    email: string;
  };
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  recurringEventId: string;
  originalStartTime: {
    dateTime: string;
    timeZone: string;
  };
  iCalUID: string;
  sequence: number;
  attendees: {
    email: string;
    displayName?: string;
    organizer?: boolean;
    self?: boolean;
    responseStatus: string;
  }[];
  hangoutLink: string;
  conferenceData: any; // You can define a proper interface for conferenceData if needed
  reminders: {
    useDefault: boolean;
  };
  eventType: string;
}

interface getCalendarEventsProps {
  startDate?: Date;
  endDate?: Date;
  calendarId: string;
  nextPageToken?: string;
  orderBy: string;
  singleEvents: boolean;
  eventsList: Event[];
}
class Auth {
  // Google OAuth2 configuration
  oauth2Client: any;
  token: string;
  refreshToken: string;

  constructor({
    clientID,
    clientSecret,
    callbackUri,
  }: {
    clientID: string;
    clientSecret: string;
    callbackUri: string;
  }) {
    this.oauth2Client = new google.auth.OAuth2(
      clientID,
      clientSecret,
      callbackUri
    );
  }

  async generateUrl({
    accessType,
    scope,
  }: {
    accessType?: string;
    scope: string[];
  }): Promise<string> {
    return this.oauth2Client.generateAuthUrl({
      access_type: accessType || "offline",
      scope: scope,
    });
  }

  async authenticate({ code }: { code?: string }): Promise<any> {
    if (code) {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);
      //   console.log("expiry date", tokens.expiry_date);

      // Store the refresh token for later use
      this.refreshToken = tokens.refresh_token;
    }

    return this.oauth2Client;
  }
}

class Calendar {
  auth: Auth;
  constructor({ auth }: { auth: Auth }) {
    this.auth = auth;
  }

  async getAuthClient() {
    return await this.auth.authenticate({});
  }

  async getAllCalendars({
    calendarList,
    pageToken,
  }: {
    pageToken?: string;
    calendarList: CalendarListEntry[];
  }): Promise<CalendarListEntry[]> {
    const calendar = google.calendar({
      version: "v3",
      auth: await this.getAuthClient(),
    });

    const calendars = await calendar.calendarList.list({
      maxResults: 250,
      pageToken: pageToken ? pageToken : "",
    });

    const calendarArr = calendars.data.items as CalendarListEntry[];
    calendarList.push(...calendarArr);

    if (calendars.data.nextPageToken) {
      return this.getAllCalendars({
        calendarList,
        pageToken: calendars.data.nextPageToken as string,
      });
    }

    return calendarList;
  }

  getEventsForCalendar = async ({
    startDate,
    endDate,
    calendarId,
    nextPageToken,
    orderBy,
    singleEvents,
    eventsList,
  }: getCalendarEventsProps): Promise<Event[]> => {
    const calendar = google.calendar({
      version: "v3",
      auth: await this.getAuthClient(),
    });

    const events = await calendar.events.list({
      calendarId: calendarId,
      timeMin: startDate?.toISOString() || "",
      timeMax: endDate?.toISOString() || "",
      maxResults: 2500,
      singleEvents: singleEvents,
      orderBy: orderBy,
      pageToken: nextPageToken || "",
    });

    const items = events.data.items as Event[];
    eventsList.push(...items);

    if (events.data.nextPageToken) {
      return this.getEventsForCalendar({
        startDate,
        endDate,
        calendarId,
        nextPageToken: events.data.nextPageToken as string,
        orderBy,
        singleEvents,
        eventsList,
      });
    }

    return eventsList;
  };

  async getAttendees({
    events,
    exclude,
  }: {
    events: Event[];
    exclude?: string[];
  }): Promise<{ displayName?: string; email: string }[]> {
    type RecordType = {
      recordSet: Record<string, boolean>;
      arr: { displayName?: string; email: string }[];
    };

    let base = { recordSet: {}, arr: [] } as RecordType;
    if (exclude) {
      for (const e of exclude) {
        base.recordSet[e] = true;
      }
    }

    let record = events.reduce((prev: RecordType, curr: Event): RecordType => {
      if (curr.attendees) {
        for (const e of curr.attendees) {
          if (!prev.recordSet[e.email]) {
            prev.arr.push({ displayName: e.displayName, email: e.email });
            prev.recordSet[e.email] = true;
          }
        }
      }

      return prev;
    }, base);

    return record.arr;
  }
}

const auth = new Auth({
  clientID: config.web.client_id,
  clientSecret: config.web.client_secret,
  callbackUri: config.web.callback_uri,
});

// Routes
app.get("/", async (req, res) => {
  const authUrl = await auth.generateUrl({
    accessType: "offline",
    scope: ["https://www.googleapis.com/auth/calendar.readonly"],
  });

  res.send(
    `Authorize this app by visiting this URL: <a target="_blank" href="${authUrl}">${authUrl}</a>`
  );
});

app.get("/auth/google/callback", async (req, res) => {
  const code = req.query.code as string;
  await auth.authenticate({ code });
  const calendar = new Calendar({ auth });

  var currentDate = new Date();
  // Add 30 days to the current date
  var maxDate = new Date(currentDate);
  maxDate.setDate(maxDate.getDate() + 30);

  const calendars = await calendar.getAllCalendars({ calendarList: [] });
  let allEvents: Event[] = [];
  for (const item of calendars) {
    const calendarEvents = await calendar.getEventsForCalendar({
      startDate: currentDate,
      endDate: maxDate,
      calendarId: item.id,
      orderBy: "startTime",
      singleEvents: true,
      eventsList: [],
    });
    allEvents.push(...calendarEvents);
  }

  const attendees = await calendar.getAttendees({ events: allEvents });
  res.json({ events: allEvents, attendees });
});

app.listen(port, () => {
  console.log(`Server is running on port localhost:${port}`);
});
