import type { ProfileLanguage } from "./profile-types.ts";

export const supportCategories = ["question", "bug", "feature"] as const;
export const supportStatuses = ["open", "waiting_for_user", "resolved"] as const;
export const supportPriorities = ["low", "normal", "high", "urgent"] as const;

export type SupportCategory = (typeof supportCategories)[number];
export type SupportStatus = (typeof supportStatuses)[number];
export type SupportPriority = (typeof supportPriorities)[number];

export type SupportAttachment = {
  id: string;
  name: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
  createdAt: number;
};

export type SupportConversation = {
  id: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  priority: SupportPriority;
  createdAt: number;
  updatedAt: number;
  lastMessageAt: number;
  lastMessagePreview: string | null;
  ownerReference: string | null;
};

export type SupportMessage = {
  id: string;
  sender: "user" | "support";
  body: string;
  createdAt: number;
  attachments: SupportAttachment[];
};

export type SupportConversationDetail = SupportConversation & {
  messages: SupportMessage[];
};

export type SupportSnapshot = {
  isAdmin: boolean;
  emailNotificationsEnabled: boolean;
  conversations: SupportConversation[];
};

export type SupportAction =
  | { action: "create"; subject: string; category: SupportCategory; message: string; locale: SupportLocale }
  | { action: "reply"; conversationId: string; message: string; locale: SupportLocale }
  | { action: "set_status"; conversationId: string; status: SupportStatus }
  | { action: "set_priority"; conversationId: string; priority: SupportPriority };

export type SupportLocale = ProfileLanguage;
