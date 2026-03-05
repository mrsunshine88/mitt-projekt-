export type ServiceCategory = 'Service' | 'Reparation' | 'Däck' | 'Besiktning' | 'Uppgradering';
export type FuelType = 'Bensin' | 'Diesel' | 'El' | 'Hybrid';
export type GearboxType = 'Manuell' | 'Automat';
export type VehicleStatus = 'private' | 'for-sale' | 'sold';
export type LogType = 'Update' | 'Correction';
export type VerificationSource = 'User' | 'AI' | 'Workshop' | 'Official';
export type PerformedBy = 'Owner' | 'Workshop';

export interface VehicleLog {
  id: string;
  category: ServiceCategory;
  date: string;
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
  type?: LogType;
  licensePlateMatch?: boolean;
  aiMetadata?: {
    manipulationRisk?: 'low' | 'medium' | 'high';
    confidence?: number;
    extractedPlate?: string;
  };
}

export interface Vehicle {
  id: string;
  ownerId: string;
  ownerName?: string; 
  ownerPhone?: string; 
  make: string;
  model: string;
  licensePlate: string;
  year: number;
  currentOdometerReading: number;
  inspectionFloorOdometer?: number; // The latest official inspection value
  nextServiceDate?: string;
  price?: number;
  description?: string;
  imageUrl?: string;
  mainImage?: string; 
  imageUrls?: string[];
  publicShareId?: string;
  hasVerifiedHistory?: boolean;
  isPublished?: boolean;
  status?: VehicleStatus;
  fuelType?: FuelType;
  gearbox?: GearboxType;
  lastInspection?: string;
  tires?: string;
  createdAt: any;
  updatedAt?: any;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  phoneNumber?: string;
  photoUrl?: string;
  userType: 'CarOwner' | 'Workshop';
  organizationNumber?: string;
  createdAt: any;
  updatedAt: any;
}

export interface Conversation {
  id: string;
  participants: string[];
  participantNames: Record<string, string>;
  participantEmails?: Record<string, string>;
  carId: string;
  carTitle: string;
  carImageUrl: string;
  lastMessage: string;
  lastMessageAt: any;
  lastMessageSenderId: string;
  unreadBy: string[];
  hiddenFor?: string[];
  updatedAt: any;
  transferCode?: string; 
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: any;
  read: boolean;
}