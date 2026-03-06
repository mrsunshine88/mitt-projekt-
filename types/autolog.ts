export type ServiceCategory = 'Service' | 'Reparation' | 'Däck' | 'Besiktning' | 'Uppgradering' | 'Ägarbyte';
export type FuelType = 'Bensin' | 'Diesel' | 'El' | 'Hybrid';
export type GearboxType = 'Manuell' | 'Automat';
export type VehicleStatus = 'private' | 'for-sale' | 'sold';
export type LogType = 'Update' | 'Correction' | 'Proposal';
export type VerificationSource = 'User' | 'AI' | 'Workshop' | 'Official';
export type PerformedBy = 'Owner' | 'Workshop';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type TrustLevel = 'Gold' | 'Silver' | 'Bronze';

export interface VehicleLog {
  id: string;
  category: ServiceCategory;
  date: string;
  systemDate: any;
  odometer: number;
  cost?: number;
  notes: string;
  isVerified: boolean;
  isLocked?: boolean;
  verificationSource?: VerificationSource;
  performedBy?: PerformedBy;
  orgNumber?: string;
  photoUrl?: string;
  creatorName?: string;
  creatorId?: string;
  ownerId?: string | null;
  type?: LogType;
  approvalStatus?: ApprovalStatus;
  createdAt: any;
  updatedAt: any;
  trustLevel?: TrustLevel;
  licensePlate: string;
  hasStoragePhoto?: boolean;
}

export interface WorkshopNotification {
  id: string;
  workshopId: string;
  type: 'approval' | 'rejection';
  status: 'approved' | 'rejected';
  plate: string;
  vehicleTitle: string;
  ownerName: string;
  ownerId: string;
  createdAt: any;
  read: boolean;
  logData?: Partial<VehicleLog>;
}

export interface Vehicle {
  id: string;
  ownerId: string | null;
  ownerName?: string; 
  ownerPhone?: string; 
  ownerEmail?: string;
  make: string;
  model: string;
  licensePlate: string;
  year: number;
  currentOdometerReading: number;
  inspectionFloorOdometer?: number; 
  nextServiceDate?: string;
  price?: number;
  description?: string;
  mainImage?: string; 
  imageUrls?: string[];
  adMainImage?: string; 
  adImageUrls?: string[]; 
  publicShareId?: string;
  isPublished?: boolean;
  status?: VehicleStatus;
  fuelType?: FuelType;
  gearbox?: GearboxType;
  hp?: number;
  color?: string;
  lastInspection?: string;
  createdAt: any;
  updatedAt?: any;
  pendingTransferTo?: string | null; 
  pendingTransferFrom?: string | null; 
  overallTrust?: TrustLevel;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  phoneNumber?: string;
  photoUrl?: string;
  userType: 'CarOwner' | 'Workshop';
  organizationNumber?: string;
  address?: string;
  website?: string;
  description?: string;
  role?: 'Huvudadmin' | 'Moderator' | 'Användare';
  createdAt: any;
  updatedAt: any;
}

export interface Conversation {
  id: string;
  participants: string[];
  participantNames: Record<string, string>;
  participantEmails?: Record<string, string>;
  buyerId: string;
  sellerId: string;
  carId: string;
  carTitle: string;
  carImageUrl: string;
  type?: 'MARKETPLACE' | 'SERVICE' | 'SUPPORT';
  lastMessage: string;
  lastMessageAt: any;
  lastMessageSenderId: string;
  unreadBy: string[];
  hiddenFrom?: string[]; 
  deletedAt?: Record<string, any>;
  updatedAt: any;
  transferCode?: string; 
}