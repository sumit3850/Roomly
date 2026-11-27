export const CONFIGURATIONS = ['1 RK', '1 BHK', '2 BHK', '3 BHK', '4 BHK', '5+ BHK', 'Single Room', 'Studio', 'Other'] as const
export type Configuration = (typeof CONFIGURATIONS)[number]

export const FURNISHING = [
  { value: 'unfurnished', label: 'Unfurnished' },
  { value: 'semi-furnished', label: 'Semi-furnished' },
  { value: 'fully-furnished', label: 'Fully furnished' },
] as const

export const PREFERRED_TENANTS = [
  { value: 'any', label: 'Anyone' },
  { value: 'family', label: 'Family' },
  { value: 'bachelors', label: 'Bachelors' },
  { value: 'working-professionals', label: 'Working professionals' },
  { value: 'students', label: 'Students' },
  { value: 'company', label: 'Company lease' },
] as const

export const ISLANDS = [
  'South Andaman', 'North & Middle Andaman', 'Havelock (Swaraj Dweep)', 'Neil (Shaheed Dweep)',
  'Little Andaman', 'Baratang', 'Long Island', 'Car Nicobar', 'Great Nicobar', 'Kamorta', 'Other',
] as const

/** Common Port Blair & island localities for quick picking (free text is still allowed). */
export const POPULAR_AREAS = [
  'Aberdeen Bazaar', 'Dollygunj', 'Junglighat', 'Garacharma', 'Bhatu Basti', 'Haddo', 'Delanipur',
  'School Line', 'Prem Nagar', 'Lamba Line', 'Bird Line', 'Shadipur', 'Calicut', 'Sippighat',
  'Austinabad', 'Brookshabad', 'Goodwill Estate', 'Phoenix Bay', 'Middle Point', 'Marine Hill',
  'Teylorabad', 'Bathu Basti', 'Pahargaon', 'Chakkargaon', 'Mayabunder', 'Rangat', 'Diglipur',
] as const

export const ACCOUNT_TYPES = [
  { value: 'tenant', label: 'Tenant / Property Seeker', description: 'Search, save and enquire about homes' },
  { value: 'owner', label: 'Property Owner / Landlord', description: 'List and manage residential property' },
  { value: 'commercial_owner', label: 'Commercial Property Owner', description: 'List shops, offices and godowns' },
] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]['value']

export const REPORT_REASONS = [
  { value: 'fraud', label: 'Suspected fraud / scam' },
  { value: 'incorrect-info', label: 'Incorrect information' },
  { value: 'already-rented', label: 'Already rented' },
  { value: 'duplicate', label: 'Duplicate listing' },
  { value: 'offensive', label: 'Offensive content' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Other' },
] as const

/** Port Blair centre — default map view */
export const DEFAULT_CENTER: [number, number] = [11.6234, 92.7265]
export const MAX_IMAGES = 12
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
