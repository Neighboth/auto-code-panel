export type ActionResult<T = undefined> = {
  ok: boolean;
  message?: string;
  data?: T;
  redirectTo?: string;
  needs2fa?: boolean;
  methods?: { totp: boolean; passkey: boolean; question: boolean; email?: boolean };
  /** Registration / sign-in is waiting for the e-mailed 6-digit code. */
  needsEmailVerification?: boolean;
  verificationId?: number;
  verificationEmail?: string;
};

export type SteamPreview = {
  appId: string;
  title: string;
  headerImage: string;
  shortDescription: string;
  originalPrice: number | null;
  currency: string;
  sourceCurrency?: string;
  sourcePrice?: number | null;
};

export type AssignableGame = {
  id: number;
  title: string;
  coverImage: string;
  ourPrice: string;
  originalPrice: string | null;
};

export type CodePreviewItem = {
  kind: "game" | "account";
  id: number;
  title: string;
  subtitle: string;
  coverImage: string;
};

export type CodePreview = {
  code: string;
  type: "choice" | "single" | "bundle";
  choiceCount: number;
  durationMinutes: number | null;
  durationLabel: string;
  items: CodePreviewItem[];
  selectableGames: AssignableGame[];
  requiresAuth: boolean;
};

export type DeliveredItem = {
  entitlementId: number;
  title: string;
  subtitle: string;
  kind: "game" | "account";
  username: string | null;
  email: string | null;
  password: string | null;
  platformLabel: string;
  guardType: string;
  mailEmail: string | null;
  mailPassword: string | null;
  notes: string;
  expiresAt: string | null;
  coverImage: string;
  accessToken?: string;
};

export type RedeemResult = {
  code: string;
  expiresAt: string | null;
  guest: boolean;
  guestToken: string | null;
  items: DeliveredItem[];
};
