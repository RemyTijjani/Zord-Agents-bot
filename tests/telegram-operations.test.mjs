import test from "node:test";
import assert from "node:assert/strict";
import {
  canRunTelegramModule,
  getTelegramUpdateChat,
  getTelegramUpdateType,
  isTelegramOwnershipChange,
  resolveBotPermissions,
} from "../api/_lib/telegram-operations.mjs";

test("group admin permissions separate moderation from message sending", () => {
  const permissions = resolveBotPermissions("supergroup", { status: "administrator", can_delete_messages: false });
  assert.equal(permissions.is_admin, true);
  assert.equal(permissions.can_send_messages, true);
  assert.equal(canRunTelegramModule("sentinel", "supergroup", permissions), false);
  assert.equal(canRunTelegramModule("poly_shield", "supergroup", permissions), true);
  assert.equal(canRunTelegramModule("omini_glitch", "supergroup", permissions), true);
});

test("channel admin must have post permission for response-producing agents", () => {
  const permissions = resolveBotPermissions("channel", { status: "administrator", can_post_messages: true });
  assert.equal(canRunTelegramModule("sentinel", "channel", permissions), false);
  assert.equal(canRunTelegramModule("poly_shield", "channel", permissions), true);
  assert.equal(canRunTelegramModule("omini_glitch", "channel", permissions), true);
});

test("channel admin without post permission cannot run response-producing agents", () => {
  const permissions = resolveBotPermissions("channel", { status: "administrator", can_delete_messages: true });
  assert.equal(canRunTelegramModule("sentinel", "channel", permissions), true);
  assert.equal(canRunTelegramModule("poly_shield", "channel", permissions), false);
});

test("removed and non-admin bots have no module capabilities", () => {
  const removed = resolveBotPermissions("supergroup", { status: "left", can_delete_messages: true });
  assert.equal(canRunTelegramModule("sentinel", "supergroup", removed), false);
  assert.equal(canRunTelegramModule("poly_shield", "supergroup", removed), false);
  assert.equal(resolveBotPermissions("supergroup", { status: "member" }).is_admin, false);
});

test("Telegram update routing includes ownership changes and edited posts", () => {
  const update = { chat_member: { chat: { id: "-100123", type: "supergroup" }, old_chat_member: { status: "administrator" }, new_chat_member: { status: "creator" } } };
  assert.equal(getTelegramUpdateType(update), "chat_member");
  assert.deepEqual(getTelegramUpdateChat(update), { id: "-100123", type: "supergroup" });
  assert.equal(isTelegramOwnershipChange(update), true);
  assert.equal(getTelegramUpdateType({ edited_channel_post: { chat: { id: "-100456" } } }), "edited_channel_post");
  assert.equal(isTelegramOwnershipChange({ chat_member: { old_chat_member: { status: "member" }, new_chat_member: { status: "administrator" } } }), false);
});
