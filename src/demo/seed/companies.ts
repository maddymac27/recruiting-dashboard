// ---------------------------------------------------------------------------
// Invented-company demo fixtures (DEMO-01, D-12).
//
// Every company name below is MADE UP — none of these are real companies.
// This is a deliberate, load-bearing property (D-12): the demo dataset must
// never imply the user actually applied somewhere real, so it can be shown
// on a screen-share or committed to a public portfolio repo without leaking
// (or appearing to leak) any real job-search data.
//
// Each fixture's `events` array is an ordered walk of stage labels + dates
// that `seedDemo` (./seed.ts) replays through `appendStatusEvent` — the same
// write path real ingestion uses — so `currentStageId`/`currentStageSince`
// end up correctly derived by `recomputeCurrentStage`, never hand-set. The
// LAST event in the array is the fixture's resulting current stage.
// ---------------------------------------------------------------------------

export interface DemoConversationFixture {
  occurredAt: Date;
  channel?: string;
  notes?: string;
}

/**
 * Invented cold-outreach fixture (OUT-01, D-01) — replayed through
 * `createOutreach` (never a raw INSERT) so demo mode shows outreach data on
 * the same write path production code uses. Nested under `DemoContactFixture`
 * (mirroring how `conversations` nests under `contacts`) since every
 * outreach row needs both a `contactId` and the enclosing company's
 * `companyId`, both of which are only known at replay time in seed.ts.
 * `channel` must be one of `OUTREACH_CHANNELS` ("LinkedIn" | "Email");
 * `purpose` matches one of the log-form's `PURPOSE_OPTIONS` or is free text.
 * Every recipient/subject/body/outcome below is invented — never real (D-12).
 */
export interface DemoOutreachFixture {
  channel: string;
  purpose: string;
  subject?: string;
  body: string;
  sentDate: Date;
  responded?: boolean;
  outcome?: string;
}

export interface DemoContactFixture {
  name: string;
  roleTitle?: string;
  channel?: string;
  email?: string;
  relationshipType?: string;
  source?: string;
  conversations?: DemoConversationFixture[];
  outreach?: DemoOutreachFixture[];
}

export interface DemoStatusEventFixture {
  /** Stage label — must match a row seeded by seedLookups (D-05). */
  stage: string;
  occurredAt: Date;
}

export interface DemoCompanyFixture {
  /** Invented company name — never a real company (D-12). */
  companyName: string;
  roleTitle: string;
  /** Role-type label — must match a row seeded by seedLookups (D-07). */
  roleType: string;
  /** Source label — must match a row seeded by seedLookups (D-06). */
  source: string;
  /** null = saved, not applied yet. */
  dateApplied: Date | null;
  /** Ordered walk of stage transitions; last entry = resulting current stage. */
  events: DemoStatusEventFixture[];
  contacts?: DemoContactFixture[];
}

const d = (iso: string) => new Date(iso);

export const DEMO_COMPANIES: DemoCompanyFixture[] = [
  // --- Offer (1) ---
  {
    companyName: "Brightloom Analytics",
    roleTitle: "Senior Product Manager",
    roleType: "Product Management",
    source: "Referral",
    dateApplied: d("2026-02-03"),
    events: [
      { stage: "Applied", occurredAt: d("2026-02-03") },
      { stage: "Screen", occurredAt: d("2026-02-12") },
      { stage: "Interview", occurredAt: d("2026-03-05") },
      { stage: "Offer", occurredAt: d("2026-04-02") },
    ],
    contacts: [
      {
        name: "Priya Nandakumar",
        roleTitle: "Recruiter",
        channel: "email",
        email: "priya.nandakumar@brightloomanalytics.example",
        relationshipType: "recruiter",
        source: "referral",
        conversations: [
          { occurredAt: d("2026-02-10"), channel: "call", notes: "Intro screen scheduling call." },
          { occurredAt: d("2026-04-02"), channel: "email", notes: "Verbal offer extended, details to follow." },
        ],
        outreach: [
          {
            channel: "Email",
            purpose: "Recruiter outreach",
            subject: "Following up on the Senior PM opening",
            body: "Hi Priya, I saw the Senior Product Manager posting and wanted to reach out directly — the growth-analytics focus lines up closely with my background. Happy to share more context whenever is convenient.",
            sentDate: d("2026-02-05"),
            responded: true,
            outcome: "Replied — scheduled an intro screen for the following week.",
          },
        ],
      },
      {
        name: "Marcus Ihejirika",
        roleTitle: "Director of Product",
        channel: "call",
        relationshipType: "hiring manager",
        conversations: [
          { occurredAt: d("2026-03-05"), channel: "call", notes: "Final-round hiring manager conversation." },
        ],
        outreach: [
          {
            channel: "LinkedIn",
            purpose: "Coffee chat",
            body: "Hi Marcus, congrats on the team's recent launch — would love 20 minutes to hear how the product org is structured ahead of my final round.",
            sentDate: d("2026-03-01"),
            responded: true,
            outcome: "Replied — agreed to a 20-minute call before the final round.",
          },
        ],
      },
    ],
  },

  // --- Interview (2) ---
  {
    companyName: "Northwind Ventures",
    roleTitle: "Strategy Associate",
    roleType: "Strategy",
    source: "LinkedIn",
    dateApplied: d("2026-03-10"),
    events: [
      { stage: "Applied", occurredAt: d("2026-03-10") },
      { stage: "Screen", occurredAt: d("2026-03-20") },
      { stage: "Interview", occurredAt: d("2026-04-15") },
    ],
    contacts: [
      {
        name: "Dana Weisz",
        roleTitle: "Talent Partner",
        channel: "LinkedIn",
        relationshipType: "recruiter",
        conversations: [
          { occurredAt: d("2026-03-18"), channel: "LinkedIn", notes: "Confirmed screen timing over LinkedIn DM." },
        ],
        outreach: [
          {
            channel: "LinkedIn",
            purpose: "Referral ask",
            body: "Hi Dana, I noticed we're both connected to a couple of folks on the Strategy team — would you be open to a quick referral for the Strategy Associate role?",
            sentDate: d("2026-03-15"),
            responded: false,
          },
        ],
      },
    ],
  },
  {
    companyName: "Cascade Sundry Co",
    roleTitle: "Product Manager, Growth",
    roleType: "Product Management",
    source: "Company site / ATS",
    dateApplied: d("2026-04-01"),
    events: [
      { stage: "Applied", occurredAt: d("2026-04-01") },
      { stage: "Screen", occurredAt: d("2026-04-14") },
      { stage: "Interview", occurredAt: d("2026-05-06") },
    ],
    contacts: [
      {
        name: "Talia Bloomquist",
        roleTitle: "Growth PM",
        channel: "LinkedIn",
        relationshipType: "peer",
        outreach: [
          {
            channel: "LinkedIn",
            purpose: "Coffee chat",
            body: "Hi Talia, I'm applying to the Growth PM role and would love to hear about your day-to-day if you have 15 minutes sometime this month.",
            sentDate: d("2026-04-05"),
            responded: false,
          },
        ],
      },
    ],
  },

  // --- Screen (2) ---
  {
    companyName: "Ember & Vale Group",
    roleTitle: "Chief of Staff",
    roleType: "Chief of Staff",
    source: "Handshake",
    dateApplied: d("2026-05-02"),
    events: [
      { stage: "Applied", occurredAt: d("2026-05-02") },
      { stage: "Screen", occurredAt: d("2026-05-19") },
    ],
    contacts: [
      {
        name: "Odalys Reyes",
        roleTitle: "Recruiting Coordinator",
        channel: "email",
        email: "odalys.reyes@embervalegroup.example",
        relationshipType: "recruiter",
        conversations: [
          { occurredAt: d("2026-05-16"), channel: "email", notes: "Sent screen availability." },
        ],
        outreach: [
          {
            channel: "Email",
            purpose: "Recruiter outreach",
            subject: "Checking in on Chief of Staff application",
            body: "Hi Odalys, I wanted to follow up on my Chief of Staff application and confirm it's landed with the right team — happy to send anything else that's useful.",
            sentDate: d("2026-05-14"),
            responded: true,
            outcome: "Replied — confirmed screen timing for the following week.",
          },
        ],
      },
    ],
  },
  {
    companyName: "Stonebridge Robotics",
    roleTitle: "Strategy & Operations Lead",
    roleType: "Strategy",
    source: "Referral",
    dateApplied: d("2026-05-20"),
    events: [
      { stage: "Applied", occurredAt: d("2026-05-20") },
      { stage: "Screen", occurredAt: d("2026-06-04") },
    ],
    contacts: [
      {
        name: "Wren Castellano",
        roleTitle: "Talent Acquisition",
        channel: "email",
        email: "wren.castellano@stonebridgerobotics.example",
        relationshipType: "recruiter",
        outreach: [
          {
            channel: "Email",
            purpose: "Referral ask",
            subject: "Referral for the Strategy & Operations Lead role",
            body: "Hi Wren, a former colleague mentioned you lead recruiting for the Strategy team — would you be open to a quick referral for the Strategy & Operations Lead opening?",
            sentDate: d("2026-05-25"),
            responded: false,
          },
        ],
      },
    ],
  },

  // --- Applied (2) ---
  {
    companyName: "Solstice Robotics",
    roleTitle: "Associate Product Manager",
    roleType: "Product Management",
    source: "Job board / Other",
    dateApplied: d("2026-06-10"),
    events: [{ stage: "Applied", occurredAt: d("2026-06-10") }],
  },
  {
    companyName: "Driftwood Analytics",
    roleTitle: "Product Manager",
    roleType: "Product Management",
    source: "Job board / Other",
    dateApplied: d("2026-06-22"),
    events: [{ stage: "Applied", occurredAt: d("2026-06-22") }],
  },

  // --- Rejected (3) ---
  {
    companyName: "Palisade Data Systems",
    roleTitle: "Strategy Manager",
    roleType: "Strategy",
    source: "Referral",
    dateApplied: d("2026-01-15"),
    events: [
      { stage: "Applied", occurredAt: d("2026-01-15") },
      { stage: "Screen", occurredAt: d("2026-01-28") },
      { stage: "Rejected", occurredAt: d("2026-02-10") },
    ],
    contacts: [
      {
        name: "Jordan Achterberg",
        roleTitle: "Recruiter",
        channel: "email",
        email: "jordan.achterberg@palisadedatasystems.example",
        relationshipType: "recruiter",
        outreach: [
          {
            channel: "Email",
            purpose: "Other",
            subject: "Application status check-in",
            body: "Hi Jordan, following up to see if there's any update on the Strategy Manager application I submitted a couple weeks ago.",
            sentDate: d("2026-01-25"),
            responded: false,
          },
        ],
      },
    ],
  },
  {
    companyName: "Thistlewood Partners",
    roleTitle: "Product Manager",
    roleType: "Product Management",
    source: "LinkedIn",
    dateApplied: d("2026-02-01"),
    events: [
      { stage: "Applied", occurredAt: d("2026-02-01") },
      { stage: "Interview", occurredAt: d("2026-02-25") },
      { stage: "Rejected", occurredAt: d("2026-03-12") },
    ],
  },
  {
    companyName: "Wraithport Tech",
    roleTitle: "Chief of Staff to the CEO",
    roleType: "Chief of Staff",
    source: "LinkedIn",
    dateApplied: d("2026-02-18"),
    events: [
      { stage: "Applied", occurredAt: d("2026-02-18") },
      { stage: "Screen", occurredAt: d("2026-03-01") },
      { stage: "Interview", occurredAt: d("2026-03-22") },
      { stage: "Rejected", occurredAt: d("2026-04-08") },
    ],
  },

  // --- Ghosted (3) ---
  {
    companyName: "Ironvale Logistics",
    roleTitle: "Product Operations Manager",
    roleType: "Other",
    source: "Company site / ATS",
    dateApplied: d("2026-03-01"),
    events: [
      { stage: "Applied", occurredAt: d("2026-03-01") },
      { stage: "Screen", occurredAt: d("2026-03-15") },
      { stage: "Ghosted", occurredAt: d("2026-05-01") },
    ],
    contacts: [
      {
        name: "Sam Okafor",
        roleTitle: "Recruiter",
        channel: "email",
        email: "sam.okafor@ironvalelogistics.example",
        relationshipType: "recruiter",
        conversations: [
          { occurredAt: d("2026-03-15"), channel: "call", notes: "Screen call — said next steps within a week." },
        ],
        outreach: [
          {
            channel: "Email",
            purpose: "Follow-up",
            subject: "Following up after our screen call",
            body: "Hi Sam, wanted to follow up after our call last week — happy to provide anything else that would help move the Product Operations Manager process forward.",
            sentDate: d("2026-03-20"),
            responded: false,
          },
        ],
      },
    ],
  },
  {
    companyName: "Marrowfield Health",
    roleTitle: "Product Manager",
    roleType: "Product Management",
    source: "Handshake",
    dateApplied: d("2026-04-05"),
    events: [
      { stage: "Applied", occurredAt: d("2026-04-05") },
      { stage: "Ghosted", occurredAt: d("2026-06-01") },
    ],
  },
  {
    companyName: "Cobalt Harbor Inc",
    roleTitle: "Strategy Associate",
    roleType: "Strategy",
    source: "Job board / Other",
    dateApplied: d("2026-01-20"),
    events: [
      { stage: "Applied", occurredAt: d("2026-01-20") },
      { stage: "Screen", occurredAt: d("2026-02-05") },
      { stage: "Interview", occurredAt: d("2026-02-24") },
      { stage: "Ghosted", occurredAt: d("2026-04-20") },
    ],
  },

  // --- Withdrawn (1) ---
  {
    companyName: "Quietbrook Systems",
    roleTitle: "Chief of Staff",
    roleType: "Chief of Staff",
    source: "Referral",
    dateApplied: d("2026-03-25"),
    events: [
      { stage: "Applied", occurredAt: d("2026-03-25") },
      { stage: "Screen", occurredAt: d("2026-04-08") },
      { stage: "Withdrawn", occurredAt: d("2026-04-20") },
    ],
    contacts: [
      {
        name: "Leah Van Doren",
        roleTitle: "Recruiter",
        channel: "email",
        relationshipType: "recruiter",
        conversations: [
          { occurredAt: d("2026-04-20"), channel: "email", notes: "Withdrew after accepting an earlier offer elsewhere." },
        ],
        outreach: [
          {
            channel: "LinkedIn",
            purpose: "Intro request",
            body: "Hi Leah, would you be able to introduce me to whoever is hiring for the Chief of Staff role? Happy to share my background first.",
            sentDate: d("2026-03-28"),
            responded: true,
            outcome: "Replied — introduced me to the hiring manager directly.",
          },
        ],
      },
    ],
  },

  // --- Saved, not applied yet (3) ---
  {
    companyName: "Fernglass Media",
    roleTitle: "Product Manager",
    roleType: "Product Management",
    source: "LinkedIn",
    dateApplied: null,
    events: [{ stage: "Saved", occurredAt: d("2026-06-28") }],
  },
  {
    companyName: "Lumen Ridge Co",
    roleTitle: "Strategy & Planning Analyst",
    roleType: "Strategy",
    source: "Company site / ATS",
    dateApplied: null,
    events: [{ stage: "Saved", occurredAt: d("2026-07-02") }],
  },
  {
    companyName: "Amberfield Group",
    roleTitle: "Operations Associate",
    roleType: "Other",
    source: "Handshake",
    dateApplied: null,
    events: [{ stage: "Saved", occurredAt: d("2026-07-10") }],
  },
];
