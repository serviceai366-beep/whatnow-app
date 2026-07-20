import type { ProfileLanguage } from "./profile-types.ts";

export const supportCategories = ["question", "bug", "feature"] as const;
export const supportStatuses = ["open", "waiting_for_user", "resolved"] as const;

export type SupportCategory = (typeof supportCategories)[number];
export type SupportStatus = (typeof supportStatuses)[number];

export type SupportConversation = {
  id: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
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
};

export type SupportConversationDetail = SupportConversation & {
  messages: SupportMessage[];
};

export type SupportSnapshot = {
  isAdmin: boolean;
  conversations: SupportConversation[];
};

export type SupportAction =
  | { action: "create"; subject: string; category: SupportCategory; message: string }
  | { action: "reply"; conversationId: string; message: string }
  | { action: "set_status"; conversationId: string; status: SupportStatus };

export type SupportLocale = ProfileLanguage;
