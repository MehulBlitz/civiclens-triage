/**
 * Elected ward representatives ("nagarsevak" / corporator) directory.
 *
 * Demo dataset of Bengaluru ward corporators with public contact channels.
 * Each row drives the /representatives directory: search, filter by zone,
 * WhatsApp escalation deep-links, and response metrics that hold
 * representatives accountable (avg response, SLA compliance, open pool).
 */

export type Representative = {
  id: number;
  name: string;
  ward: string;
  zone: string;
  party: string;
  designation: string;
  phone: string;
  whatsapp: string;
  email: string;
  office: string;
  term: string;
  /** Accountability metrics (demo ledger). */
  complaintsResolved: number;
  complaintsOpen: number;
  avgResponseHours: number;
  slaCompliance: number; // 0-1
  responseRate: number; // 0-1
};

export const REPRESENTATIVES: Representative[] = [
  {
    id: 1, name: "Rajesh Patil", ward: "Indiranagar (Ward 89)", zone: "East", party: "Independent",
    designation: "Ward Corporator", phone: "+91-80-2294-0101", whatsapp: "918022940101",
    email: "ward89@city.gov.in", office: "Ward Office, 100ft Road, Indiranagar", term: "2024–2029",
    complaintsResolved: 412, complaintsOpen: 23, avgResponseHours: 9.2, slaCompliance: 0.91, responseRate: 0.96
  },
  {
    id: 2, name: "Sunita Rao", ward: "Koramangala (Ward 76)", zone: "South", party: "Ward Janata",
    designation: "Ward Corporator", phone: "+91-80-2294-0102", whatsapp: "918022940102",
    email: "ward76@city.gov.in", office: "4th Block Community Hall, Koramangala", term: "2024–2029",
    complaintsResolved: 388, complaintsOpen: 31, avgResponseHours: 11.5, slaCompliance: 0.87, responseRate: 0.93
  },
  {
    id: 3, name: "Mohammed Irfan", ward: "Jayanagar (Ward 60)", zone: "South", party: "Civic Alliance",
    designation: "Ward Corporator", phone: "+91-80-2294-0103", whatsapp: "918022940103",
    email: "ward60@city.gov.in", office: "Jayanagar Shopping Complex, 4th Block", term: "2024–2029",
    complaintsResolved: 501, complaintsOpen: 18, avgResponseHours: 7.1, slaCompliance: 0.95, responseRate: 0.98
  },
  {
    id: 4, name: "Lakshmi Devi", ward: "Malleshwaram (Ward 31)", zone: "West", party: "Independent",
    designation: "Ward Corporator", phone: "+91-80-2294-0104", whatsapp: "918022940104",
    email: "ward31@city.gov.in", office: "8th Cross Market Office, Malleshwaram", term: "2024–2029",
    complaintsResolved: 295, complaintsOpen: 40, avgResponseHours: 14.8, slaCompliance: 0.82, responseRate: 0.89
  },
  {
    id: 5, name: "Anand Kumar", ward: "Whitefield (Ward 82)", zone: "East", party: "Civic Alliance",
    designation: "Ward Corporator", phone: "+91-80-2294-0105", whatsapp: "918022940105",
    email: "ward82@city.gov.in", office: "ITPL Main Road Office, Whitefield", term: "2024–2029",
    complaintsResolved: 344, complaintsOpen: 52, avgResponseHours: 18.3, slaCompliance: 0.74, responseRate: 0.84
  },
  {
    id: 6, name: "Priya Menon", ward: "HSR Layout (Ward 93)", zone: "South", party: "Ward Janata",
    designation: "Ward Corporator", phone: "+91-80-2294-0106", whatsapp: "918022940106",
    email: "ward93@city.gov.in", office: "Sector 2 Civic Center, HSR Layout", term: "2024–2029",
    complaintsResolved: 456, complaintsOpen: 21, avgResponseHours: 8.4, slaCompliance: 0.93, responseRate: 0.97
  },
  {
    id: 7, name: "Vikram Shetty", ward: "Yelahanka (Ward 9)", zone: "North", party: "Independent",
    designation: "Ward Corporator", phone: "+91-80-2294-0107", whatsapp: "918022940107",
    email: "ward9@city.gov.in", office: "New Town Office, Yelahanka", term: "2024–2029",
    complaintsResolved: 233, complaintsOpen: 44, avgResponseHours: 21.6, slaCompliance: 0.68, responseRate: 0.78
  },
  {
    id: 8, name: "Farida Khan", ward: "Rajajinagar (Ward 47)", zone: "West", party: "Civic Alliance",
    designation: "Ward Corporator", phone: "+91-80-2294-0108", whatsapp: "918022940108",
    email: "ward47@city.gov.in", office: "Dr Rajkumar Road Office, Rajajinagar", term: "2024–2029",
    complaintsResolved: 372, complaintsOpen: 29, avgResponseHours: 10.9, slaCompliance: 0.88, responseRate: 0.92
  }
];

export const ZONES = ["All", ...new Set(REPRESENTATIVES.map((r) => r.zone))] as const;
export const PARTIES = ["All", ...new Set(REPRESENTATIVES.map((r) => r.party))] as const;

/** Build a prefilled WhatsApp escalation message for a complaint. */
export function whatsappEscalationUrl(
  rep: Representative,
  ticketId: number,
  summary: string,
  location: string
): string {
  const text = encodeURIComponent(
    `Namaste ${rep.name}, I am escalating civic complaint #${ticketId} in your ward:\n\n` +
      `"${summary}"\nLocation: ${location}\n\n` +
      `Filed on CivicLens (AI triage). Kindly expedite the resolution — SLA tracking is active.`
  );
  return `https://wa.me/${rep.whatsapp}?text=${text}`;
}
