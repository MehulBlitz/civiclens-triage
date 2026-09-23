"""Generate a synthetic-but-realistic civic complaint corpus.

The corpus mimics the phrasing styles CivicLens actually ingests — tweets
(@mentions, #hashtags), citizen emails (salutation + sign-off), social posts
and plain web-form text — across eight triage categories and four priority
levels, including Hinglish variants commonly seen on Indian city social media.

Priority labels are derived deterministically from severity/duration markers
that appear in the text, so the classifier learns genuinely predictive signals
instead of memorising a single template per category.

Usage:  python3 ml/generate_dataset.py   (writes ml/data/complaints.csv)
"""
from __future__ import annotations

import csv
import random
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent / "data" / "complaints.csv"

# ---------------------------------------------------------------------------
# Slot vocabularies
# ---------------------------------------------------------------------------

LOCALITIES = [
    "Indiranagar", "Koramangala 4th Block", "HSR Layout Sector 2",
    "Jayanagar 4th T Block", "Whitefield", "Malleshwaram 8th Cross",
    "Rajajinagar 1st Block", "Basavanagudi", "Yelahanka New Town",
    "Electronic City Phase 1", "BTM Layout 2nd Stage", "Marathahalli",
    "Hebbal", "Frazer Town", "Ashok Nagar", "Vijayanagar",
    "Rajarajeshwari Nagar", "Bellandur", "Varthur", "KR Puram",
    "HAL 3rd Stage", "Sanjaynagar", "Sadashivanagar", "Richmond Town",
    "Banaswadi", "Horamavu", "Kalyan Nagar", "Kammanahalli",
    "Jayadeva Junction", "Domlur",
]
STREETS = [
    "100ft Road", "27th Main Road", "80ft Road", "5th Cross",
    "Outer Ring Road", "Sarjapur Road", "Old Airport Road",
    "Bellandur Main Road", "Church Street", "Commercial Street",
    "Bannerghatta Road", "Magrath Road",
]
LANDMARKS = [
    "bus stand", "metro station", "government school", "community hall",
    "park entrance", "temple", "market", "post office", "flyover",
    "underpass", "bus depot", "lake gate",
]
DURATIONS = [
    "three days", "a week", "two weeks", "ten days", "four days",
    "the whole week",
]
URGENT_WORDS = ["today", "immediately", "right now", "on priority", "at the earliest"]
SIGNERS = [
    "a concerned resident", "R. Kumar", "S. Fernandes", "A. Rao",
    "M. Iqbal", "an annoyed citizen", "resident of the area",
]
HANDLES = ["bbmp_probe", "citycorp", "swachh_city", "roads_cell", "bwssb_official", "bescom_updates"]

HASHTAGS = {
    "Pothole": ["#pothole", "#fixourroads", "#roadsafety"],
    "Drainage": ["#drainage", "#waterlogging", "#monsoon"],
    "Waste": ["#garbage", "#swachhbharat", "#wastemanagement"],
    "Water": ["#waterleak", "#watersupply", "#bwssb"],
    "Streetlight": ["#streetlight", "#darkstreets", "#safety"],
    "Sewage": ["#sewage", "#healthhazard", "#bwssb"],
    "Graffiti": ["#graffiti", "#vandalism", "#cleanup"],
    "Other": ["#civicissue", "#cityissues"],
}

# Severity/attribute slots per category -------------------------------------

POTHOLE_ADJ = ["HUGE", "A deep", "A massive", "A nasty", "A dangerous", "A crater-sized", "A giant"]
POTHOLE_CONS = [
    "two bikers skidded and fell this morning",
    "an auto got stuck in it and overturned",
    "it already damaged my car's suspension",
    "school vans swerve dangerously around it",
    "an elderly man tripped and hurt his wrist near it",
    "two-wheelers swerve into oncoming traffic to avoid it",
]
DRAIN_CONS = [
    "the street is fully waterlogged",
    "kids can't reach school without wading through water",
    "mosquitoes have become unbearable",
    "water has entered at least six houses",
    "the footpath is slippery and unsafe",
]
WASTE_CONS = [
    "stray dogs are tearing the bags open",
    "the stench is unbearable",
    "rats are everywhere now",
    "the footpath is unusable",
    "flies cover the whole stretch",
]
WATER_CONS = [
    "clean drinking water is going down the drain",
    "water is gushing onto the road non-stop",
    "the area gets supply only once every two days",
    "the road surface is eroding because of it",
    "nearly a thousand litres are wasted every day",
]
LIGHT_CONS = [
    "it is pitch dark after 7pm",
    "completely unsafe for women and children walking to the bus stop",
    "eve-teasing incidents have increased on this stretch",
    "two-wheelers can't see the speed breaker",
]
SEWAGE_CONS = [
    "the smell is unbearable",
    "the overflow is spreading onto the pedestrian path",
    "it is a serious health hazard now",
    "children walking to school step around it every day",
    "the stagnant sludge breeds mosquitoes",
]
GRAFFITI_CONS = [
    "painted over last month, back to square one",
    "it makes the whole area look shabby",
    "nobody from maintenance has come yet",
    "the same wall gets defaced every fortnight",
]
OTHER_CONS = [
    "someone is going to get hurt one of these days",
    "residents have complained multiple times already",
    "it is getting worse every week",
    "nobody official has turned up so far",
]

CATEGORY_CONS = {
    "Pothole": POTHOLE_CONS,
    "Drainage": DRAIN_CONS,
    "Waste": WASTE_CONS,
    "Water": WATER_CONS,
    "Streetlight": LIGHT_CONS,
    "Sewage": SEWAGE_CONS,
    "Graffiti": GRAFFITI_CONS,
    "Other": OTHER_CONS,
}

# ---------------------------------------------------------------------------
# Priority labelling (deterministic severity scan over the rendered text)
# ---------------------------------------------------------------------------

BASE_PRIORITY = {
    "Pothole": 2, "Drainage": 2, "Waste": 2, "Water": 2,
    "Streetlight": 1, "Sewage": 3, "Graffiti": 0, "Other": 1,
}
URGENT_MARKERS = [
    "accident", "fell", "gir gaye", "children", "school", "hospital",
    "unsafe", "health hazard", "emergency", "immediately", "today",
    "life risk", "collapse", "onto the main road", "danger to life",
    "snake sight", "electrocut", "live wire", " overturned",
]
HIGH_MARKERS = [
    "weeks", "days", "a week", "dangerous", "huge", "giant", "massive",
    "blocked", "unbearable", "mosquito", "overflowing onto", "wasting",
    "no water", "dead for", "gushing", "caved", "deep", "choked",
    "waterlogged", "contaminated",
]
LOW_MARKERS = [
    "minor", "small", "cosmetic", "no rush", "when convenient",
    "suggestion", "whenever", "a bit",
]

LABELS = ["low", "medium", "high", "urgent"]


def label_priority(text: str, category: str) -> str:
    low = text.lower()
    level = BASE_PRIORITY.get(category, 1)
    if any(m in low for m in URGENT_MARKERS):
        level = 3
    elif any(m in low for m in HIGH_MARKERS):
        level = max(level, 2)
    elif any(m in low for m in LOW_MARKERS):
        level = min(level, 0)
    return LABELS[level]


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

def _loc(rng: random.Random) -> str:
    return rng.choice([
        f"on {rng.choice(STREETS)}, {rng.choice(LOCALITIES)}",
        f"near the {rng.choice(LANDMARKS)} in {rng.choice(LOCALITIES)}",
        f"opposite the {rng.choice(LANDMARKS)}, {rng.choice(LOCALITIES)}",
        f"in {rng.choice(LOCALITIES)}",
        f"at the {rng.choice(LOCALITIES)} {rng.choice(LANDMARKS)}",
        f"on the {rng.choice(STREETS)} stretch near {rng.choice(LOCALITIES)}",
        f"right at the base of the {rng.choice(LOCALITIES)} flyover",
    ])


def _ctx(rng: random.Random, category: str) -> dict:
    return {
        "loc": _loc(rng),
        "days": rng.choice(DURATIONS),
        "cons": rng.choice(CATEGORY_CONS[category]),
        "urg": rng.choice(URGENT_WORDS),
        "sign": rng.choice(SIGNERS),
        "handle": rng.choice(HANDLES),
        "tag": " ".join(rng.sample(HASHTAGS[category], k=min(2, len(HASHTAGS[category])))),
        "adj": rng.choice(POTHOLE_ADJ),
        "week": rng.choice(["two weeks", "three weeks", "a month", "the last month"]),
    }


def _cap(s: str) -> str:
    return s[0].upper() + s[1:] if s else s


TEMPLATES: dict[str, list] = {
    "Pothole": [
        lambda c: f"{c['adj']} pothole {c['loc']} — {c['cons']}. Fix it {c['urg']}!",
        lambda c: f"@{c['handle']} Big pothole {c['loc']}. {c['cons']}. Please fill this {c['urg']}. {c['tag']}",
        lambda c: f"Dear Commissioner,\n\nThere is a deep pothole {c['loc']}. {c['cons']}. Kindly arrange repair {c['urg']}.\n\nRegards,\n{c['sign']}",
        lambda c: f"Commuters risk their lives every day because of a giant pothole {c['loc']}. {c['cons']}. When will this road be repaired? {c['tag']}",
        lambda c: f"Road surface has caved in {c['loc']} — the crater grows every day. {c['cons']}.",
        lambda c: f"Bhai ek bahut bada gaddha ho gaya hai {c['loc']}. Do bike wale gir gaye hain. Pls jaldi repair karao.",
        lambda c: f"PSA: massive pothole {c['loc']}. {c['cons']}. Repost until the corporation notices. {c['tag']}",
        lambda c: f"Third time reporting the pothole {c['loc']}. Nobody has come. {c['cons']}. Is this how complaints are treated?",
        lambda c: f"The freshly tarred road {c['loc']} already has a new pothole. Please inspect the contractor's work.",
        lambda c: f"Hello sir, I wish to bring to your notice a dangerous pothole {c['loc']}. {c['cons']}. Requesting urgent action.\n\nThanking you,\n{c['sign']}",
    ],
    "Drainage": [
        lambda c: f"The storm drain {c['loc']} has been choked with silt and plastic for {c['days']}. {c['cons']}. Please desilt {c['urg']}.",
        lambda c: f"@{c['handle']} street {c['loc']} is waterlogged because the drain is clogged. {c['cons']}. {c['tag']}",
        lambda c: f"Dear Sir,\n\nThe drainage line {c['loc']} is blocked for {c['days']} now. {c['cons']}. Request you to send the desilting team.\n\nRegards,\n{c['sign']}",
        lambda c: f"Every shower and the whole street {c['loc']} floods — the drain has not been desilted once this year. {c['cons']}.",
        lambda c: f"Stagnant water {c['loc']} because of a clogged drain. {c['cons']}. This is becoming a health issue.",
        lambda c: f"Saaf ki nali {c['loc']} me jam ho gayi hai, paani bhara hua hai {c['days']} se. Koi nahi aa raha dekhne.",
        lambda c: f"Reminder tweet no. 4: the choked drain {c['loc']} is still overflowing. {c['cons']}. {c['tag']}",
        lambda c: f"Rainwater has nowhere to go {c['loc']} — drains are full of construction debris. {c['cons']}.",
        lambda c: f"Respected officer, the open drain {c['loc']} overflows into our gate every time it rains. {c['cons']}. Kindly depute a team {c['urg']}.\n\nYours faithfully,\n{c['sign']}",
        lambda c: f"Who is responsible for the flooded street {c['loc']}? A choked drain, {c['days']}, zero action. {c['cons']}.",
    ],
    "Waste": [
        lambda c: f"Garbage hasn't been collected {c['loc']} for {c['days']}. {c['cons']}. {c['tag']}",
        lambda c: f"@{c['handle']} bins {c['loc']} are overflowing onto the road. {c['cons']}. Please clear them {c['urg']}.",
        lambda c: f"Dear Sir/Madam,\n\nHousehold waste {c['loc']} has not been lifted for {c['days']}. {c['cons']}. Kindly restore collection {c['urg']}.\n\nRegards,\n{c['sign']}",
        lambda c: f"Someone dumps construction debris {c['loc']} every night. {c['cons']}. Can CCTV pickup points be checked?",
        lambda c: f"Kachra uthaya nahi ja raha {c['loc']} se {c['days']} se. Kutton ne thaili phad di. Kripya jaldi saaf karwaye.",
        lambda c: f"The black spot {c['loc']} is back — mixed waste piled up again. {c['cons']}. {c['tag']}",
        lambda c: f"Segregation means nothing if the truck skips our street {c['loc']} for {c['days']}. {c['cons']}.",
        lambda c: f"Requesting a fixed timing for waste collection {c['loc']}. Bags sit on the footpath all day and {c['cons']}.",
        lambda c: f"Hello, this is to report uncollected garbage {c['loc']} since {c['days']}. {c['cons']}. Please take action.\n\nThank you,\n{c['sign']}",
        lambda c: f"Marketeers dump rotten vegetables {c['loc']} after closing time. {c['cons']}. Fines should apply here.",
    ],
    "Water": [
        lambda c: f"A water pipe {c['loc']} has been leaking continuously for {c['days']} — {c['cons']}. Please repair the line {c['urg']}.",
        lambda c: f"@{c['handle']} pipe burst {c['loc']}, water is gushing onto the road since morning. {c['cons']}. {c['tag']}",
        lambda c: f"Dear Water Board,\n\nThere is a major leak {c['loc']} since {c['days']}. {c['cons']}. Please send a repair crew.\n\nRegards,\n{c['sign']}",
        lambda c: f"No water supply {c['loc']} for {c['days']} now. Tankers are being sold privately. This needs attention {c['urg']}.",
        lambda c: f"Paani ki pipeline {c['loc']} se leak ho rahi hai {c['days']} se. Paani waste ho raha hai. Jaldi theek karao.",
        lambda c: f"Tap water {c['loc']} smells of sewage this week — is the line contaminated? Requesting a quality test.",
        lambda c: f"Valve {c['loc']} has been leaking {c['days']}; {c['cons']}. A quick clamp fix would stop the loss.",
        lambda c: f"Third complaint about the leaking valve {c['loc']}. {c['cons']}. Where is the maintenance crew?",
        lambda c: f"Respected sir, the supply line {c['loc']} burst last night and {c['cons']}. Requesting emergency repair.\n\nYours sincerely,\n{c['sign']}",
        lambda c: f"Half the street {c['loc']} gets muddy water in the taps. {c['cons']}. Please flush and test the line.",
    ],
    "Streetlight": [
        lambda c: f"Streetlights {c['loc']} have been dead for {c['week']}. {c['cons']}. @{c['handle']} please restore.",
        lambda c: f"@{c['handle']} not a single working street light {c['loc']}. {c['cons']}. {c['tag']}",
        lambda c: f"Dear Sir,\n\nThe pole lights {c['loc']} are not working for {c['week']}. {c['cons']}. Kindly repair or replace the fittings {c['urg']}.\n\nRegards,\n{c['sign']}",
        lambda c: f"Half the lights flicker {c['loc']} and the rest are off. {c['cons']}. When will maintenance happen?",
        lambda c: f"Bijli ka khamba {c['loc']} pe light nahi jal rahi {c['week']} se. Raat me andhera hai, koi solution?",
        lambda c: f"Exposed wiring on the light pole {c['loc']} — live wire hanging at head height. {c['cons']}. This is dangerous.",
        lambda c: f"New LED fittings were installed {c['loc']} but they stopped working within a month. {c['cons']}.",
        lambda c: f"Requesting solar lights near the park {c['loc']} — the lane has been unlit for {c['week']}. {c['cons']}.",
        lambda c: f"Hello, streetlight no. 14 {c['loc']} stays on through the day but is dead at night. {c['cons']}. Please fix the timer.\n\nThanks,\n{c['sign']}",
        lambda c: f"Dark street {c['loc']} every night for {c['week']}. {c['cons']}. How many tweets before this is fixed? {c['tag']}",
    ],
    "Sewage": [
        lambda c: f"Sewage is overflowing from the manhole {c['loc']}. {c['cons']}. This needs emergency attention.",
        lambda c: f"@{c['handle']} raw sewage flowing on the footpath {c['loc']} since {c['days']}. {c['cons']}. {c['tag']}",
        lambda c: f"Dear Sir,\n\nThe sewer line {c['loc']} is blocked and backs up into our bathroom every morning. {c['cons']}. Requesting immediate jetting.\n\nRegards,\n{c['sign']}",
        lambda c: f"Manhole lid {c['loc']} is broken open — open sewage, kids walking over it. {c['cons']}. Someone will get hurt.",
        lambda c: f"Nali ka ganda paani {c['loc']} me ghar ke aage aa gaya hai {c['days']} se. Bimari failne ka khatra hai.",
        lambda c: f"Toilet lines {c['loc']} are backing up because the main sewer is choked. {c['cons']}. Please clear the blockage today.",
        lambda c: f"The inspection chamber {c['loc']} overflows onto the main road every evening. {c['cons']}.",
        lambda c: f"Septic smell + overflow {c['loc']} for {c['days']}. {c['cons']}. How is this not an emergency for the department?",
        lambda c: f"Respected officer, sewer overflow {c['loc']} has made the lane unliveable. {c['cons']}. Kindly act today itself.\n\nYours faithfully,\n{c['sign']}",
        lambda c: f"Tanker empties into the storm drain {c['loc']} at midnight. {c['cons']}. Please enforce the ban.",
        lambda c: f"Sewage water is entering our homes {c['loc']} — bathrooms flooded with drain water every morning. {c['cons']}. This is a health emergency.",
        lambda c: f"@{c['handle']} drain water has mixed with our drinking supply {c['loc']}. {c['cons']}. Children are falling sick. {c['tag']}",
        lambda c: f"Wastewater backing up into the kitchen and toilet {c['loc']} since {c['days']}. {c['cons']}. Please send jetting machine urgently.",
        lambda c: f"Gandhi paani ghar ke andar aa raha hai {c['loc']} me. Bachche bimaar ho rahe hain. Turant solution chahiye.",
    ],
    "Graffiti": [
        lambda c: f"The wall {c['loc']} is covered in illegal posters and graffiti again. {c['cons']}. Can maintenance take this up on a schedule?",
        lambda c: f"@{c['handle']} political banners tied across the flyover {c['loc']}. {c['cons']}. {c['tag']}",
        lambda c: f"Dear Sir,\n\nPublic property {c['loc']} is being defaced with movie posters. {c['cons']}. Requesting regular cleaning.\n\nRegards,\n{c['sign']}",
        lambda c: f"Somebody painted graffiti on the underpass wall {c['loc']}. {c['cons']}. A fresh coat would help.",
        lambda c: f"Deewar {c['loc']} pe phir poster chipka diye. Safai wale kab aayenge? {c['cons']}.",
        lambda c: f"Advertisement flex boards on the footpath railing {c['loc']}. {c['cons']}. Removal should be quick and cheap.",
        lambda c: f"The heritage wall {c['loc']} has been spray-painted. {c['cons']}. This is vandalism of a public asset.",
        lambda c: f"Requesting a mural instead — the wall {c['loc']} gets defaced every fortnight. {c['cons']}.",
        lambda c: f"Hello, unauthorised posters all over the metro pillar {c['loc']}. {c['cons']}. Please depute the enforcement van.\n\nThanks,\n{c['sign']}",
        lambda c: f"Every pillar {c['loc']} is plastered with ads. {c['cons']}. What happened to the anti-poster drive?",
    ],
    "Other": [
        lambda c: f"A pack of stray dogs {c['loc']} chases morning walkers every day. {c['cons']}. Is this the corporation's job?",
        lambda c: f"@{c['handle']} loudspeakers till 2am {c['loc']} every night. {c['cons']}. Noise rules exist for a reason. {c['tag']}",
        lambda c: f"Dear Sir,\n\nIllegal parking {c['loc']} blocks the entire footpath and half the road. {c['cons']}. Please deploy towing.\n\nRegards,\n{c['sign']}",
        lambda c: f"A tree branch is hanging over the power lines {c['loc']}. {c['cons']}. One gust of wind and it touches the wires.",
        lambda c: f"Stray cattle {c['loc']} sit on the carriageway during rush hour. {c['cons']}. Whose responsibility is impounding?",
        lambda c: f"Footpath {c['loc']} has been dug up and left unfenced for {c['days']}. {c['cons']}.",
        lambda c: f"Requesting speed breakers / signage near the school gate {c['loc']} — vehicles race through. {c['cons']}.",
        lambda c: f"Bhains-gay {c['loc']} me subah sham ghoomti hai. Bachon ko dar lagta hai. Kripya hatao.",
        lambda c: f"Vendors have fully encroached the pavement {c['loc']}. {c['cons']}. A designated zone would work better.",
        lambda c: f"Hello, an abandoned two-wheeler {c['loc']} has been untouched for months. {c['cons']}. Please inspect and remove.\n\nThanks,\n{c['sign']}",
    ],
}

# Non-civic noise so "Other" also covers off-topic raw data.
NOISE_TEMPLATES = [
    "What a lovely evening for a walk by the lake",
    "Buy one get one free on all shoes this weekend only, click the link",
    "Happy birthday bro, party at my place tonight",
    "The sunset from the terrace today was unreal",
    "Congratulations to the team on winning the finals!",
    "Anyone selling a second-hand bicycle in decent shape?",
    "Just tried the new cafe on the corner, the filter coffee is excellent",
    "Monsoon finally feels here, keep your umbrellas ready",
    "Reminder: tomorrow is a holiday for all government offices",
    "Great turnouts at the book fair this year",
    "Lost my blue umbrella near the park yesterday, sentimental value",
    "Traffic update: roads busy near the stadium this evening",
    "Match highlights were insane last night, what a finish",
    "Sharing the recipe everyone asked for — 10 minute pasta",
]


def _perturb(text: str, rng: random.Random) -> str:
    """Light realistic noise: casing, abbreviations, punctuation, spacing."""
    if rng.random() < 0.08:
        text = text.lower()
    if rng.random() < 0.08:
        text = text.replace("please", "pls", 1)
    if rng.random() < 0.06:
        text = text.replace("street", "st.", 1)
    if rng.random() < 0.08 and not text.endswith(("!", "?", ".")):
        text += "!"
    if rng.random() < 0.05:
        text = text.replace("!", "!!", 1)
    if rng.random() < 0.05:
        text = text.replace(" a ", "  a ", 1)
    return text


def build_dataset(
    per_category: int = 40,
    noise: int = 30,
    seed: int = 42,
) -> list[dict]:
    """Build the corpus: `per_category` rows per category + `noise` off-topic rows."""
    rng = random.Random(seed)
    rows: list[dict] = []
    seen: set[str] = set()

    def add(text: str, category: str) -> None:
        text = text.strip()
        if not text or text in seen:
            return
        seen.add(text)
        rows.append(
            {"text": text, "category": category, "priority": label_priority(text, category)}
        )

    for category, templates in TEMPLATES.items():
        for _ in range(per_category):
            ctx = _ctx(rng, category)
            template = rng.choice(templates)
            add(_perturb(template(ctx), rng), category)

    for _ in range(noise):
        add(_perturb(rng.choice(NOISE_TEMPLATES), rng), "Other")

    rng.shuffle(rows)
    return rows


def write_csv(path: Path = DATA_PATH, rows: list[dict] | None = None) -> Path:
    rows = rows if rows is not None else build_dataset()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["text", "category", "priority"])
        writer.writeheader()
        writer.writerows(rows)
    return path


if __name__ == "__main__":
    rows = build_dataset()
    path = write_csv(rows=rows)
    counts: dict[str, int] = {}
    prios: dict[str, int] = {}
    for r in rows:
        counts[r["category"]] = counts.get(r["category"], 0) + 1
        prios[r["priority"]] = prios.get(r["priority"], 0) + 1
    print(f"wrote {len(rows)} rows -> {path}")
    print("by category:", dict(sorted(counts.items())))
    print("by priority:", dict(sorted(prios.items())))
