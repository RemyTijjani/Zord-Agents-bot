export type TelegramPermissionMember = {
  status?: string;
  can_delete_messages?: boolean;
  can_post_messages?: boolean;
  can_manage_chat?: boolean;
  can_restrict_members?: boolean;
};
export type TelegramPermissionSnapshot = {
  is_admin: boolean;
  can_delete_messages: boolean;
  can_post_messages: boolean;
  can_send_messages: boolean;
  can_manage_chat: boolean;
  can_restrict_members: boolean;
};
export function resolveBotPermissions(chatType: string, member: TelegramPermissionMember): TelegramPermissionSnapshot;
export function canRunTelegramModule(moduleKey: string, chatType: string, permissions: Partial<TelegramPermissionSnapshot> | null | undefined): boolean;
export function getTelegramUpdateType(update: any): string;
export function getTelegramUpdateChat(update: any): any;
export function isTelegramOwnershipChange(update: any): boolean;
