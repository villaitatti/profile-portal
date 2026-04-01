export type LoginMethod = 'vit-id' | 'harvard-key';

export interface Application {
  id: number;
  name: string;
  description?: string;
  url: string;
  imageUrl?: string;
  loginMethod: LoginMethod;
  requiredRoles: string[];
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateApplicationInput {
  name: string;
  description?: string;
  url: string;
  imageUrl?: string;
  loginMethod: LoginMethod;
  requiredRoles: string[];
  sortOrder?: number;
}

export interface UpdateApplicationInput {
  name?: string;
  description?: string;
  url?: string;
  imageUrl?: string;
  loginMethod?: LoginMethod;
  requiredRoles?: string[];
  sortOrder?: number;
  isActive?: boolean;
}
