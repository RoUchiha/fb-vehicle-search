export interface SearchParams {
  make: string;
  model: string;
  year_min: string;
  year_max: string;
  price_min: string;
  price_max: string;
  mileage_max: string;
  zip_code: string;
  zip_codes?: string[];
  radius_miles: number;
  transmission: "any" | "automatic" | "manual";
  condition: "any" | "excellent" | "good" | "fair";
  sort_by: "relevance" | "price_asc" | "price_desc" | "mileage_asc" | "newest";
}

export interface Recall {
  recall_id: string;
  component: string;
  summary: string;
  consequence: string;
  remedy: string;
  date: string;
}

export interface Complaint {
  odometer: number | null;
  incident_date: string | null;
  component: string;
  summary: string;
}

export interface VehicleHistory {
  vin: string;
  recall_count: number;
  open_recall_count: number;
  recalls: Recall[];
  complaint_count: number;
  complaints: Complaint[];
  nicb_stolen: boolean | null;
  nicb_salvage: boolean | null;
  fetched_at: string;
}

export interface DecodedVIN {
  vin: string;
  make: string;
  model: string;
  year: number;
  trim: string | null;
  engine: string | null;
  transmission: string | null;
  drive_type: string | null;
  body_style: string | null;
  plant_country: string | null;
}

export interface Listing {
  listing_id: string;
  url: string;
  title: string;
  price: number | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  mileage: number | null;
  location: string;
  seller_name: string;
  seller_type: "private" | "dealer" | "unknown";
  posted_at: string | null;
  images: string[];
  description: string;
  vin: string | null;
  decoded_vin: DecodedVIN | null;
  history: VehicleHistory | null;
  // Feature 1: market price
  market_price_estimate: number | null;
  price_delta_pct: number | null;
  // Feature 3: state title check
  title_check_url: string | null;
  // Feature 4: affiliate links
  carfax_url: string | null;
  autocheck_url: string | null;
  // Feature 5: deal score
  quick_score: number | null;
  // Feature 12: freshness
  scraped_at: string | null;
}

export interface OwnershipCost {
  annual_maintenance_estimate: number | null;
  common_repair_costs: string[];
  insurance_tier: "low" | "medium" | "high" | null;
  fuel_cost_annual_estimate: number | null;
}

export interface AnalysisResult {
  listing_id: string;
  reliability_summary: string;
  known_pain_points: string[];
  maintenance_at_mileage: string[];
  inspection_checklist: string[];
  seller_questions: string[];
  recall_warnings: string[];
  buy_rating: "BUY" | "CAUTION" | "AVOID";
  buy_score: number;
  buy_rationale: string;
  price_assessment: "underpriced" | "fair" | "overpriced" | "unknown";
  ownership_cost: OwnershipCost | null;
  negotiation_script: string | null;
}

export type SseEvent =
  | { type: "start" }
  | { type: "chunk"; text: string }
  | { type: "result"; data: AnalysisResult }
  | { type: "done" }
  | { type: "error"; message: string };

export type JobStatus = "pending" | "running" | "done" | "failed";

export interface JobResponse {
  job_id: string;
  status: JobStatus;
  result?: {
    listings: Listing[];
    total: number;
    cached: boolean;
    scraped_at: string | null;
  };
  error?: string;
}
