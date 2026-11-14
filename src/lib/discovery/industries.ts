// Industry catalogue: search vocabulary (Arabic + English) and the matching
// OpenStreetMap tags. Free-text industries are also accepted by the engine;
// they simply have no OSM mapping.

export interface Industry {
  key: string;
  ar: string;
  en: string;
  termsAr: string[];
  termsEn: string[];
  osm: string[]; // "key=value" filters
}

export const INDUSTRIES: Industry[] = [
  { key: "restaurants", ar: "مطاعم", en: "Restaurants", termsAr: ["مطعم", "مطاعم"], termsEn: ["restaurant"], osm: ["amenity=restaurant", "amenity=fast_food"] },
  { key: "cafes", ar: "مقاهي وكافيهات", en: "Cafes", termsAr: ["كافيه", "مقهى", "قهوة مختصة"], termsEn: ["cafe", "coffee shop"], osm: ["amenity=cafe"] },
  { key: "bakeries", ar: "مخابز وحلويات", en: "Bakeries & Sweets", termsAr: ["مخبز", "حلويات"], termsEn: ["bakery", "sweets shop"], osm: ["shop=bakery", "shop=pastry", "shop=confectionery"] },
  { key: "fashion", ar: "أزياء وملابس", en: "Fashion & Clothing", termsAr: ["متجر ملابس", "بوتيك", "عبايات"], termsEn: ["clothing store", "boutique", "fashion brand"], osm: ["shop=clothes", "shop=boutique", "shop=shoes"] },
  { key: "beauty", ar: "صالونات وتجميل", en: "Beauty & Salons", termsAr: ["صالون", "مركز تجميل"], termsEn: ["beauty salon", "spa"], osm: ["shop=beauty", "shop=hairdresser", "shop=cosmetics"] },
  { key: "clinics", ar: "عيادات ومراكز طبية", en: "Clinics", termsAr: ["عيادة", "مركز طبي", "عيادة أسنان"], termsEn: ["clinic", "dental clinic", "medical center"], osm: ["amenity=clinic", "amenity=dentist", "healthcare=clinic"] },
  { key: "realestate", ar: "عقارات", en: "Real Estate", termsAr: ["شركة عقارية", "تطوير عقاري", "مشروع عقاري"], termsEn: ["real estate", "property developer"], osm: ["office=estate_agent"] },
  { key: "fitness", ar: "نوادي رياضية", en: "Gyms & Fitness", termsAr: ["نادي رياضي", "جيم"], termsEn: ["gym", "fitness club"], osm: ["leisure=fitness_centre", "leisure=sports_centre"] },
  { key: "hotels", ar: "فنادق وضيافة", en: "Hotels", termsAr: ["فندق", "شقق فندقية"], termsEn: ["hotel", "resort"], osm: ["tourism=hotel", "tourism=apartment"] },
  { key: "retail", ar: "متاجر تجزئة", en: "Retail Stores", termsAr: ["متجر", "محل"], termsEn: ["store", "retail shop"], osm: ["shop=gift", "shop=jewelry", "shop=perfumery", "shop=furniture", "shop=electronics", "shop=mobile_phone"] },
  { key: "ecommerce", ar: "متاجر إلكترونية", en: "E-commerce", termsAr: ["متجر إلكتروني", "براند سعودي", "علامة تجارية"], termsEn: ["online store", "ecommerce brand"], osm: [] },
  { key: "education", ar: "تعليم وتدريب", en: "Education & Training", termsAr: ["مركز تدريب", "معهد", "أكاديمية"], termsEn: ["training center", "academy", "institute"], osm: ["amenity=language_school", "amenity=training", "amenity=kindergarten"] },
  { key: "automotive", ar: "سيارات", en: "Automotive", termsAr: ["معرض سيارات", "مركز صيانة سيارات"], termsEn: ["car dealer", "auto service"], osm: ["shop=car", "shop=car_repair"] },
  { key: "events", ar: "تنظيم فعاليات", en: "Events", termsAr: ["تنظيم فعاليات", "قاعة أفراح"], termsEn: ["event planner", "wedding venue"], osm: ["amenity=events_venue"] },
  { key: "travel", ar: "سفر وسياحة", en: "Travel & Tourism", termsAr: ["وكالة سفر", "شركة سياحة"], termsEn: ["travel agency"], osm: ["shop=travel_agency"] },
  { key: "tech", ar: "شركات تقنية", en: "Technology", termsAr: ["شركة تقنية", "شركة برمجيات"], termsEn: ["software company", "tech startup"], osm: ["office=it", "office=company"] },
];

export function findIndustry(value: string): Industry | null {
  const v = value.trim().toLowerCase();
  return INDUSTRIES.find((i) => i.key === v || i.ar === value.trim() || i.en.toLowerCase() === v) ?? null;
}

export function industryLabel(value: string, locale: string): string {
  const i = findIndustry(value);
  return i ? (locale === "ar" ? i.ar : i.en) : value;
}

export const COUNTRIES: { en: string; ar: string; code: string }[] = [
  { en: "Saudi Arabia", ar: "السعودية", code: "SA" },
  { en: "United Arab Emirates", ar: "الإمارات", code: "AE" },
  { en: "Egypt", ar: "مصر", code: "EG" },
  { en: "Kuwait", ar: "الكويت", code: "KW" },
  { en: "Qatar", ar: "قطر", code: "QA" },
  { en: "Bahrain", ar: "البحرين", code: "BH" },
  { en: "Oman", ar: "عمان", code: "OM" },
  { en: "Jordan", ar: "الأردن", code: "JO" },
  { en: "Lebanon", ar: "لبنان", code: "LB" },
  { en: "Iraq", ar: "العراق", code: "IQ" },
  { en: "Morocco", ar: "المغرب", code: "MA" },
  { en: "Algeria", ar: "الجزائر", code: "DZ" },
  { en: "Tunisia", ar: "تونس", code: "TN" },
  { en: "Libya", ar: "ليبيا", code: "LY" },
  { en: "Turkey", ar: "تركيا", code: "TR" },
  { en: "United Kingdom", ar: "المملكة المتحدة", code: "GB" },
  { en: "United States", ar: "الولايات المتحدة", code: "US" },
];

export function findCountry(value: string) {
  const v = value.trim().toLowerCase();
  return COUNTRIES.find((c) => c.en.toLowerCase() === v || c.ar === value.trim() || c.code.toLowerCase() === v) ?? null;
}
