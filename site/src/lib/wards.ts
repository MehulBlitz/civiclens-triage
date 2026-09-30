export type Ward = { code: string; name: string; zone: string };

export const WARDS: Ward[] = [
  { code: "A", name: "Colaba–Churchgate", zone: "City" },
  { code: "C", name: "Marine Lines–Malabar Hill", zone: "City" },
  { code: "F North", name: "Matunga–Sion", zone: "City" },
  { code: "G North", name: "Dadar–Mahim", zone: "City" },
  { code: "H East", name: "Bandra East–Khar", zone: "Western Suburbs" },
  { code: "K West", name: "Andheri West–Juhu", zone: "Western Suburbs" },
  { code: "K East", name: "Andheri East–Marol", zone: "Western Suburbs" },
  { code: "P North", name: "Malad–Dahisar", zone: "Western Suburbs" },
  { code: "R Central", name: "Borivali–Kandivali", zone: "Western Suburbs" },
  { code: "N", name: "Ghatkopar–Vikhroli", zone: "Eastern Suburbs" },
  { code: "L", name: "Kurla–Sakinaka", zone: "Eastern Suburbs" },
  { code: "M West", name: "Chembur", zone: "Eastern Suburbs" },
  { code: "M East", name: "Govandi–Mankhurd", zone: "Eastern Suburbs" },
  { code: "S", name: "Bhandup–Vikhroli Parksite", zone: "Eastern Suburbs" },
  { code: "T", name: "Mulund", zone: "Eastern Suburbs" },
];

export function zoneList(): string[] {
  return [...new Set(WARDS.map((ward) => ward.zone))];
}
