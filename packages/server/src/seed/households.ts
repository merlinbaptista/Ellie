export interface DemoHouseholdSpec {
  householdId: string;
  displayName: string;
  country: string;
  region: string;
  timeZone: string;
  language: string;
  phoneLanguage?: string;
  phone?: string;
  email?: string;
  currency: string;
}

export const DEMO_HOUSEHOLDS: DemoHouseholdSpec[] = [
  {
    householdId: "demo-blr",
    displayName: "Demo home, Bengaluru",
    country: "IN",
    region: "Bengaluru",
    timeZone: "Asia/Kolkata",
    language: "en-IN",
    phoneLanguage: "kn-IN",
    phone: "+919000000001",
    currency: "INR",
  },
  {
    householdId: "demo-tx",
    displayName: "Demo home, Texas",
    country: "US",
    region: "Fredericksburg",
    timeZone: "America/Chicago",
    language: "en-US",
    email: "demo-tx@example.com",
    currency: "USD",
  },
] as const;
