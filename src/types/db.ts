import type { AccountType, Configuration } from '@/lib/constants'

export type AppRole = 'tenant' | 'owner' | 'commercial_owner' | 'admin'
export type PropertyStatus = 'draft' | 'active' | 'rented' | 'inactive'
export type EnquiryStatus = 'new' | 'responded' | 'closed'

export interface NotificationPrefs {
  enquiries: boolean
  enquiry_responses: boolean
  recommendations: boolean
  marketing: boolean
}

export interface Profile {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  avatar_url: string | null
  account_type: AccountType
  preferred_location: string | null
  bio: string | null
  verification_status: 'unverified' | 'pending' | 'verified' | 'rejected'
  notification_prefs: NotificationPrefs
  is_suspended: boolean
  created_at: string
  updated_at: string
}

export interface Category { id: string; slug: string; name: string; is_commercial: boolean; sort_order: number }
export interface Amenity { id: string; slug: string; name: string; icon: string | null }

export interface Property {
  id: string
  owner_id: string
  category_id: string | null
  title: string
  description: string | null
  configuration: Configuration
  is_commercial: boolean
  furnishing: 'unfurnished' | 'semi-furnished' | 'fully-furnished'
  rent_amount: number
  security_deposit: number
  maintenance_fee: number
  area_sqft: number | null
  bathrooms: number | null
  floor_label: string | null
  available_from: string | null
  preferred_tenants: string
  contact_name: string | null
  contact_phone: string | null
  status: PropertyStatus
  is_verified: boolean
  is_featured: boolean
  views_count: number
  rented_at: string | null
  created_at: string
  updated_at: string
}

/** Row of the property_listings view */
export interface Listing extends Property {
  category_name: string | null
  category_slug: string | null
  island: string | null
  area: string | null
  address_line: string | null
  landmark: string | null
  pincode: string | null
  latitude: number | null
  longitude: number | null
  cover_path: string | null
  image_count: number
  avg_rating: number | null
  review_count: number
}

export interface PropertyImage { id: string; property_id: string; storage_path: string; sort_order: number; is_cover: boolean; created_at: string }
export interface PropertyLocation {
  id: string; property_id: string; island: string; area: string; address_line: string | null
  landmark: string | null; pincode: string | null; latitude: number | null; longitude: number | null
}

export interface Enquiry {
  id: string
  property_id: string
  tenant_id: string
  owner_id: string
  message: string
  contact_phone: string | null
  preferred_visit_date: string | null
  status: EnquiryStatus
  owner_response: string | null
  responded_at: string | null
  created_at: string
  updated_at: string
}

export interface Review {
  id: string; property_id: string; reviewer_id: string; rating: number; comment: string | null
  is_verified_tenant: boolean; created_at: string
}

export interface PublicProfile { id: string; full_name: string; avatar_url: string | null; is_verified: boolean }

export interface NotificationRow {
  id: string; user_id: string; type: string; title: string; body: string | null; link: string | null; is_read: boolean; created_at: string
}

export interface Publication {
  id: string; name: string; newspaper: string; edition_date: string; pdf_path: string | null
  page_count: number | null; status: 'uploaded' | 'processing' | 'processed' | 'failed'; created_at: string
}

export interface Advertisement {
  id: string; publication_id: string; ad_type: 'tolet' | 'sale' | 'wanted' | 'commercial' | 'other'
  configuration: string | null; location_text: string | null; phones: string[]; rent_text: string | null
  raw_text: string | null; is_commercial: boolean; is_furnished: boolean; page_number: number | null
  linked_property_id: string | null; created_at: string
}

export interface UserReport {
  id: string; reporter_id: string | null; reporter_email: string | null; reporter_name: string | null
  property_id: string | null; reported_user_id: string | null; reason: string; details: string | null
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed'; admin_notes: string | null; created_at: string; resolved_at: string | null
}

export interface RentalTransaction {
  id: string; property_id: string; owner_id: string; tenant_id: string | null; tenant_name: string | null
  monthly_rent: number; security_deposit: number; start_date: string; end_date: string | null
  status: 'active' | 'ended' | 'cancelled'; created_at: string
}
