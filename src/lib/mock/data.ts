export const DATA = {
  photographer: { name: "Morgan Reyes", studio: "Reyes Portrait Co.", initials: "MR", tz: "CT" },

  today: "Wednesday, October 21",
  sunset: "6:42pm",

  kpis: {
    activeClients: 42,
    shootsThisWeek: 5,
    outstanding: 3280,
    sessionsBooked30d: 18,
  },

  missionControl: {
    actionRequired: [
      { id: "b-301", client: "Emma Hartwell", parent: "Susan Hartwell", sessionType: "Senior", sessionTypeColor: "#C2704A", date: "Oct 28 · 5:30p", stage: "Final Payment", stageIdx: 3, issue: "Final payment $425 overdue 2d", severity: "danger" as const, dueInDays: -2 },
      { id: "b-311", client: "The Okafor Family", parent: null, sessionType: "Family", sessionTypeColor: "#7A8F5A", date: "Nov 03 · 4:00p", stage: "Location Chosen", stageIdx: 2, issue: "No location picked · 9 days out", severity: "warn" as const, dueInDays: 9 },
      { id: "b-315", client: "Lila Chen", parent: "Wei Chen", sessionType: "Senior", sessionTypeColor: "#C2704A", date: "Oct 24 · 6:00p", stage: "Style Guide Received", stageIdx: 1, issue: "Style guide unopened · 3 days out", severity: "warn" as const, dueInDays: 3 },
      { id: "b-298", client: "Mia Delgado", parent: "Rosa Delgado", sessionType: "Senior", sessionTypeColor: "#C2704A", date: "Oct 22 · 6:15p", stage: "Final Payment", stageIdx: 3, issue: "Final payment $350 due tomorrow", severity: "warn" as const, dueInDays: 1 },
    ],
    onTrack: [
      { id: "b-320", client: "Jordan Pak", sessionType: "Senior", sessionTypeColor: "#C2704A", date: "Oct 30", stage: "Final Payment", stageIdx: 3 },
      { id: "b-321", client: "The Weston Family", sessionType: "Family", sessionTypeColor: "#7A8F5A", date: "Nov 05", stage: "Location Chosen", stageIdx: 2 },
      { id: "b-322", client: "Sienna Park", sessionType: "Senior", sessionTypeColor: "#C2704A", date: "Nov 07", stage: "Style Guide Received", stageIdx: 1 },
      { id: "b-323", client: "Ava Montoya", sessionType: "Senior", sessionTypeColor: "#C2704A", date: "Nov 10", stage: "Deposit Paid", stageIdx: 0 },
    ],
    recentlyCompleted: [
      { id: "b-284", client: "Harper Lin", sessionType: "Senior", date: "Oct 14", note: "Gallery delivered" },
      { id: "b-281", client: "The Nakamura Family", sessionType: "Family", date: "Oct 11", note: "Final paid in full" },
      { id: "b-276", client: "Zoe Breckenridge", sessionType: "Senior", date: "Oct 08", note: "Gallery delivered" },
    ],
  },

  todayShoots: [
    {
      id: "b-298", client: "Mia Delgado", parent: "Rosa Delgado", phone: "(512) 555-0142",
      parentPhone: "(512) 555-0318", parentEmail: "rosa.delgado@gmail.com",
      package: "Package 2 — 2 locations · 60 min · 25 edits",
      locations: ["Cypress Bend Trail", "Downtown Brick Row"],
      meetAt: "6:15pm · Cypress Bend Trail lot",
      paid: false, paidAmount: 250, total: 600,
      styleGuide: "opened", outfits: "Cream + olive, 2 changes",
      notes: "Mom texted — arriving separately. Bringing prop (senior yearbook).",
    },
    {
      id: "b-304", client: "The Alvarez Family", parent: null, phone: "(512) 555-0178",
      parentPhone: null, parentEmail: null,
      package: "Package 3 — Family · 90 min · 40 edits",
      locations: ["Lady Bird Loop"],
      meetAt: "5:00pm · Lady Bird Loop, east entrance",
      paid: true, paidAmount: 850, total: 850,
      styleGuide: "opened", outfits: null,
      notes: "Two kids (3, 7). Golden retriever coming.",
    },
  ],

  inquiries: [
    { id: "i-88", name: "Harper Owens", email: "harper.o@gmail.com", sessionType: "Senior", age: "Class of 2026", source: "Instagram", received: "22m ago", unread: true,
      preview: "Hi Morgan! I saw your fall mini session info on IG and I'm obsessed. Do you have any openings for seniors in November? I can be flexible on dates…" },
    { id: "i-87", name: "Rachel + James Becker", email: "rachel.becker@gmail.com", sessionType: "Family", age: null, source: "Referral — Lin family", received: "2h ago", unread: true,
      preview: "Hi! We were referred by the Lin family. Looking to book a family session for our extended family (~12 people) around Thanksgiving if possible." },
    { id: "i-86", name: "Dana Whitaker", email: "d.whitaker@hey.com", sessionType: "Senior", age: null, source: "Google", received: "Yesterday", unread: false,
      preview: "Hello — my daughter Nora is a senior this year. Do you have a waitlist? We are specifically hoping for a downtown location set." },
    { id: "i-85", name: "Sam Rourke", email: "s.rourke@outlook.com", sessionType: "Headshot", age: null, source: "Website", received: "Yesterday", unread: false,
      preview: "Looking for executive headshots for a LinkedIn refresh. Do you offer studio-only packages?" },
    { id: "i-84", name: "The Petrov Family", email: "petrovs@gmail.com", sessionType: "Family", age: null, source: "Instagram", received: "2d ago", unread: false,
      preview: "We did a session with you in 2023 and want to book our annual family shoot. Any November openings?" },
  ],

  clientsList: [
    { id: "b-298", client: "Mia Delgado", parent: "Rosa Delgado", type: "Senior", color: "#C2704A", date: "Oct 22", payment: "warn" as const, payLabel: "Balance due", stage: 3, location: true },
    { id: "b-301", client: "Emma Hartwell", parent: "Susan Hartwell", type: "Senior", color: "#C2704A", date: "Oct 28", payment: "danger" as const, payLabel: "Overdue 2d", stage: 3, location: true },
    { id: "b-315", client: "Lila Chen", parent: "Wei Chen", type: "Senior", color: "#C2704A", date: "Oct 24", payment: "success" as const, payLabel: "Paid", stage: 1, location: true },
    { id: "b-311", client: "The Okafor Family", parent: null, type: "Family", color: "#7A8F5A", date: "Nov 03", payment: "success" as const, payLabel: "Paid", stage: 2, location: false },
    { id: "b-304", client: "The Alvarez Family", parent: null, type: "Family", color: "#7A8F5A", date: "Oct 21", payment: "success" as const, payLabel: "Paid in full", stage: 3, location: true },
    { id: "b-320", client: "Jordan Pak", parent: null, type: "Senior", color: "#C2704A", date: "Oct 30", payment: "warn" as const, payLabel: "Balance due", stage: 3, location: true },
    { id: "b-321", client: "The Weston Family", parent: null, type: "Family", color: "#7A8F5A", date: "Nov 05", payment: "success" as const, payLabel: "Paid", stage: 2, location: true },
    { id: "b-322", client: "Sienna Park", parent: null, type: "Senior", color: "#C2704A", date: "Nov 07", payment: "success" as const, payLabel: "Paid", stage: 1, location: true },
    { id: "b-323", client: "Ava Montoya", parent: null, type: "Senior", color: "#C2704A", date: "Nov 10", payment: "success" as const, payLabel: "Deposit paid", stage: 0, location: false },
    { id: "b-324", client: "The Bao Family", parent: null, type: "Family", color: "#7A8F5A", date: "Nov 12", payment: "success" as const, payLabel: "Deposit paid", stage: 0, location: false },
    { id: "b-325", client: "Nora Whitaker", parent: "Dana Whitaker", type: "Senior", color: "#C2704A", date: "Nov 14", payment: "success" as const, payLabel: "Paid", stage: 1, location: true },
    { id: "b-326", client: "Maya Hollis", parent: null, type: "Senior", color: "#C2704A", date: "Nov 16", payment: "success" as const, payLabel: "Paid", stage: 1, location: true },
  ],

  stages: ["Deposit Paid", "Style Guide", "Location", "Final Payment", "Gallery"],

  profile: {
    id: "b-298",
    client: "Mia Delgado",
    clientEmail: "mia.delgado.06@gmail.com",
    clientPhone: "(512) 555-0142",
    parent: "Rosa Delgado",
    parentEmail: "rosa.delgado@gmail.com",
    parentPhone: "(512) 555-0318",
    sessionType: "Senior Portrait",
    typeColor: "#C2704A",
    package: "Package 2 — 2 locations",
    sessionDate: "Wed Oct 22, 2026 · 6:15pm",
    locations: ["Cypress Bend Trail", "Downtown Brick Row"],
    deposit: { amount: 250, paidAt: "Aug 14" },
    final: { amount: 350, dueAt: "Oct 22", status: "due-tomorrow" },
    stageIdx: 3,
    timeline: [
      { when: "Aug 14, 3:02p", label: "Booking received · deposit paid", kind: "success" as const },
      { when: "Aug 14, 3:02p", label: "Confirmation email sent", kind: "info" as const },
      { when: "Aug 14, 4:02p", label: "Style guide email sent", kind: "info" as const },
      { when: "Aug 21", label: "Location selection submitted", kind: "success" as const },
      { when: "Oct 07", label: "Style guide reminder sent", kind: "info" as const },
      { when: "Oct 15", label: "Style guide opened by parent", kind: "success" as const },
      { when: "Oct 20", label: "Final payment reminder sent to Rosa", kind: "warn" as const },
      { when: "Oct 21, 9:41a", label: "Final payment reminder #2 sent to Rosa", kind: "warn" as const },
    ],
    notes: "Mom handles payments. Emma texted — bringing senior yearbook as prop. Needs reminder about closed-toe shoes.",
  },

  journey: {
    stageStats: [
      { stage: "Booked", avgDays: 1.2 },
      { stage: "Deposit Paid", avgDays: 3.1 },
      { stage: "Style Guide", avgDays: 8.4 },
      { stage: "Location Chosen", avgDays: 4.2 },
      { stage: "Final Payment", avgDays: 2.6 },
      { stage: "Session Complete", avgDays: 9.1 },
      { stage: "Gallery Delivered", avgDays: 0 },
    ],
    stuckCount: 5,
    columns: [
      { key: "booked", label: "Booked", count: 2, cards: [
        { id: "b-326", client: "Maya Hollis", type: "Senior", color: "#C2704A", date: "Nov 16", days: 1, stuck: null },
        { id: "b-327", client: "The Liu Family", type: "Family", color: "#7A8F5A", date: "Nov 22", days: 0, stuck: null },
      ]},
      { key: "deposit", label: "Deposit Paid", count: 3, cards: [
        { id: "b-323", client: "Ava Montoya", type: "Senior", color: "#C2704A", date: "Nov 10", days: 2, stuck: null },
        { id: "b-324", client: "The Bao Family", type: "Family", color: "#7A8F5A", date: "Nov 12", days: 4, stuck: "warn" as const },
        { id: "b-328", client: "Kai Thompson", type: "Senior", color: "#C2704A", date: "Nov 18", days: 1, stuck: null },
      ]},
      { key: "style", label: "Style Guide", count: 4, cards: [
        { id: "b-315", client: "Lila Chen", type: "Senior", color: "#C2704A", date: "Oct 24", days: 3, stuck: "warn" as const },
        { id: "b-322", client: "Sienna Park", type: "Senior", color: "#C2704A", date: "Nov 07", days: 2, stuck: null },
        { id: "b-325", client: "Nora Whitaker", type: "Senior", color: "#C2704A", date: "Nov 14", days: 8, stuck: "danger" as const },
        { id: "b-329", client: "Ellie Ward", type: "Senior", color: "#C2704A", date: "Nov 20", days: 1, stuck: null },
      ]},
      { key: "location", label: "Location", count: 3, cards: [
        { id: "b-311", client: "The Okafor Family", type: "Family", color: "#7A8F5A", date: "Nov 03", days: 9, stuck: "danger" as const },
        { id: "b-321", client: "The Weston Family", type: "Family", color: "#7A8F5A", date: "Nov 05", days: 4, stuck: "warn" as const },
        { id: "b-330", client: "Iris Goodson", type: "Senior", color: "#C2704A", date: "Nov 08", days: 2, stuck: null },
      ]},
      { key: "final", label: "Final Payment", count: 3, cards: [
        { id: "b-298", client: "Mia Delgado", type: "Senior", color: "#C2704A", date: "Oct 22", days: 1, stuck: null },
        { id: "b-301", client: "Emma Hartwell", type: "Senior", color: "#C2704A", date: "Oct 28", days: 9, stuck: "danger" as const },
        { id: "b-320", client: "Jordan Pak", type: "Senior", color: "#C2704A", date: "Oct 30", days: 2, stuck: null },
      ]},
      { key: "complete", label: "Session Complete", count: 2, cards: [
        { id: "b-297", client: "The Alvarez Family", type: "Family", color: "#7A8F5A", date: "Oct 21", days: 0, stuck: null },
        { id: "b-296", client: "Bella Ng", type: "Senior", color: "#C2704A", date: "Oct 18", days: 3, stuck: "warn" as const },
      ]},
      { key: "delivered", label: "Gallery", count: 2, cards: [
        { id: "b-284", client: "Harper Lin", type: "Senior", color: "#C2704A", date: "Oct 14", days: 0, stuck: null },
        { id: "b-276", client: "Zoe Breckenridge", type: "Senior", color: "#C2704A", date: "Oct 08", days: 0, stuck: null },
      ]},
    ],
  },

  notes: [
    { id: "n-01", title: "Rosa wants downtown + trail", client: "Mia Delgado", due: "Oct 22", updated: "2h ago",
      body: "Mom called — would love for Mia's session to have both a city and trail backdrop. Two outfits, cream + olive. She's bringing the yearbook as a prop. Needs reminder about closed-toe shoes (trail is muddy Oct).", attach: "outfit-ref.jpg" },
    { id: "n-02", title: "Nakamura — send album preview", client: "The Nakamura Family", due: null, updated: "5h ago",
      body: "They asked about the heirloom album upsell after delivery. Pull 12 favorites, mock up a 10×10 linen, send preview w/ pricing.", attach: null },
    { id: "n-03", title: "Referral — Becker family", client: null, due: "Oct 25", updated: "Yesterday",
      body: "Rachel Becker DM'd via Instagram — extended family session (~12 people) for Thanksgiving. Need to confirm I can handle group size + pricing for 12-pax.", attach: null },
    { id: "n-04", title: "Senior pricing refresh for 2027", client: null, due: "Nov 10", updated: "2d ago",
      body: "Bump Package 2 by $75. Add print credit to Package 3. Redo pricing guide PDF. Email existing waitlist first.", attach: "2027-pricing-v2.pdf" },
    { id: "n-05", title: "Cypress Bend — downed tree", client: null, due: null, updated: "3d ago",
      body: "Main path near the bridge has a huge downed oak. Blocks the wide-open shot. Reroute to the north loop for now. Check again after next storm.", attach: "cypress-tree.jpg" },
    { id: "n-06", title: "Harper Lin gallery expires", client: "Harper Lin", due: "Nov 14", updated: "4d ago",
      body: "Gallery expires Nov 14. She hasn't downloaded hi-res yet. Send reminder a week out.", attach: null },
    { id: "n-07", title: "Tax set-aside Q4", client: null, due: "Dec 15", updated: "1w ago",
      body: "Move 25% of Oct+Nov+Dec revenue to tax savings before year-end. Pull QB report week of Dec 10.", attach: null },
  ],

  calendarWeek: {
    weekOf: "Oct 19 – 25",
    days: [
      { day: "Mon", date: "19", sunset: "6:46p", today: false, events: [] },
      { day: "Tue", date: "20", sunset: "6:45p", today: false, events: [
        { time: "10:00a", dur: 60, title: "Consult — Becker family", type: "consult", color: "#7A8F5A", location: null },
      ]},
      { day: "Wed", date: "21", sunset: "6:44p", today: true, events: [
        { time: "5:00p", dur: 90, title: "The Alvarez Family", type: "Family", color: "#7A8F5A", location: "Lady Bird Loop" },
        { time: "6:15p", dur: 60, title: "Mia Delgado", type: "Senior", color: "#C2704A", location: "Cypress Bend" },
      ]},
      { day: "Thu", date: "22", sunset: "6:42p", today: false, events: [
        { time: "5:30p", dur: 60, title: "Jordan Pak", type: "Senior", color: "#C2704A", location: "Downtown Brick" },
      ]},
      { day: "Fri", date: "23", sunset: "6:41p", today: false, events: [
        { time: "2:00p", dur: 30, title: "Edit block", type: "block", color: "#9BA0A6", location: null },
        { time: "5:30p", dur: 60, title: "Lila Chen", type: "Senior", color: "#C2704A", location: "Cypress Bend" },
      ]},
      { day: "Sat", date: "24", sunset: "6:40p", today: false, events: [
        { time: "9:00a", dur: 60, title: "The Weston Family", type: "Family", color: "#7A8F5A", location: "Lady Bird Loop" },
        { time: "4:30p", dur: 60, title: "Ava Montoya", type: "Senior", color: "#C2704A", location: "Studio" },
      ]},
      { day: "Sun", date: "25", sunset: "6:39p", today: false, events: [
        { time: "All day", dur: 0, title: "Unavailable — family", type: "off", color: "#D0C4B5", location: null },
      ]},
    ],
    stats: { hoursBooked: 6.5, goldenOpen: 2, unconfirmed: 1 },
    syncStatus: "Synced · Google Calendar · 3m ago",
  },

  locations: {
    active: [
      { id: "l-01", name: "Cypress Bend Trail", cat: "Nature & Rustic", usage: 24, note: "Golden-hour wide-open, woodsy. Best 45m before sunset.", status: "active" as const, miles: 8.2 },
      { id: "l-02", name: "Downtown Brick Row", cat: "Downtown", usage: 18, note: "Red brick + fire escape. Weekends crowded.", status: "active" as const, miles: 6.1 },
      { id: "l-03", name: "Lady Bird Loop", cat: "Nature & Rustic", usage: 22, note: "Families love it. Park behind rec center.", status: "active" as const, miles: 9.4 },
      { id: "l-04", name: "Studio — Reyes Co", cat: "Studio", usage: 14, note: "White cyc, north-facing window. Backup for rain.", status: "active" as const, miles: 0 },
      { id: "l-05", name: "Zilker Bridge", cat: "Downtown", usage: 9, note: "Iconic skyline backdrop. Golden-hour only.", status: "active" as const, miles: 7.3 },
      { id: "l-06", name: "Wildflower Meadow", cat: "Nature & Rustic", usage: 11, note: "Seasonal — Apr–Jun only. Bluebonnets peak mid-April.", status: "active" as const, miles: 14.8 },
      { id: "l-07", name: "The Barn at McKinney", cat: "Rustic", usage: 7, note: "Private, must book 2w ahead. $40 fee.", status: "active" as const, miles: 22.1 },
      { id: "l-08", name: "Rooftop — Westin", cat: "Downtown", usage: 5, note: "Engagement/branding only. Concierge fee $75.", status: "active" as const, miles: 6.8 },
    ],
    archived: [
      { id: "l-09", name: "Old Mill Park", cat: "Nature & Rustic", usage: 12, note: "Closed for renovation 2025-26.", status: "archived" as const, miles: 15.5 },
      { id: "l-10", name: "East Side Alley", cat: "Downtown", usage: 4, note: "Graffiti murals painted over. No longer shootable.", status: "archived" as const, miles: 5.2 },
    ],
  },

  payments: {
    stats: { outstanding: 3280, overdue: 850, paidMTD: 6720, paidLastMonth: 5890 },
    rows: [
      { id: "p-301", client: "Emma Hartwell", parent: "Susan Hartwell", session: "Senior · Oct 28", amount: 425, due: "Oct 19", reminders: 2, routing: "parent", status: "overdue" as const, overdueDays: 2 },
      { id: "p-298", client: "Mia Delgado", parent: "Rosa Delgado", session: "Senior · Oct 22", amount: 350, due: "Oct 22", reminders: 2, routing: "parent", status: "due_soon" as const, overdueDays: undefined },
      { id: "p-320", client: "Jordan Pak", parent: null, session: "Senior · Oct 30", amount: 425, due: "Oct 30", reminders: 1, routing: "client", status: "due_soon" as const, overdueDays: undefined },
      { id: "p-330", client: "Iris Goodson", parent: "Dana Goodson", session: "Senior · Nov 08", amount: 425, due: "Nov 08", reminders: 0, routing: "parent", status: "scheduled" as const, overdueDays: undefined },
      { id: "p-311", client: "The Okafor Family", parent: null, session: "Family · Nov 03", amount: 850, due: "Nov 03", reminders: 1, routing: "client", status: "overdue" as const, overdueDays: 1 },
      { id: "p-325", client: "Nora Whitaker", parent: "Dana Whitaker", session: "Senior · Nov 14", amount: 425, due: "Nov 14", reminders: 0, routing: "parent", status: "scheduled" as const, overdueDays: undefined },
      { id: "p-326", client: "Maya Hollis", parent: null, session: "Senior · Nov 16", amount: 425, due: "Nov 16", reminders: 0, routing: "client", status: "scheduled" as const, overdueDays: undefined },
      { id: "p-323", client: "Ava Montoya", parent: null, session: "Senior · Nov 10", amount: 425, due: "Nov 10", reminders: 0, routing: "client", status: "scheduled" as const, overdueDays: undefined },
    ],
    rules: [
      { id: "r1", label: "Reminder #1", when: "7 days before due", enabled: true, sends: 6 },
      { id: "r2", label: "Reminder #2", when: "3 days before due", enabled: true, sends: 4 },
      { id: "r3", label: "Final notice", when: "Day of due", enabled: true, sends: 2 },
      { id: "r4", label: "Overdue escalation", when: "2 days after due", enabled: true, sends: 1 },
    ],
  },

  finances: {
    annualGoal: 84000,
    ytd: 58120,
    monthActual: 9420,
    monthExpectedShare: 0.135,
    sameMonthLY: 7820,
    takeHome: 5840,
    setAside: 2150,
    netTaxes: { reserved: 12400, shouldBe: 14200, nextDue: "Jan 15", nextAmount: 3950 },
    health: [
      { label: "Avg senior booking", value: "$625", delta: "+4%" },
      { label: "Avg family booking", value: "$850", delta: "+2%" },
      { label: "Expense ratio", value: "18%", delta: "−2pt" },
      { label: "YoY revenue", value: "+12%", delta: "vs 2024" },
    ],
    seasonality: [
      { m: "Jan", expected: 0.03, actual: 2100 as number | null }, { m: "Feb", expected: 0.03, actual: 2400 },
      { m: "Mar", expected: 0.05, actual: 4100 }, { m: "Apr", expected: 0.07, actual: 5900 },
      { m: "May", expected: 0.09, actual: 7600 }, { m: "Jun", expected: 0.06, actual: 4800 },
      { m: "Jul", expected: 0.04, actual: 3400 }, { m: "Aug", expected: 0.12, actual: 9800 },
      { m: "Sep", expected: 0.18, actual: 14600 }, { m: "Oct", expected: 0.135, actual: 9420 },
      { m: "Nov", expected: 0.18, actual: null }, { m: "Dec", expected: 0.055, actual: null },
    ],
  },

  expenses: {
    stats: { ytd: 10840, mtd: 1240 },
    rows: [
      { id: "e-51", date: "Oct 21", cat: "Mileage", catColor: "#7A8F5A", desc: "Alvarez + Mia (round trip)", amount: 18.50, booking: "b-304", receipt: true, qb: "synced" as const },
      { id: "e-50", date: "Oct 20", cat: "Props", catColor: "#C2704A", desc: "Fall floral set — Michaels", amount: 62.40, booking: null, receipt: true, qb: "synced" as const },
      { id: "e-49", date: "Oct 18", cat: "Equipment", catColor: "#6B7B99", desc: "CF Express card 128GB", amount: 189.99, booking: null, receipt: true, qb: "synced" as const },
      { id: "e-48", date: "Oct 16", cat: "Mileage", catColor: "#7A8F5A", desc: "Cypress Bend scout", amount: 9.80, booking: null, receipt: false, qb: "pending" as const },
      { id: "e-47", date: "Oct 14", cat: "Assistant", catColor: "#A8916B", desc: "Taylor — Nakamura family shoot", amount: 125.00, booking: "b-281", receipt: true, qb: "synced" as const },
      { id: "e-46", date: "Oct 12", cat: "Permits", catColor: "#9BA0A6", desc: "Zilker permit renewal", amount: 45.00, booking: null, receipt: true, qb: "synced" as const },
      { id: "e-45", date: "Oct 10", cat: "Travel", catColor: "#B58A5C", desc: "Gas — Shell", amount: 52.10, booking: null, receipt: true, qb: "synced" as const },
      { id: "e-44", date: "Oct 08", cat: "Props", catColor: "#C2704A", desc: "Blanket + vintage books", amount: 38.20, booking: "b-276", receipt: true, qb: "synced" as const },
    ],
    categories: ["All", "Mileage", "Equipment", "Assistant", "Props", "Permits", "Travel", "Other"],
  },

  galleries: {
    stats: { deliveredMTD: 4, views7d: 312, expiring7d: 2 },
    rows: [
      { id: "g-21", client: "Harper Lin", date: "Oct 14", status: "active" as const, statusLabel: "Full delivered", views: 48, downloads: 12, expires: "Nov 14", hero: "#C2704A" },
      { id: "g-20", client: "The Nakamura Family", date: "Oct 11", status: "active" as const, statusLabel: "Full delivered", views: 93, downloads: 38, expires: "Nov 11", hero: "#7A8F5A" },
      { id: "g-19", client: "Zoe Breckenridge", date: "Oct 08", status: "active" as const, statusLabel: "Full delivered", views: 26, downloads: 9, expires: "Nov 08", hero: "#C2704A" },
      { id: "g-18", client: "Bella Ng", date: "Oct 04", status: "expiring" as const, statusLabel: "Expires in 3d", views: 112, downloads: 45, expires: "Oct 24", hero: "#A8916B" },
      { id: "g-17", client: "The Karr Family", date: "Sep 28", status: "expiring" as const, statusLabel: "Expires in 6d", views: 67, downloads: 22, expires: "Oct 27", hero: "#7A8F5A" },
      { id: "g-16", client: "Jude Morrison", date: "Sep 22", status: "draft" as const, statusLabel: "Sneak peek sent", views: 4, downloads: 0, expires: "—", hero: "#C2704A" },
      { id: "g-15", client: "Tess Wallace", date: "Sep 12", status: "archived" as const, statusLabel: "Expired", views: 34, downloads: 18, expires: "Oct 12", hero: "#B58A5C" },
    ],
  },

  automations: {
    stats: { sentThisWeek: 34, sentThisMonth: 142, deliveryRate: "99.2%", topSender: "Style guide — 3d before" },
    groups: [
      { key: "booking", label: "On Booking", desc: "Sent when a new booking is confirmed", items: [
        { id: "a-1", name: "Booking confirmation", offset: "Instant", subject: "You're booked, {{first_name}}!", audience: "All sessions", enabled: true, sent7: 3 },
        { id: "a-2", name: "Receipt + contract", offset: "+2 min", subject: "Your receipt and what's next", audience: "All sessions", enabled: true, sent7: 3 },
      ]},
      { key: "pre", label: "Pre-Session", desc: "Prep emails leading up to the shoot", items: [
        { id: "a-3", name: "Style guide delivery", offset: "14 days before", subject: "Your style guide (Senior)", audience: "Senior bookings", enabled: true, sent7: 5 },
        { id: "a-4", name: "Style guide reminder", offset: "3 days before", subject: "One last look at your style guide", audience: "All sessions", enabled: true, sent7: 8 },
        { id: "a-5", name: "Day-of logistics", offset: "Morning of", subject: "Today's the day! Meet at {{location}}", audience: "All sessions", enabled: true, sent7: 5 },
      ]},
      { key: "payment", label: "Payment Overdue", desc: "Reminds clients to pay final balance", items: [
        { id: "a-6", name: "Final payment reminder #1", offset: "7 days before due", subject: "Quick heads up — final balance due soon", audience: "All sessions", enabled: true, sent7: 4 },
        { id: "a-7", name: "Final payment reminder #2", offset: "3 days before due", subject: "Your final payment is due {{date}}", audience: "All sessions", enabled: true, sent7: 3 },
        { id: "a-8", name: "Overdue escalation", offset: "2 days after due", subject: "Just checking in on your balance", audience: "All sessions", enabled: false, sent7: 0 },
      ]},
      { key: "post", label: "Post-Session", desc: "Nurture after the shoot wraps", items: [
        { id: "a-9", name: "Thank-you + sneak peek ETA", offset: "+1 day", subject: "It was the best! Sneak peek in 48h", audience: "All sessions", enabled: true, sent7: 2 },
      ]},
      { key: "gallery", label: "Gallery Delivered", desc: "Delivery + expiry reminders", items: [
        { id: "a-10", name: "Gallery ready", offset: "Trigger: delivery", subject: "Your gallery is live", audience: "All sessions", enabled: true, sent7: 1 },
        { id: "a-11", name: "Expiry reminder — 7 days", offset: "7 days before expiry", subject: "Your gallery expires in a week", audience: "All sessions", enabled: true, sent7: 1 },
        { id: "a-12", name: "Expiry reminder — 1 day", offset: "1 day before expiry", subject: "Last call — gallery expires tomorrow", audience: "All sessions", enabled: true, sent7: 0 },
      ]},
    ],
  },
};
