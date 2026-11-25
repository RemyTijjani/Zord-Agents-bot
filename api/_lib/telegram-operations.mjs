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

export function resolveBotPermissions(chatType: string, member: TelegramPermissionMember): TelegramPermissionSnapshot {
  const creator = member?.status === "creator";
  const isAdmin = creator || member?.status === "administrator";
  const canDelete = isAdmin && (creator || member?.can_delete_messages === true);
  const canPost = isAdmin && (creator || member?.can_post_messages === true);
  const canSend = isAdmin && (
    chatType === "group" || chatType === "supergroup" || (chatType === "channel" && canPost)
  );
  return {
    is_admin: isAdmin,
    can_delete_messages: canDelete,
    can_post_messages: canPost,
    can_send_messages: canSend,
    can_manage_chat: isAdmin && (creator || member?.can_manage_chat === true),
    can_restrict_members: isAdmin && (creator || member?.can_restrict_members === true),
  };
}

export function canRunTelegramModule(moduleKey: string, chatType: string, permissions: any): boolean {
  if (permissions?.is_admin !== true) return false;
  if (moduleKey === "sentinel") return permissions.can_delete_messages === true;
  if (moduleKey === "poly_shield" || moduleKey === "omini_glitch") return permissions.can_send_messages === true;
  return false;
}

export function getTelegramUpdateType(update: any): string {
  if (update?.my_chat_member) return "my_chat_member";
  if (update?.chat_member) return "chat_member";
  if (update?.message) return "message";
  if (update?.edited_message) return "edited_message";
  if (update?.channel_post) return "channel_post";
  if (update?.edited_channel_post) return "edited_channel_post";
  return "unknown";
}

export function getTelegramUpdateChat(update: any): any {
  return update?.my_chat_member?.chat
    ?? update?.chat_member?.chat
    ?? update?.message?.chat
    ?? update?.edited_message?.chat
    ?? update?.channel_post?.chat
    ?? update?.edited_channel_post?.chat;
}

export function isTelegramOwnershipChange(update: any): boolean {
  const event = update?.chat_member ?? update;
  return event?.old_chat_member?.status === "creator" || event?.new_chat_member?.status === "creator";
}
