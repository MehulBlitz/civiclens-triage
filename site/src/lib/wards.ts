export type Ward = { code: string; name: string; zone: string };
export type WardCoordinate = { lat: number; lng: number };

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

export const WARD_COORDINATES: Record<string, WardCoordinate> = {
  A: { lat: 18.922, lng: 72.834 }, C: { lat: 18.947, lng: 72.821 }, "F North": { lat: 19.027, lng: 72.856 },
  "G North": { lat: 19.019, lng: 72.843 }, "H East": { lat: 19.056, lng: 72.849 }, "K West": { lat: 19.136, lng: 72.827 },
  "K East": { lat: 19.119, lng: 72.869 }, "P North": { lat: 19.187, lng: 72.849 }, "R Central": { lat: 19.228, lng: 72.856 },
  N: { lat: 19.086, lng: 72.908 }, L: { lat: 19.072, lng: 72.879 }, "M West": { lat: 19.052, lng: 72.899 },
  "M East": { lat: 19.045, lng: 72.932 }, S: { lat: 19.145, lng: 72.938 }, T: { lat: 19.173, lng: 72.956 },
};

export function zoneList(): string[] {
  return [...new Set(WARDS.map((ward) => ward.zone))];
}
