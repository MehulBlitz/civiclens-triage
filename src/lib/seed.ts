import type { NewComplaint } from "./schema";

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

/**
 * Demo data so judges see a populated dashboard instantly.
 * Pre-classified exactly as the pipeline would classify them.
 */
export const SEED_ROWS: NewComplaint[] = [
  {
    id: 1,
    rawText:
      "@BPCLimited @bbmp_probe HUGE pothole right at the base of the Indiranagar 100ft Road flyover — two bikers fell this morning. This is an accident spot, fix TODAY please! #pothole #blr",
    imageUrl: null,
    category: "Pothole",
    priority: "urgent",
    routeTo: "Roads & Transport",
    summary:
      "Large pothole at the Indiranagar 100ft Road flyover base has already caused two bike falls.",
    confidence: 0.96,
    locationText: "100 Feet Road, Indiranagar, Bengaluru",
    lat: 12.9719,
    lng: 77.6412,
    source: "tweet",
    sourceLayer: "seed",
    status: "open",
    createdAt: hoursAgo(2)
  },
  {
    id: 2,
    rawText:
      "Dear BBMP Commissioner, The storm drain behind Koramangala 4th Block has been choked with silt and plastic for three days. Street is waterlogged, kids can't reach school and mosquitoes are unbearable. Please desilt on priority. Regards, residents of 4th Block",
    imageUrl: null,
    category: "Drainage",
    priority: "high",
    routeTo: "Stormwater & Drainage",
    summary:
      "Choked storm drain in Koramangala 4th Block has left the street waterlogged for three days.",
    confidence: 0.93,
    locationText: "4th Block, Koramangala, Bengaluru",
    lat: 12.9352,
    lng: 77.6245,
    source: "email",
    sourceLayer: "seed",
    status: "in_progress",
    createdAt: hoursAgo(7)
  },
  {
    id: 3,
    rawText:
      "Garbage hasn't been collected in HSR Layout Sector 2 for a WEEK. Bins overflowing onto 27th Main, stray dogs tearing bags open, stench is unreal. @HSRlayout @bbmp_probe #waste #hsr",
    imageUrl: null,
    category: "Waste",
    priority: "high",
    routeTo: "Sanitation Services",
    summary:
      "Waste collection skipped for a week in HSR Layout Sector 2, bins overflowing onto 27th Main.",
    confidence: 0.95,
    locationText: "27th Main, Sector 2, HSR Layout, Bengaluru",
    lat: 12.9081,
    lng: 77.6476,
    source: "tweet",
    sourceLayer: "seed",
    status: "open",
    createdAt: hoursAgo(14)
  },
  {
    id: 4,
    rawText:
      "Hello, A water pipe near the Jayanagar 4th T Block community hall has been leaking continuously for four days — clean drinking water is going down the drain while the same area gets supply only once every two days. Please repair the main line urgently. Thanks, a concerned resident.",
    imageUrl: null,
    category: "Water",
    priority: "high",
    routeTo: "Water Board",
    summary:
      "Burst supply pipe near Jayanagar 4th T Block has been wasting clean water for four days.",
    confidence: 0.92,
    locationText: "4th T Block, Jayanagar, Bengaluru",
    lat: 12.925,
    lng: 77.5938,
    source: "email",
    sourceLayer: "seed",
    status: "open",
    createdAt: hoursAgo(20)
  },
  {
    id: 5,
    rawText:
      "Streetlights on Whitefield Main Road near Varthur have been DEAD for 2 weeks. Pitch dark after 7pm, completely unsafe for women and children walking to the bus stop. @bijlioffice please restore.",
    imageUrl: null,
    category: "Streetlight",
    priority: "medium",
    routeTo: "Electricals (Street Lighting)",
    summary:
      "Dead streetlights on Whitefield Main Road near Varthur for two weeks, unsafe after dark.",
    confidence: 0.9,
    locationText: "Varthur, Whitefield, Bengaluru",
    lat: 12.945,
    lng: 77.75,
    source: "tweet",
    sourceLayer: "seed",
    status: "in_progress",
    createdAt: hoursAgo(30)
  },
  {
    id: 6,
    rawText:
      "Sewage overflowing from the manhole right opposite Majestic bus stand. The smell is unbearable and the overflow is spreading onto the pedestrian path where hundreds walk every hour. This is a health hazard now.",
    imageUrl:
      "https://picsum.photos/seed/sewage-complaint/800/500",
    category: "Sewage",
    priority: "urgent",
    routeTo: "Water & Sewerage",
    summary:
      "Manhole opposite Majestic bus stand is overflowing sewage onto a busy pedestrian path.",
    confidence: 0.97,
    locationText: "Majestic Bus Stand, Bengaluru",
    lat: 12.9766,
    lng: 77.5728,
    source: "social",
    sourceLayer: "seed",
    status: "open",
    createdAt: hoursAgo(4)
  },
  {
    id: 7,
    rawText:
      "Whole wall near the MG Road metro underpass is covered in illegal posters and graffiti again. Painted over last month, back to square one. Can maintenance teams take this up on a schedule?",
    imageUrl: null,
    category: "Graffiti",
    priority: "low",
    routeTo: "Urban Maintenance",
    summary:
      "MG Road metro underpass wall is covered in illegal posters and graffiti again.",
    confidence: 0.88,
    locationText: "MG Road, Bengaluru",
    lat: 12.9756,
    lng: 77.6066,
    source: "manual",
    sourceLayer: "seed",
    status: "resolved",
    createdAt: hoursAgo(50)
  },
  {
    id: 8,
    rawText:
      "There is a pack of 5 stray dogs near the Malleshwaram 8th Cross bus stop that chase morning walkers every day. An old lady slipped yesterday. Somebody please look into this — is this even the corporation's job?",
    imageUrl: null,
    category: "Other",
    priority: "medium",
    routeTo: "General Grievance Cell",
    summary:
      "Aggressive stray dogs near Malleshwaram 8th Cross scare walkers and caused one fall.",
    confidence: 0.34,
    locationText: "8th Cross, Malleshwaram, Bengaluru",
    lat: 12.985,
    lng: 77.565,
    source: "manual",
    sourceLayer: "manual",
    status: "needs_review",
    createdAt: hoursAgo(40)
  }
];
