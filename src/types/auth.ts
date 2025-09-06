export interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  date_of_birth?: string;
  fuel_capacity_km?: number;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  user: User;
}

export interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  signIn: (provider: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  emailSignUp: (email: string, password: string, name?: string) => Promise<boolean>;
  emailLogin: (email: string, password: string) => Promise<boolean>;
  storeSession: (session: Session) => Promise<void>;
  clearSession: () => Promise<void>;
}
