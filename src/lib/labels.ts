// Bilingual labels for enumerations and machine reason codes.
export type L = { ar: string; en: string };
const l = (ar: string, en: string): L => ({ ar, en });

export const STATUS_LABEL: Record<string, L> = {
  NEW: l("جديد", "New"), QUALIFIED: l("مؤهل", "Qualified"), MESSAGE_READY: l("الرسالة جاهزة", "Message Ready"),
  CONTACT_OPENED: l("فُتحت جهة الاتصال", "Contact Opened"), SENT_MANUALLY: l("أُرسلت يدوياً", "Sent Manually"),
  REPLIED: l("تم الرد", "Replied"), INTERESTED: l("مهتم", "Interested"), NOT_INTERESTED: l("غير مهتم", "Not Interested"),
  FOLLOW_UP: l("متابعة", "Follow-up"), CONVERTED: l("تحوّل إلى عميل", "Converted"), DO_NOT_CONTACT: l("لا تتواصل", "Do Not Contact"),
};

export const VERIFICATION_LABEL: Record<string, L> = {
  VERIFIED: l("موثّق", "Verified"), LIKELY: l("مرجّح", "Likely"), UNVERIFIED: l("غير موثّق", "Unverified"),
};

export const PRIORITY_LABEL: Record<string, L> = {
  HIGH: l("أولوية عالية", "High Priority"), MEDIUM: l("أولوية متوسطة", "Medium Priority"), LOW: l("أولوية منخفضة", "Low Priority"),
};

export const CONFIDENCE_LABEL: Record<string, L> = { HIGH: l("ثقة عالية", "High confidence"), MEDIUM: l("ثقة متوسطة", "Medium confidence"), LOW: l("ثقة منخفضة", "Low confidence") };

export const CAMPAIGN_STATUS_LABEL: Record<string, L> = {
  DRAFT: l("مسودة", "Draft"), RUNNING: l("قيد التشغيل", "Running"), PAUSED: l("متوقفة مؤقتاً", "Paused"),
  COMPLETED: l("اكتملت", "Completed"), FAILED: l("فشلت", "Failed"),
};

export const SCHEDULE_LABEL: Record<string, L> = { MANUAL: l("يدوي", "Manual"), DAILY: l("يومي", "Daily"), WEEKLY: l("أسبوعي", "Weekly") };
export const ROLE_LABEL: Record<string, L> = { ADMIN: l("مدير النظام", "Admin"), MANAGER: l("مدير", "Manager"), EMPLOYEE: l("موظف", "Employee") };
export const JOB_STATUS_LABEL: Record<string, L> = { PENDING: l("في الانتظار", "Pending"), RUNNING: l("قيد التنفيذ", "Running"), DONE: l("تمت", "Done"), FAILED: l("فشلت", "Failed"), CANCELLED: l("أُلغيت", "Cancelled") };
export const JOB_TYPE_LABEL: Record<string, L> = { SEARCH: l("بحث", "Search"), ENRICH: l("تحقق وإثراء", "Verify & enrich"), ANALYZE: l("تحليل ذكي", "AI analysis") };

export const FACTOR_LABEL: Record<string, L> = {
  businessFit: l("ملاءمة النشاط", "Business Fit"), opportunity: l("قوة الفرصة", "Opportunity Strength"),
  contact: l("توفر جهة اتصال موثّقة", "Verified Contact Availability"), marketing: l("النشاط التسويقي", "Marketing Activity"), freshness: l("حداثة المعلومات", "Information Freshness"),
};

export const REASON_LABEL: Record<string, L> = {
  FIT_AI_ASSESSED: l("قيّمها الذكاء الاصطناعي بناءً على المصادر", "Assessed by AI from the sources"),
  FIT_INDUSTRY_MATCH: l("المجال يطابق مجال الحملة", "Industry matches the campaign"),
  FIT_INDUSTRY_UNKNOWN: l("لم يتأكد تطابق المجال", "Industry match not confirmed"),
  FIT_HAS_DESCRIPTION: l("يتوفر وصف للنشاط", "A business description is available"),
  FIT_VERIFIED_BUSINESS: l("هوية النشاط موثّقة", "Business identity is verified"),
  FIT_LIKELY_BUSINESS: l("هوية النشاط مرجّحة", "Business identity is likely"),
  FIT_RULES_ONLY: l("تقييم بالقواعد فقط (لم يُفعَّل الذكاء الاصطناعي)", "Rule-based only (AI not configured)"),
  OPP_NO_EVIDENCE: l("لا يوجد دليل على فرصة حالياً", "No evidence of an opportunity yet"),
  OPP_SIGNALS_ONE: l("إشارة فرصة واحدة بدليل", "One evidenced opportunity signal"),
  OPP_SIGNALS_MANY: l("عدة إشارات فرص بأدلة", "Several evidenced opportunity signals"),
  CONTACT_WHATSAPP: l("رقم واتساب له مصدر", "WhatsApp number with a source"),
  CONTACT_VERIFIED_SOCIAL: l("حسابات مرتبطة من الموقع الرسمي", "Accounts linked from the official website"),
  CONTACT_UNVERIFIED_SOCIAL: l("حسابات من نتائج البحث فقط", "Accounts from search results only"),
  CONTACT_WEBSITE: l("يوجد موقع رسمي", "Has an official website"),
  CONTACT_PHONE: l("يوجد رقم هاتف", "Has a phone number"),
  CONTACT_NONE: l("لا توجد وسيلة تواصل", "No contact channel found"),
  MARKETING_PLATFORMS_0: l("لا حسابات تواصل معروفة", "No known social accounts"),
  MARKETING_PLATFORMS_1: l("حاضر على منصة واحدة", "Present on one platform"),
  MARKETING_PLATFORMS_2: l("حاضر على منصتين", "Present on two platforms"),
  MARKETING_PLATFORMS_3: l("حاضر على ثلاث منصات أو أكثر", "Present on three or more platforms"),
  FRESH_WEEK: l("فُحص خلال آخر 7 أيام", "Checked within the last 7 days"),
  FRESH_MONTH: l("فُحص خلال آخر 30 يوماً", "Checked within the last 30 days"),
  FRESH_QUARTER: l("فُحص خلال آخر 90 يوماً", "Checked within the last 90 days"),
  FRESH_STALE: l("معلومات قديمة، أعد الفحص", "Stale information — re-check"),
};

export const VERIFY_NOTE_LABEL: Record<string, L> = {
  WEBSITE_NAME_MATCH: l("اسم النشاط يطابق ما في موقعه الرسمي", "Name matches its official website"),
  WEBSITE_NAME_MISMATCH: l("الاسم لا يطابق عنوان الموقع", "Name does not match the website title"),
  WEBSITE_NOT_FETCHED: l("تعذرت قراءة الموقع", "The website could not be read"),
  NO_WEBSITE: l("لا يوجد موقع رسمي معروف", "No known official website"),
  SOCIALS_LINKED_FROM_WEBSITE: l("الحسابات مرتبطة من الموقع الرسمي", "Accounts are linked from the official website"),
  OSM_RECORD: l("مسجّل في خرائط OpenStreetMap", "Listed on OpenStreetMap"),
  MULTIPLE_SOURCES: l("ظهر في أكثر من مصدر مستقل", "Found in more than one independent source"),
  SOCIALS_FROM_SEARCH_ONLY: l("الحسابات من نتائج البحث ولم تؤكَّد من موقع رسمي", "Accounts come from search results, not confirmed by an official site"),
  SITE_ROBOTS_DISALLOWED: l("الموقع يمنع القراءة الآلية (robots.txt) فلم نقرأه", "The site disallows automated reading (robots.txt), so it was not read"),
};

export const NOTE_LABEL: Record<string, L> = {
  NO_WEB_PROVIDER: l("لا يوجد مزود بحث ويب مفعّل: البحث في إنستغرام والأخبار يتطلب إعداداً", "No web-search provider enabled: Instagram and news discovery is CONFIGURATION REQUIRED"),
  OSM_INDUSTRY_UNSUPPORTED: l("هذا المجال غير متاح في الخرائط المفتوحة", "This industry is not available on OpenStreetMap"),
  OSM_COUNTRY_UNSUPPORTED: l("هذه الدولة غير معرّفة للخرائط المفتوحة", "This country is not mapped for OpenStreetMap"),
  OSM_CITY_REQUIRED: l("الخرائط المفتوحة تحتاج اسم مدينة", "OpenStreetMap needs a city name"),
  NO_WEB_PROVIDER_OR_QUOTA_REACHED: l("لا يوجد مزود بحث متاح أو انتهت حصته الشهرية. يتطلب إعداداً.", "No search provider is available, or its monthly allowance is used up. CONFIGURATION REQUIRED."),
  QUOTA_REACHED: l("بلغ المزود حده الشهري الذي حددته.", "The provider reached the monthly limit you set."),
  PROVIDER_DISABLED: l("المزود معطّل.", "The provider is disabled."),
  NO_PROVIDER_AVAILABLE: l("لا يوجد أي مزود بحث صالح لهذه الحملة. يتطلب إعداداً.", "No usable search provider for this campaign. CONFIGURATION REQUIRED."),
};

export const SKIP_LABEL: Record<string, L> = {
  TARGET_REACHED: l("تم بلوغ العدد المطلوب", "Target count reached"),
  RECENTLY_EXECUTED: l("نُفّذ هذا البحث مؤخراً، لم يُكرَّر لتوفير الحصة", "Run recently — not repeated, to save quota"),
  QUOTA_REACHED: l("بلغ المزود حده الشهري", "Provider reached its monthly limit"),
  NO_WEB_PROVIDER_OR_QUOTA_REACHED: l("لا يوجد مزود بحث ويب متاح أو انتهت الحصة", "No web provider available or quota reached"),
  PROVIDER_DISABLED: l("المزود معطّل", "Provider disabled"),
  AI_NOT_CONFIGURED_OR_LIMIT_REACHED: l("الذكاء الاصطناعي غير مفعّل أو بلغ حده", "AI not configured or limit reached"),
  AI_LIMIT_REACHED: l("بلغ الذكاء الاصطناعي حده الشهري", "AI monthly limit reached"),
  CAMPAIGN_DELETED: l("حُذفت الحملة", "Campaign deleted"), LEAD_GONE: l("العميل لم يعد موجوداً", "Lead no longer exists"),
};

export const PROVIDER_STATUS_LABEL: Record<string, L> = {
  OK: l("يعمل", "Working"), UNTESTED: l("لم يُختبر", "Not tested"), AUTH_ERROR: l("المفتاح غير صالح", "Invalid key"),
  QUOTA_EXHAUSTED: l("انتهت الحصة", "Quota exhausted"), ERROR: l("خطأ", "Error"), NOT_CONFIGURED: l("يتطلب إعداداً", "CONFIGURATION REQUIRED"),
};

export const STYLE_LABEL: Record<string, L> = {
  "ar-sa": l("عربي سعودي", "Saudi Arabic"), "ar-eg": l("عربي مصري", "Egyptian Arabic"), "ar-formal": l("عربي فصيح رسمي", "Formal Arabic"),
  "ar-pro": l("عربي مهني مبسّط", "Professional conversational Arabic"), en: l("إنجليزي", "English"),
};
export const LENGTH_LABEL: Record<string, L> = { short: l("قصيرة", "Short"), medium: l("متوسطة", "Medium"), detailed: l("مفصّلة", "Detailed") };

export const pick = (map: Record<string, L>, key: string, locale: string) => map[key]?.[locale === "en" ? "en" : "ar"] ?? key;
