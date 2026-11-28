import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { violatesContentSetting } from './content-moderation.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const appUrl = (process.env.APP_URL || `http://localhost:${port}`).replace(/\/$/, '');
const dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(dirname, 'public');
const uploadsDir = path.join(dirname, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const database = new DatabaseSync(path.join(dirname, 'messaging.sqlite'));
const scrypt = promisify(crypto.scrypt);
const sessionLifetime = 30 * 24 * 60 * 60;
const cookieName = 'pichat_session';

database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    profile_picture TEXT,
    content_setting TEXT CHECK(content_setting IS NULL OR content_setting IN ('7+', '10+', '13+', '16+', 'adult')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS invitations (
    id INTEGER PRIMARY KEY,
    inviter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invitee_name TEXT NOT NULL,
    invitee_email TEXT NOT NULL COLLATE NOCASE,
    token_hash TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'declined')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,
    invitation_id INTEGER NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    attachment_name TEXT,
    attachment_type TEXT,
    attachment_path TEXT,
    attachment_url TEXT,
    reply_to_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
    deleted_at TEXT,
    deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS message_reactions (
    id INTEGER PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji TEXT,
    gif_url TEXT,
    gif_preview TEXT,
    gif_name TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS reactions_by_message ON message_reactions(message_id);
  CREATE INDEX IF NOT EXISTS messages_by_invitation ON messages(invitation_id, id);
  CREATE TABLE IF NOT EXISTS chat_preferences (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    background_image TEXT,
    background_color TEXT CHECK(background_color IS NULL OR background_color IN ('red', 'blue', 'green', 'turquoise', 'pink', 'black', 'brown', 'orange')),
    font_family TEXT NOT NULL DEFAULT 'DM Sans',
    font_data TEXT,
    PRIMARY KEY (user_id, contact_id)
  );
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS one_invitation_per_email
    ON invitations(inviter_id, invitee_email COLLATE NOCASE);
`);

for (const [column, type] of [['attachment_name', 'TEXT'], ['attachment_type', 'TEXT'], ['attachment_path', 'TEXT'], ['attachment_url', 'TEXT'], ['reply_to_message_id', 'INTEGER'], ['deleted_at', 'TEXT'], ['deleted_by', 'INTEGER']]) {
  if (!database.prepare('PRAGMA table_info(messages)').all().some((item) => item.name === column)) {
    database.exec(`ALTER TABLE messages ADD COLUMN ${column} ${type}`);
  }
}

if (!database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='message_reactions'").get()) {
  database.exec(`
    CREATE TABLE message_reactions (
      id INTEGER PRIMARY KEY,
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT,
      gif_url TEXT,
      gif_preview TEXT,
      gif_name TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(message_id, user_id)
    );
    CREATE INDEX reactions_by_message ON message_reactions(message_id);
  `);
}

if (!database.prepare('PRAGMA table_info(chat_preferences)').all().some((column) => column.name === 'background_color')) {
  database.exec('ALTER TABLE chat_preferences ADD COLUMN background_color TEXT');
}
if (!database.prepare('PRAGMA table_info(chat_preferences)').all().some((column) => column.name === 'font_family')) {
  database.exec("ALTER TABLE chat_preferences ADD COLUMN font_family TEXT NOT NULL DEFAULT 'DM Sans'");
}
if (!database.prepare('PRAGMA table_info(chat_preferences)').all().some((column) => column.name === 'font_data')) {
  database.exec('ALTER TABLE chat_preferences ADD COLUMN font_data TEXT');
}

if (!database.prepare('PRAGMA table_info(users)').all().some((column) => column.name === 'theme')) {
  database.exec("ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'light' CHECK(theme IN ('light', 'dark'))");
}
if (!database.prepare('PRAGMA table_info(users)').all().some((column) => column.name === 'content_setting')) {
  database.exec("ALTER TABLE users ADD COLUMN content_setting TEXT CHECK(content_setting IS NULL OR content_setting IN ('7+', '10+', '13+', '16+', 'adult'))");
}

database.exec(`
  CREATE TABLE IF NOT EXISTS group_chats (
    id INTEGER PRIMARY KEY,
    creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    profile_picture TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS group_members (
    group_id INTEGER NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS group_invites (
    id INTEGER PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
    inviter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invitee_name TEXT NOT NULL,
    invitee_email TEXT NOT NULL COLLATE NOCASE,
    token_hash TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'declined')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS group_messages (
    id INTEGER PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    attachment_name TEXT,
    attachment_type TEXT,
    attachment_path TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS group_messages_by_group ON group_messages(group_id, id);
  CREATE TABLE IF NOT EXISTS group_chat_preferences (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id INTEGER NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
    background_image TEXT,
    background_color TEXT CHECK(background_color IS NULL OR background_color IN ('red', 'blue', 'green', 'turquoise', 'pink', 'black', 'brown', 'orange')),
    font_family TEXT NOT NULL DEFAULT 'DM Sans',
    font_data TEXT,
    PRIMARY KEY (user_id, group_id)
  );
`);

if (!database.prepare('PRAGMA table_info(group_messages)').all().some((column) => column.name === 'attachment_url')) {
  database.exec('ALTER TABLE group_messages ADD COLUMN attachment_url TEXT');
}
for (const [column, type] of [['reply_to_message_id', 'INTEGER'], ['deleted_by', 'INTEGER']]) {
  if (!database.prepare('PRAGMA table_info(group_messages)').all().some((item) => item.name === column)) {
    database.exec(`ALTER TABLE group_messages ADD COLUMN ${column} ${type}`);
  }
}
if (!database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='group_message_reactions'").get()) {
  database.exec(`
    CREATE TABLE group_message_reactions (
      id INTEGER PRIMARY KEY,
      message_id INTEGER NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT,
      gif_url TEXT,
      gif_preview TEXT,
      gif_name TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(message_id, user_id)
    );
    CREATE INDEX group_reactions_by_message ON group_message_reactions(message_id);
  `);
}

const builtInChatFonts = new Set([
  'DM Sans', 'Playfair Display', 'Montserrat', 'Poppins', 'Lora', 'Merriweather', 'Oswald',
  'Bebas Neue', 'Anton', 'Nunito', 'Raleway', 'Libre Baskerville', 'Cormorant Garamond',
  'Manrope', 'Roboto', 'Open Sans', 'Lato', 'Source Serif 4', 'Archivo', 'Work Sans',
  'Space Grotesk', 'Josefin Sans', 'Barlow Condensed', 'Abril Fatface', 'DM Serif Display'
]);
const chatPaletteColors = new Set(['red', 'blue', 'green', 'turquoise', 'pink', 'black', 'brown', 'orange']);

function validateChatFontInput(family, fontData) {
  const validFamily = /^[\p{L}\p{N} _-]{1,64}$/u.test(family);
  const validFontData = typeof fontData === 'string'
    && fontData.length <= 2_800_000
    && /^data:font\/(woff2?|ttf|otf);base64,[A-Za-z0-9+/]+={0,2}$/.test(fontData);
  if (!validFamily) return false;
  if (fontData !== null && fontData !== undefined && !validFontData) return false;
  return builtInChatFonts.has(family) || validFontData;
}

function syncGroupMemberships(userId, email) {
  const invites = database.prepare(`
    SELECT group_id FROM group_invites
    WHERE invitee_email = ? COLLATE NOCASE AND status = 'accepted'
  `).all(email);
  const insert = database.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)');
  for (const invite of invites) insert.run(invite.group_id, userId);
}

function isGroupMember(groupId, userId) {
  return Boolean(database.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId));
}

function getGroupMessageAccess(messageId, userId) {
  return database.prepare(`
    SELECT gm.id, gm.sender_id, gm.group_id, gm.attachment_path
    FROM group_messages gm
    JOIN group_members gm_mem ON gm_mem.group_id = gm.group_id AND gm_mem.user_id = ?
    WHERE gm.id = ?
  `).get(userId, messageId);
}

function listGroupMessageReactions(messageId) {
  return database.prepare(`
    SELECT user_id, emoji, gif_url, gif_preview, gif_name
    FROM group_message_reactions WHERE message_id = ? ORDER BY id
  `).all(messageId).map((row) => ({
    user_id: row.user_id,
    emoji: row.emoji,
    gif_url: row.gif_url,
    gif_preview: row.gif_preview,
    gif_name: row.gif_name
  }));
}

function joinGroupInviteIfReady(tokenHash) {
  const invite = database.prepare(`
  SELECT group_id, invitee_email FROM group_invites WHERE token_hash = ? AND status = 'accepted'
  `).get(tokenHash);
  if (!invite) return;
  const user = database.prepare('SELECT id FROM users WHERE email = ?').get(invite.invitee_email);
  if (user) {
    database.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)').run(invite.group_id, user.id);
  }
}

function joinGroupInviteById(inviteId) {
  const invite = database.prepare(`
    SELECT group_id, invitee_email FROM group_invites WHERE id = ? AND status = 'accepted'
  `).get(inviteId);
  if (!invite) return;
  const user = database.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(invite.invitee_email);
  if (user) {
    database.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)').run(invite.group_id, user.id);
  }
}

function userWithEmailExists(email) {
  return Boolean(database.prepare('SELECT 1 FROM users WHERE email = ? COLLATE NOCASE').get(email));
}

function loginUrlWithInvite(token) {
  return `${appUrl}/?auth=login&invite=${encodeURIComponent(token)}`;
}

const resendApiKey = process.env.RESEND_API_KEY;
const mailFrom = process.env.MAIL_FROM || 'PiChat <onboarding@resend.dev>';

app.use(express.json({ limit: '4mb' }));

const messageUpload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_request, _file, callback) => callback(null, crypto.randomUUID())
  }),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  fileFilter: (_request, _file, callback) => callback(null, true)
});

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function readCookie(request, name) {
  const cookie = request.headers.cookie?.split(';').find((part) => part.trim().startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.trim().slice(name.length + 1)) : null;
}

function setSessionCookie(response, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionLifetime}${secure}`);
}

function clearSessionCookie(response) {
  response.setHeader('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function getCurrentUser(request) {
  const token = readCookie(request, cookieName);
  if (!token) return null;
  const session = database.prepare(`
    SELECT users.id, users.name, users.email, users.profile_picture, users.theme, users.content_setting
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(hashToken(token), Math.floor(Date.now() / 1000));
  return session || null;
}

function requireUser(request, response, next) {
  request.user = getCurrentUser(request);
  if (!request.user) return response.status(401).json({ error: 'Please sign in to continue.' });
  next();
}

async function createSession(userId, response) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  database.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(hashToken(token), userId, now + sessionLifetime);
  setSessionCookie(response, token);
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function isUniqueConstraint(error) {
  return error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.errcode === 2067;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

app.get('/api/session', (request, response) => {
  const user = getCurrentUser(request);
  if (!user) return response.status(401).json({ error: 'Not signed in.' });
  response.json({ user });
});

app.get('/api/emojis', requireUser, (_request, response) => {
  try {
    const emojiData = fs.readFileSync(path.join(dirname, 'emojis.txt'), 'utf8');
    const emojis = [];
    for (const line of emojiData.split(/\r?\n/)) {
      const match = line.match(/^([\da-fA-F ]+)\s*;\s*(fully-qualified|component)\s*#\s*(.+)$/);
      if (!match) continue;
      const emoji = String.fromCodePoint(...match[1].trim().split(/\s+/).map((codePoint) => Number.parseInt(codePoint, 16)));
      const name = match[3].replace(/^[^\s]+\s+E[\d.]+\s+/, '').trim();
      emojis.push({ emoji, name });
    }
    response.setHeader('Cache-Control', 'private, max-age=3600');
    response.json({ emojis });
  } catch (error) {
    console.error('Could not load emojis.txt:', error.message);
    response.status(500).json({ error: 'The emoji catalog could not be loaded.' });
  }
});

app.post('/api/signup', async (request, response) => {
  const name = typeof request.body.name === 'string' ? request.body.name.trim() : '';
  const email = normalizeEmail(request.body.email);
  const password = typeof request.body.password === 'string' ? request.body.password : '';
  const picture = request.body.profilePicture || null;

  if (name.length < 2 || name.length > 80) return response.status(400).json({ error: 'Name must be between 2 and 80 characters.' });
  if (!validEmail(email)) return response.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 8 || password.length > 128) return response.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
  if (picture && (typeof picture !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(picture) || picture.length > 2_800_000)) {
    return response.status(400).json({ error: 'Choose an image under 2 MB (PNG, JPG, GIF, or WebP).' });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
  try {
    const result = database.prepare('INSERT INTO users (name, email, password_hash, profile_picture) VALUES (?, ?, ?, ?)')
      .run(name, email, passwordHash, picture);
    const userId = Number(result.lastInsertRowid);
    syncGroupMemberships(userId, email);
    await createSession(userId, response);
    response.status(201).json({ user: { id: userId, name, email, profile_picture: picture, theme: 'light', content_setting: null } });
  } catch (error) {
    if (isUniqueConstraint(error)) return response.status(409).json({ error: 'An account with that email already exists.' });
    throw error;
  }
});

app.post('/api/login', async (request, response) => {
  const email = normalizeEmail(request.body.email);
  const password = typeof request.body.password === 'string' ? request.body.password : '';
  const user = database.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return response.status(401).json({ error: 'Email or password is incorrect.' });

  const [salt, savedHash] = user.password_hash.split(':');
  const attemptedHash = await scrypt(password, salt, 64);
  if (!crypto.timingSafeEqual(attemptedHash, Buffer.from(savedHash, 'hex'))) {
    return response.status(401).json({ error: 'Email or password is incorrect.' });
  }

  syncGroupMemberships(user.id, user.email);
  await createSession(user.id, response);
  response.json({ user: { id: user.id, name: user.name, email: user.email, profile_picture: user.profile_picture, theme: user.theme, content_setting: user.content_setting } });
});

app.post('/api/password-reset', async (request, response) => {
  const email = normalizeEmail(request.body.email);
  if (!validEmail(email)) return response.status(400).json({ error: 'Enter a valid email address.' });
  if (!resendApiKey) return response.status(503).json({ error: 'Password reset email is not configured. Please contact the app administrator.' });

  const user = database.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!user) return response.json({ message: 'If an account exists for that email, a reset link is on its way.' });

  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60;
  database.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);
  database.prepare('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(tokenHash, user.id, expiresAt);

  const resetUrl = `${appUrl}/reset-password/${token}`;
  try {
    const mailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: mailFrom,
        to: [email],
        subject: 'Reset your PiChat password',
        text: `Use this link to reset your PiChat password. It expires in 15 minutes: ${resetUrl}`,
        html: `<div style="font-family:Arial,sans-serif;color:#17251d;line-height:1.6"><p>We received a request to reset your PiChat password.</p><p><a href="${resetUrl}" style="display:inline-block;background:#244c39;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px">Choose a new password</a></p><p>This link expires in 15 minutes. If you did not request a reset, you can ignore this email.</p></div>`
      })
    });
    const mailResult = await mailResponse.json().catch(() => ({}));
    if (!mailResponse.ok) throw new Error(mailResult.message || `Resend returned HTTP ${mailResponse.status}.`);
  } catch (error) {
    database.prepare('DELETE FROM password_reset_tokens WHERE token_hash = ?').run(tokenHash);
    console.error('Resend could not send password reset email:', error.message);
    return response.status(503).json({ error: 'The reset email could not be sent. Please try again later.' });
  }

  response.json({ message: 'If an account exists for that email, a reset link is on its way.' });
});

app.post('/api/password-reset/complete', async (request, response) => {
  const token = typeof request.body.token === 'string' ? request.body.token : '';
  const password = typeof request.body.password === 'string' ? request.body.password : '';
  if (password.length < 8 || password.length > 128) {
    return response.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
  }

  const tokenHash = hashToken(token);
  const now = Math.floor(Date.now() / 1000);
  const reset = database.prepare('SELECT user_id FROM password_reset_tokens WHERE token_hash = ? AND expires_at > ?')
    .get(tokenHash, now);
  if (!reset) return response.status(400).json({ error: 'This reset link is invalid or expired. Request a new one.' });

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
  const consumed = database.prepare('DELETE FROM password_reset_tokens WHERE token_hash = ? AND expires_at > ? RETURNING user_id')
    .get(tokenHash, now);
  if (!consumed) return response.status(400).json({ error: 'This reset link is invalid or expired. Request a new one.' });
  database.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, consumed.user_id);
  database.prepare('DELETE FROM sessions WHERE user_id = ?').run(consumed.user_id);
  database.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(consumed.user_id);
  response.json({ success: true });
});

app.post('/api/logout', (request, response) => {
  const token = readCookie(request, cookieName);
  if (token) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  clearSessionCookie(response);
  response.json({ success: true });
});

app.get('/api/contacts', requireUser, (request, response) => {
  const contacts = database.prepare(`
    SELECT invitations.id AS invitation_id,
      CASE WHEN invitations.inviter_id = ? THEN invitee.id ELSE inviter.id END AS id,
      CASE WHEN invitations.inviter_id = ? THEN invitations.invitee_name ELSE inviter.name END AS name,
      CASE WHEN invitations.inviter_id = ? THEN invitations.invitee_email ELSE inviter.email END AS email,
      CASE WHEN invitations.inviter_id = ? THEN invitee.profile_picture ELSE inviter.profile_picture END AS profile_picture
    FROM invitations
    JOIN users AS inviter ON inviter.id = invitations.inviter_id
    LEFT JOIN users AS invitee ON invitee.email = invitations.invitee_email COLLATE NOCASE
    WHERE invitations.status = 'accepted'
      AND (invitations.inviter_id = ? OR invitations.invitee_email = ? COLLATE NOCASE)
    ORDER BY invitations.id DESC
  `).all(request.user.id, request.user.id, request.user.id, request.user.id, request.user.id, request.user.email);
  response.json({ contacts });
});

function getAcceptedConnection(userId, contactId) {
  return database.prepare(`
    SELECT invitations.id AS invitation_id
    FROM invitations
    JOIN users AS inviter ON inviter.id = invitations.inviter_id
    JOIN users AS invitee ON invitee.email = invitations.invitee_email COLLATE NOCASE
    WHERE invitations.status = 'accepted'
      AND ((inviter.id = ? AND invitee.id = ?) OR (inviter.id = ? AND invitee.id = ?))
  `).get(userId, contactId, contactId, userId);
}

function filterExistingMessages(userId, contentSetting) {
  if (contentSetting === 'adult') return;
  const messages = database.prepare(`
    SELECT messages.id, messages.body, messages.attachment_path, messages.attachment_url
    FROM messages
    JOIN invitations ON invitations.id = messages.invitation_id
    JOIN users AS invitee ON invitee.email = invitations.invitee_email COLLATE NOCASE
    WHERE invitations.status = 'accepted'
      AND (invitations.inviter_id = ? OR invitee.id = ?)
      AND messages.sender_id != ?
      AND messages.deleted_at IS NULL
  `).all(userId, userId, userId);
  const replace = database.prepare(`
    UPDATE messages
    SET body = 'This message violates the recievers content settings',
      attachment_name = NULL, attachment_type = NULL, attachment_path = NULL, attachment_url = NULL
    WHERE id = ?
  `);
  for (const message of messages) {
    const textBad = violatesContentSetting(message.body, contentSetting);
    const hasAttachment = Boolean(message.attachment_path || message.attachment_url);
    if (!textBad) continue;
    if (message.attachment_path) {
      const filePath = path.join(uploadsDir, path.basename(message.attachment_path));
      fs.unlink(filePath, (error) => {
        if (error && error.code !== 'ENOENT') console.error('Could not remove a blocked message attachment:', error.message);
      });
    }
    replace.run(message.id);
  }
}

function getMessageAccess(messageId, userId) {
  return database.prepare(`
    SELECT messages.id, messages.sender_id, messages.invitation_id, messages.attachment_path
    FROM messages
    JOIN invitations ON invitations.id = messages.invitation_id
    JOIN users AS invitee ON invitee.email = invitations.invitee_email COLLATE NOCASE
    WHERE messages.id = ?
      AND invitations.status = 'accepted'
      AND (invitations.inviter_id = ? OR invitee.id = ?)
  `).get(messageId, userId, userId);
}

app.get('/api/contacts/:contactId/messages', requireUser, (request, response) => {
  const contactId = Number(request.params.contactId);
  if (!Number.isSafeInteger(contactId) || contactId === request.user.id) return response.status(400).json({ error: 'Choose a valid contact.' });
  const connection = getAcceptedConnection(request.user.id, contactId);
  if (!connection) return response.status(404).json({ error: 'This contact is not available for messaging yet.' });
  const messages = database.prepare(`
    SELECT
      m.id, m.sender_id,
      sender.name AS sender_name,
      sender.profile_picture AS sender_profile_picture,
      CASE WHEN m.deleted_at IS NOT NULL THEN '' ELSE m.body END AS body,
      CASE WHEN m.deleted_at IS NOT NULL THEN NULL ELSE m.attachment_name END AS attachment_name,
      CASE WHEN m.deleted_at IS NOT NULL THEN NULL ELSE m.attachment_type END AS attachment_type,
      CASE
        WHEN m.deleted_at IS NOT NULL THEN NULL
        WHEN m.attachment_path IS NOT NULL THEN '/api/messages/' || m.id || '/attachment'
        ELSE m.attachment_url
      END AS attachment_url,
      m.created_at, m.reply_to_message_id,
      CASE WHEN m.deleted_at IS NOT NULL THEN 1 ELSE 0 END AS is_deleted,
      rm.id AS reply_to_id,
      rm.sender_id AS reply_to_sender_id,
      CASE
        WHEN m.reply_to_message_id IS NULL THEN NULL
        WHEN rm.deleted_at IS NOT NULL THEN '[Message removed]'
        ELSE COALESCE(NULLIF(rm.body, ''), '[Media]')
      END AS reply_to_preview
    FROM messages AS m
    JOIN users AS sender ON sender.id = m.sender_id
    LEFT JOIN messages AS rm ON rm.id = m.reply_to_message_id
    WHERE m.invitation_id = ? ORDER BY m.id
  `).all(connection.invitation_id);
  const messageIds = messages.map((row) => row.id);
  const reactionByMessage = new Map();
  if (messageIds.length) {
    const placeholders = messageIds.map(() => '?').join(',');
    const reactionRows = database.prepare(`
      SELECT message_id, user_id, emoji, gif_url, gif_preview, gif_name
      FROM message_reactions WHERE message_id IN (${placeholders})
      ORDER BY id
    `).all(...messageIds);
    for (const row of reactionRows) {
      if (!reactionByMessage.has(row.message_id)) reactionByMessage.set(row.message_id, []);
      reactionByMessage.get(row.message_id).push({
        user_id: row.user_id,
        emoji: row.emoji,
        gif_url: row.gif_url,
        gif_preview: row.gif_preview,
        gif_name: row.gif_name
      });
    }
  }
  response.json({
    messages: messages.map((row) => ({
      id: row.id,
      sender_id: row.sender_id,
      sender_name: row.sender_name,
      sender_profile_picture: row.sender_profile_picture,
      body: row.body,
      attachment_name: row.attachment_name,
      attachment_type: row.attachment_type,
      attachment_url: row.attachment_url,
      created_at: row.created_at,
      reply_to_message_id: row.reply_to_message_id,
      reply_to_preview: row.reply_to_preview,
      reply_to_sender_id: row.reply_to_sender_id,
      deleted: Boolean(row.is_deleted),
      reactions: reactionByMessage.get(row.id) || []
    }))
  });
});

app.post('/api/contacts/:contactId/messages', requireUser, messageUpload.single('file'), (request, response) => {
  const contactId = Number(request.params.contactId);
  let body = typeof request.body?.body === 'string' ? request.body.body.trim() : '';
  let replyToMessageId = Number(request.body?.reply_to_message_id);
  if (!Number.isSafeInteger(replyToMessageId) || replyToMessageId < 1) replyToMessageId = null;
  if (!Number.isSafeInteger(contactId) || contactId === request.user.id) return response.status(400).json({ error: 'Choose a valid contact.' });
  if (body.length > 10000) {
    if (request.file) fs.unlink(request.file.path, () => {});
    return response.status(400).json({ error: 'Messages cannot exceed 10,000 characters.' });
  }
  if (!body && !request.file) {
    return response.status(400).json({ error: 'Messages must include text or a file.' });
  }
  const connection = getAcceptedConnection(request.user.id, contactId);
  if (!connection) {
    if (request.file) fs.unlink(request.file.path, () => {});
    return response.status(404).json({ error: 'This contact is not available for messaging yet.' });
  }
  if (replyToMessageId !== null) {
    const replyRef = database.prepare('SELECT id FROM messages WHERE id = ? AND invitation_id = ?').get(replyToMessageId, connection.invitation_id);
    if (!replyRef) {
      if (request.file) fs.unlink(request.file.path, () => {});
      return response.status(400).json({ error: 'That quoted message is not in this conversation.' });
    }
  }
  const recipient = database.prepare('SELECT content_setting FROM users WHERE id = ?').get(contactId);
  const contentSetting = recipient.content_setting || '7+';
  const textBlocked = contentSetting !== 'adult' && violatesContentSetting(body, contentSetting);
  const storedBody = textBlocked ? 'This message violates the recievers content settings' : body;
  if (textBlocked && !request.file) {
    const result = database.prepare(`
      INSERT INTO messages (invitation_id, sender_id, body, attachment_name, attachment_type, attachment_path, reply_to_message_id)
      VALUES (?, ?, ?, NULL, NULL, NULL, ?)
    `).run(connection.invitation_id, request.user.id, storedBody, replyToMessageId);
    const message = database.prepare('SELECT id, sender_id, body, attachment_name, attachment_type, created_at, reply_to_message_id FROM messages WHERE id = ?').get(Number(result.lastInsertRowid));
    return response.status(201).json({ message });
  }
  const result = database.prepare(`
    INSERT INTO messages (invitation_id, sender_id, body, attachment_name, attachment_type, attachment_path, reply_to_message_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    connection.invitation_id,
    request.user.id,
    storedBody,
    request.file?.originalname || null,
    request.file?.mimetype || null,
    request.file?.filename || null,
    replyToMessageId
  );
  const message = database.prepare('SELECT id, sender_id, body, attachment_name, attachment_type, created_at, reply_to_message_id FROM messages WHERE id = ?').get(Number(result.lastInsertRowid));
  if (request.file) message.attachment_url = `/api/messages/${message.id}/attachment`;
  response.status(201).json({ message });
});

app.get('/api/messages/:messageId/attachment', requireUser, (request, response) => {
  const messageId = Number(request.params.messageId);
  const message = database.prepare(`
    SELECT messages.attachment_path, messages.attachment_name, messages.attachment_type
    FROM messages JOIN invitations ON invitations.id = messages.invitation_id
    JOIN users AS invitee ON invitee.email = invitations.invitee_email COLLATE NOCASE
    WHERE messages.id = ? AND (invitations.inviter_id = ? OR invitee.id = ?)
      AND invitations.status = 'accepted'
  `).get(messageId, request.user.id, request.user.id);
  if (!message?.attachment_path) return response.status(404).json({ error: 'This attachment is not available.' });
  const filePath = path.join(uploadsDir, path.basename(message.attachment_path));
  const inlineTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav']);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (inlineTypes.has(message.attachment_type)) response.type(message.attachment_type);
  else {
    response.type('application/octet-stream');
    response.attachment(message.attachment_name || 'attachment');
  }
  response.sendFile(filePath, (error) => {
    if (error && !response.headersSent) response.status(404).end();
  });
});

app.delete('/api/messages/:messageId', requireUser, (request, response) => {
  const messageId = Number(request.params.messageId);
  if (!Number.isSafeInteger(messageId) || messageId < 1) return response.status(400).json({ error: 'Choose a valid message.' });
  const access = getMessageAccess(messageId, request.user.id);
  if (!access) return response.status(404).json({ error: 'This message is not available.' });
  if (access.sender_id !== request.user.id) return response.status(403).json({ error: 'You can only remove messages you sent.' });
  const existing = database.prepare('SELECT deleted_at, attachment_path FROM messages WHERE id = ?').get(messageId);
  if (existing?.deleted_at) return response.json({ success: true });
  database.prepare(`
    UPDATE messages SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ? WHERE id = ?
  `).run(request.user.id, messageId);
  if (existing?.attachment_path) {
    const filePath = path.join(uploadsDir, path.basename(existing.attachment_path));
    fs.unlink(filePath, (error) => {
      if (error && error.code !== 'ENOENT') console.error('Could not remove deleted message attachment:', error.message);
    });
  }
  response.json({ success: true });
});

app.patch('/api/messages/:messageId', requireUser, (request, response) => {
  const messageId = Number(request.params.messageId);
  const body = typeof request.body?.body === 'string' ? request.body.body.trim() : '';
  if (!Number.isSafeInteger(messageId) || messageId < 1) return response.status(400).json({ error: 'Choose a valid message.' });
  if (!body) return response.status(400).json({ error: 'Messages cannot be empty.' });
  if (body.length > 10000) return response.status(400).json({ error: 'Messages cannot exceed 10,000 characters.' });
  const access = getMessageAccess(messageId, request.user.id);
  if (!access) return response.status(404).json({ error: 'This message is not available.' });
  if (access.sender_id !== request.user.id) return response.status(403).json({ error: 'You can only edit messages you sent.' });
  const row = database.prepare(`
    SELECT messages.deleted_at, messages.attachment_path, messages.attachment_url, invitations.id AS invitation_id
    FROM messages
    JOIN invitations ON invitations.id = messages.invitation_id
    WHERE messages.id = ?
  `).get(messageId);
  if (!row || row.deleted_at) return response.status(400).json({ error: 'This message cannot be edited.' });
  if (row.attachment_path || row.attachment_url) return response.status(400).json({ error: 'Only text messages can be edited.' });
  const contactId = database.prepare(`
    SELECT CASE WHEN invitations.inviter_id = ? THEN invitee.id ELSE invitations.inviter_id END AS contact_id
    FROM invitations
    JOIN users AS invitee ON invitee.email = invitations.invitee_email COLLATE NOCASE
    WHERE invitations.id = ?
  `).get(request.user.id, row.invitation_id)?.contact_id;
  const recipient = contactId ? database.prepare('SELECT content_setting FROM users WHERE id = ?').get(contactId) : null;
  const contentSetting = recipient?.content_setting || '7+';
  const storedBody = contentSetting !== 'adult' && violatesContentSetting(body, contentSetting)
    ? 'This message violates the recievers content settings'
    : body;
  database.prepare('UPDATE messages SET body = ? WHERE id = ?').run(storedBody, messageId);
  const message = database.prepare(`
    SELECT id, sender_id, body, attachment_name, attachment_type, created_at, reply_to_message_id FROM messages WHERE id = ?
  `).get(messageId);
  response.json({ message });
});

app.put('/api/messages/:messageId/reactions', requireUser, (request, response) => {
  const messageId = Number(request.params.messageId);
  let emoji = typeof request.body?.emoji === 'string' ? request.body.emoji.trim() : '';
  if (!Number.isSafeInteger(messageId) || messageId < 1) return response.status(400).json({ error: 'Choose a valid message.' });
  if (!emoji || emoji.length > 32) return response.status(400).json({ error: 'Choose a valid emoji reaction.' });
  const access = getMessageAccess(messageId, request.user.id);
  if (!access) return response.status(404).json({ error: 'This message is not available.' });
  const deleted = database.prepare('SELECT deleted_at FROM messages WHERE id = ?').get(messageId);
  if (deleted?.deleted_at) return response.status(400).json({ error: 'You cannot react to a removed message.' });
  const existing = database.prepare('SELECT emoji FROM message_reactions WHERE message_id = ? AND user_id = ?')
    .get(messageId, request.user.id);
  if (existing?.emoji === emoji) {
    database.prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?').run(messageId, request.user.id);
    return response.json({ reactions: listMessageReactions(messageId) });
  }
  database.prepare(`
    INSERT INTO message_reactions (message_id, user_id, emoji, gif_url, gif_preview, gif_name)
    VALUES (?, ?, ?, NULL, NULL, NULL)
    ON CONFLICT(message_id, user_id) DO UPDATE SET emoji = excluded.emoji, gif_url = NULL, gif_preview = NULL, gif_name = NULL
  `).run(messageId, request.user.id, emoji);
  response.json({ reactions: listMessageReactions(messageId) });
});

function listMessageReactions(messageId) {
  return database.prepare(`
    SELECT user_id, emoji, gif_url, gif_preview, gif_name FROM message_reactions WHERE message_id = ? ORDER BY id
  `).all(messageId).map((row) => ({
    user_id: row.user_id,
    emoji: row.emoji,
    gif_url: row.gif_url,
    gif_preview: row.gif_preview,
    gif_name: row.gif_name
  }));
}

app.post('/api/contacts/:contactId/gifs', requireUser, async (request, response) => {
  const contactId = Number(request.params.contactId);
  const query = typeof request.body.query === 'string' ? request.body.query.trim().slice(0, 100) : '';
  if (!Number.isSafeInteger(contactId) || !getAcceptedConnection(request.user.id, contactId)) return response.status(404).json({ error: 'This contact is not available for messaging yet.' });
  if (!process.env.GIPHY_API_KEY) return response.status(503).json({ error: 'GIF search is not configured. Set GIPHY_API_KEY on the server.' });
  try {
    const endpoint = new URL('https://api.giphy.com/v1/gifs/search');
    endpoint.search = new URLSearchParams({ api_key: process.env.GIPHY_API_KEY, q: query || 'reactions', limit: '24', rating: 'g' });
    const result = await fetch(endpoint);
    const payload = await result.json();
    if (!result.ok) throw new Error('GIPHY could not complete the search.');
    response.json({ gifs: (payload.data || []).map((gif) => ({
      id: gif.id,
      preview: gif.images?.fixed_width_small?.url,
      url: gif.images?.original?.url,
      title: gif.title || 'GIF'
    })).filter((gif) => gif.preview && gif.url) });
  } catch (error) {
    response.status(502).json({ error: error.message || 'GIF search is temporarily unavailable.' });
  }
});

app.post('/api/contacts/:contactId/gifs/send', requireUser, (request, response) => {
  const contactId = Number(request.params.contactId);
  const url = typeof request.body.url === 'string' ? request.body.url : '';
  const name = typeof request.body.name === 'string' ? request.body.name.slice(0, 200) : 'GIF';
  if (!Number.isSafeInteger(contactId) || !getAcceptedConnection(request.user.id, contactId)) return response.status(404).json({ error: 'This contact is not available for messaging yet.' });
  if (!/^https:\/\/media\d*\.giphy\.com\//.test(url)) return response.status(400).json({ error: 'Choose a valid GIPHY GIF.' });
  const connection = getAcceptedConnection(request.user.id, contactId);
  const recipient = database.prepare('SELECT content_setting FROM users WHERE id = ?').get(contactId);
  if ((recipient.content_setting || '7+') !== 'adult') {
    const result = database.prepare(`
      INSERT INTO messages (invitation_id, sender_id, body)
      VALUES (?, ?, 'This message violates the recievers content settings')
    `).run(connection.invitation_id, request.user.id);
    return response.status(201).json({ message: database.prepare(`
      SELECT id, sender_id, body, created_at FROM messages WHERE id = ?
    `).get(Number(result.lastInsertRowid)) });
  }
  const result = database.prepare(`
    INSERT INTO messages (invitation_id, sender_id, body, attachment_name, attachment_type, attachment_url)
    VALUES (?, ?, '', ?, 'image/gif', ?)
  `).run(connection.invitation_id, request.user.id, name, url);
  response.status(201).json({ message: database.prepare(`
    SELECT id, sender_id, body, attachment_name, attachment_type, attachment_url, created_at
    FROM messages WHERE id = ?
  `).get(Number(result.lastInsertRowid)) });
});

app.put('/api/preferences/theme', requireUser, (request, response) => {
  const theme = request.body.theme;
  if (!['light', 'dark'].includes(theme)) return response.status(400).json({ error: 'Choose light or dark appearance.' });
  database.prepare('UPDATE users SET theme = ? WHERE id = ?').run(theme, request.user.id);
  response.json({ theme });
});

app.put('/api/preferences/content-setting', requireUser, (request, response) => {
  const contentSetting = request.body.contentSetting;
  if (!['7+', '10+', '13+', '16+', 'adult'].includes(contentSetting)) {
    return response.status(400).json({ error: 'Choose one of the available content settings.' });
  }
  database.prepare('UPDATE users SET content_setting = ? WHERE id = ?').run(contentSetting, request.user.id);
  filterExistingMessages(request.user.id, contentSetting);
  response.json({ content_setting: contentSetting });
});

app.put('/api/profile', requireUser, (request, response) => {
  if (request.body.email !== undefined) {
    return response.status(400).json({ error: 'Your email address cannot be changed.' });
  }

  const name = typeof request.body.name === 'string' ? request.body.name.trim() : '';
  if (name.length < 2 || name.length > 80) {
    return response.status(400).json({ error: 'Name must be between 2 and 80 characters.' });
  }

  const contentSetting = request.body.contentSetting;
  if (!['7+', '10+', '13+', '16+', 'adult'].includes(contentSetting)) {
    return response.status(400).json({ error: 'Choose one of the available content settings.' });
  }

  let profilePicture = request.user.profile_picture;
  if (Object.hasOwn(request.body, 'profilePicture')) {
    const picture = request.body.profilePicture;
    if (picture === null) {
      profilePicture = null;
    } else if (typeof picture === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(picture) && picture.length <= 2_800_000) {
      profilePicture = picture;
    } else {
      return response.status(400).json({ error: 'Choose an image under 2 MB (PNG, JPG, GIF, or WebP).' });
    }
  }

  const previousSetting = request.user.content_setting;
  database.prepare('UPDATE users SET name = ?, profile_picture = ?, content_setting = ? WHERE id = ?')
    .run(name, profilePicture, contentSetting, request.user.id);
  if (contentSetting !== previousSetting) filterExistingMessages(request.user.id, contentSetting);

  response.json({
    user: {
      id: request.user.id,
      name,
      email: request.user.email,
      profile_picture: profilePicture,
      theme: request.user.theme,
      content_setting: contentSetting
    }
  });
});

app.put('/api/contacts/:contactId/background', requireUser, (request, response) => {
  const contactId = Number(request.params.contactId);
  const image = request.body.image;
  if (!Number.isSafeInteger(contactId) || contactId === request.user.id) return response.status(400).json({ error: 'Choose a valid contact.' });
  if (image !== null && (typeof image !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(image) || image.length > 2_800_000)) {
    return response.status(400).json({ error: 'Choose an image under 2 MB (PNG, JPG, GIF, or WebP).' });
  }
  if (!getAcceptedConnection(request.user.id, contactId)) return response.status(404).json({ error: 'This contact is not available yet.' });
  database.prepare(`
    INSERT INTO chat_preferences (user_id, contact_id, background_image) VALUES (?, ?, ?)
    ON CONFLICT(user_id, contact_id) DO UPDATE SET background_image = excluded.background_image
  `).run(request.user.id, contactId, image);
  response.json({ success: true });
});

app.put('/api/contacts/:contactId/color', requireUser, (request, response) => {
  const contactId = Number(request.params.contactId);
  const color = request.body.color;
  if (!Number.isSafeInteger(contactId) || contactId === request.user.id) return response.status(400).json({ error: 'Choose a valid contact.' });
  if (!chatPaletteColors.has(color)) return response.status(400).json({ error: 'Choose a color from the palette.' });
  if (!getAcceptedConnection(request.user.id, contactId)) return response.status(404).json({ error: 'This contact is not available yet.' });
  database.prepare(`
    INSERT INTO chat_preferences (user_id, contact_id, background_color) VALUES (?, ?, ?)
    ON CONFLICT(user_id, contact_id) DO UPDATE SET background_color = excluded.background_color
  `).run(request.user.id, contactId, color);
  response.json({ color });
});

app.put('/api/contacts/:contactId/font', requireUser, (request, response) => {
  const contactId = Number(request.params.contactId);
  const family = typeof request.body.family === 'string' ? request.body.family.trim() : '';
  const fontData = request.body.data ?? null;
  if (!Number.isSafeInteger(contactId) || contactId === request.user.id) return response.status(400).json({ error: 'Choose a valid contact.' });
  if (!validateChatFontInput(family, fontData)) {
    return response.status(400).json({ error: 'Choose a listed font or upload a valid WOFF, WOFF2, TTF, or OTF file under 2 MB.' });
  }
  if (!getAcceptedConnection(request.user.id, contactId)) return response.status(404).json({ error: 'This contact is not available yet.' });
  database.prepare(`
    INSERT INTO chat_preferences (user_id, contact_id, font_family, font_data) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, contact_id) DO UPDATE SET font_family = excluded.font_family, font_data = excluded.font_data
  `).run(request.user.id, contactId, family, fontData);
  response.json({ family });
});

app.get('/api/contacts/:contactId/background', requireUser, (request, response) => {
  const contactId = Number(request.params.contactId);
  if (!Number.isSafeInteger(contactId) || !getAcceptedConnection(request.user.id, contactId)) {
    return response.status(404).json({ error: 'This contact is not available yet.' });
  }
  const preference = database.prepare('SELECT background_image, background_color, font_family, font_data FROM chat_preferences WHERE user_id = ? AND contact_id = ?')
    .get(request.user.id, contactId);
  response.json({ image: preference?.background_image || null, color: preference?.background_color || null, fontFamily: preference?.font_family || 'DM Sans', fontData: preference?.font_data || null });
});

app.get('/api/invitations', requireUser, (request, response) => {
  const invitations = database.prepare(`
    SELECT id, invitee_name AS name, invitee_email AS email, status, created_at
    FROM invitations WHERE inviter_id = ? ORDER BY id DESC
  `).all(request.user.id);
  const groupInvitations = database.prepare(`
    SELECT gi.id, gi.invitee_name AS name, gi.invitee_email AS email, gi.status, gi.created_at,
      gc.id AS group_id, gc.name AS group_name, gc.profile_picture AS group_picture
    FROM group_invites gi
    JOIN group_chats gc ON gc.id = gi.group_id
    WHERE gi.inviter_id = ?
    ORDER BY gi.id DESC
  `).all(request.user.id);
  const receivedInvitations = database.prepare(`
    SELECT invitations.id, users.name AS inviter_name, users.profile_picture AS inviter_picture,
      invitations.status, invitations.created_at
    FROM invitations
    JOIN users ON users.id = invitations.inviter_id
    WHERE invitations.invitee_email = ? COLLATE NOCASE AND invitations.inviter_id != ?
    ORDER BY invitations.id DESC
  `).all(request.user.email, request.user.id);
  const receivedGroupInvitations = database.prepare(`
    SELECT gi.id, users.name AS inviter_name, users.profile_picture AS inviter_picture,
      gi.status, gi.created_at, gc.id AS group_id, gc.name AS group_name, gc.profile_picture AS group_picture
    FROM group_invites gi
    JOIN users ON users.id = gi.inviter_id
    JOIN group_chats gc ON gc.id = gi.group_id
    WHERE gi.invitee_email = ? COLLATE NOCASE AND gi.inviter_id != ?
    ORDER BY gi.id DESC
  `).all(request.user.email, request.user.id);
  response.json({ invitations, groupInvitations, receivedInvitations, receivedGroupInvitations });
});

app.get('/api/groups', requireUser, (request, response) => {
  const groups = database.prepare(`
    SELECT gc.id, gc.name, gc.profile_picture
    FROM group_chats gc
    JOIN group_members gm ON gm.group_id = gc.id
    WHERE gm.user_id = ?
    ORDER BY gc.id DESC
  `).all(request.user.id);
  response.json({ groups });
});

app.post('/api/groups', requireUser, async (request, response) => {
  const name = typeof request.body.name === 'string' ? request.body.name.trim() : '';
  const picture = request.body.profilePicture || null;
  const members = Array.isArray(request.body.members) ? request.body.members : [];
  if (name.length < 2 || name.length > 80) return response.status(400).json({ error: 'Group name must be between 2 and 80 characters.' });
  if (picture && (typeof picture !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(picture) || picture.length > 2_800_000)) {
    return response.status(400).json({ error: 'Choose a group image under 2 MB (PNG, JPG, GIF, or WebP).' });
  }
  const normalized = [];
  const seen = new Set([request.user.email.toLowerCase()]);
  for (const entry of members) {
    const memberName = typeof entry?.name === 'string' ? entry.name.trim() : '';
    const memberEmail = normalizeEmail(entry?.email);
    if (memberName.length < 2 || memberName.length > 80) return response.status(400).json({ error: 'Each member needs a name between 2 and 80 characters.' });
    if (!validEmail(memberEmail)) return response.status(400).json({ error: `Enter a valid email for ${memberName || 'each member'}.` });
    if (seen.has(memberEmail)) return response.status(400).json({ error: 'Each member email can only appear once.' });
    seen.add(memberEmail);
    normalized.push({ name: memberName, email: memberEmail });
  }
  if (!normalized.length) return response.status(400).json({ error: 'Add at least one member to the group chat.' });

  const groupResult = database.prepare(`
    INSERT INTO group_chats (creator_id, name, profile_picture) VALUES (?, ?, ?)
  `).run(request.user.id, name, picture);
  const groupId = Number(groupResult.lastInsertRowid);
  database.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(groupId, request.user.id);

  const createdInvites = [];
  for (const member of normalized) {
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    try {
      const inviteResult = database.prepare(`
        INSERT INTO group_invites (group_id, inviter_id, invitee_name, invitee_email, token_hash)
        VALUES (?, ?, ?, ?, ?)
      `).run(groupId, request.user.id, member.name, member.email, tokenHash);
      const inviteUrl = `${appUrl}/group-invite/${token}`;
      const acceptLoginUrl = loginUrlWithInvite(token);
      const deliveredInApp = userWithEmailExists(member.email);
      let emailSent = false;
      let emailError = null;
      if (!deliveredInApp && resendApiKey) {
        try {
          const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: mailFrom,
              to: [member.email],
              subject: `${request.user.name} invited you to a PiChat group chat`,
              text: `${request.user.name} invited you to join a PiChat group chat called "${name}". PiChat: ${appUrl}\n\nSign in to accept: ${acceptLoginUrl}`,
              html: `<div style="font-family:Arial,sans-serif;color:#17251d;line-height:1.6"><p>${escapeHtml(member.name)}, ${escapeHtml(request.user.name)} invited you to join a PiChat group chat called <strong>${escapeHtml(name)}</strong>.</p><p>PiChat lives at <a href="${escapeHtml(appUrl)}">${escapeHtml(appUrl)}</a>.</p><p><a href="${acceptLoginUrl}" style="display:inline-block;background:#244c39;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px">Accept invitation</a></p><p>Sign in to PiChat to accept. You can also open your invitation from the app after signing in.</p></div>`
            })
          });
          const resendResult = await resendResponse.json().catch(() => ({}));
          if (!resendResponse.ok) throw new Error(resendResult.message || `Resend returned HTTP ${resendResponse.status}.`);
          emailSent = true;
        } catch (error) {
          console.error('Resend could not send group invitation email:', error.message);
          emailError = 'We could not send the email right now.';
        }
      } else if (!deliveredInApp) {
        emailError = 'We could not send the email right now.';
      }
      createdInvites.push({
        id: Number(inviteResult.lastInsertRowid),
        name: member.name,
        email: member.email,
        status: 'pending',
        group_id: groupId,
        group_name: name,
        group_picture: picture,
        emailSent,
        emailError,
        inviteUrl,
        deliveredInApp
      });
    } catch (error) {
      if (isUniqueConstraint(error)) return response.status(409).json({ error: `You have already invited ${member.email} to this group.` });
      throw error;
    }
  }

  const group = database.prepare('SELECT id, name, profile_picture FROM group_chats WHERE id = ?').get(groupId);
  response.status(201).json({ group, invites: createdInvites });
});

app.get('/api/group-invite/:token', (request, response) => {
  const row = database.prepare(`
    SELECT gi.invitee_name AS invitee_name, gi.invitee_email AS invitee_email, gi.status AS status,
      gc.name AS group_name, gc.profile_picture AS group_picture,
      users.name AS inviter_name
    FROM group_invites gi
    JOIN group_chats gc ON gc.id = gi.group_id
    JOIN users ON users.id = gi.inviter_id
    WHERE gi.token_hash = ?
  `).get(hashToken(request.params.token));
  if (!row) return response.status(404).json({ error: 'This group invitation link is invalid or expired.' });
  response.json({ invitation: { ...row, app_url: appUrl } });
});

app.post('/api/group-invite/:token/:decision', (request, response) => {
  const decision = request.params.decision;
  if (!['accept', 'decline'].includes(decision)) return response.status(400).json({ error: 'Choose accept or decline.' });
  if (decision === 'decline') {
    return response.json({ status: 'pending' });
  }
  const tokenHash = hashToken(request.params.token);
  const result = database.prepare(`
    UPDATE group_invites SET status = ? WHERE token_hash = ? AND status = 'pending'
  `).run('accepted', tokenHash);
  if (result.changes === 0) {
    const invitation = database.prepare('SELECT status FROM group_invites WHERE token_hash = ?').get(tokenHash);
    if (!invitation) return response.status(404).json({ error: 'This group invitation link is invalid or expired.' });
    return response.status(409).json({ error: `This invitation has already been ${invitation.status}.` });
  }
  if (decision === 'accept') joinGroupInviteIfReady(tokenHash);
  response.json({ status: decision === 'accept' ? 'accepted' : 'declined' });
});

app.get('/api/groups/:groupId/messages', requireUser, (request, response) => {
  const groupId = Number(request.params.groupId);
  if (!Number.isSafeInteger(groupId)) return response.status(400).json({ error: 'Choose a valid group.' });
  if (!isGroupMember(groupId, request.user.id)) return response.status(404).json({ error: 'This group is not available.' });
  const messages = database.prepare(`
    SELECT
      gm.id, gm.sender_id, users.name AS sender_name, users.profile_picture AS sender_profile_picture,
      CASE WHEN gm.deleted_at IS NOT NULL THEN '' ELSE gm.body END AS body,
      CASE WHEN gm.deleted_at IS NOT NULL THEN NULL ELSE gm.attachment_name END AS attachment_name,
      CASE WHEN gm.deleted_at IS NOT NULL THEN NULL ELSE gm.attachment_type END AS attachment_type,
      CASE
        WHEN gm.deleted_at IS NOT NULL THEN NULL
        WHEN gm.attachment_path IS NOT NULL THEN '/api/group-messages/' || gm.id || '/attachment'
        ELSE gm.attachment_url
      END AS attachment_url,
      gm.created_at, gm.reply_to_message_id,
      CASE WHEN gm.deleted_at IS NOT NULL THEN 1 ELSE 0 END AS is_deleted,
      rm.id AS reply_to_id,
      rm.sender_id AS reply_to_sender_id,
      CASE
        WHEN gm.reply_to_message_id IS NULL THEN NULL
        WHEN rm.deleted_at IS NOT NULL THEN '[Message removed]'
        ELSE COALESCE(NULLIF(rm.body, ''), '[Media]')
      END AS reply_to_preview
    FROM group_messages gm
    JOIN users ON users.id = gm.sender_id
    LEFT JOIN group_messages AS rm ON rm.id = gm.reply_to_message_id
    WHERE gm.group_id = ?
    ORDER BY gm.id
  `).all(groupId);
  const messageIds = messages.map((row) => row.id);
  const reactionByMessage = new Map();
  if (messageIds.length) {
    const placeholders = messageIds.map(() => '?').join(',');
    const reactionRows = database.prepare(`
      SELECT message_id, user_id, emoji, gif_url, gif_preview, gif_name
      FROM group_message_reactions WHERE message_id IN (${placeholders})
      ORDER BY id
    `).all(...messageIds);
    for (const row of reactionRows) {
      if (!reactionByMessage.has(row.message_id)) reactionByMessage.set(row.message_id, []);
      reactionByMessage.get(row.message_id).push({
        user_id: row.user_id,
        emoji: row.emoji,
        gif_url: row.gif_url,
        gif_preview: row.gif_preview,
        gif_name: row.gif_name
      });
    }
  }
  response.json({
    messages: messages.map((row) => ({
      id: row.id,
      sender_id: row.sender_id,
      sender_name: row.sender_name,
      sender_profile_picture: row.sender_profile_picture,
      body: row.body,
      attachment_name: row.attachment_name,
      attachment_type: row.attachment_type,
      attachment_url: row.attachment_url,
      created_at: row.created_at,
      reply_to_message_id: row.reply_to_message_id,
      reply_to_preview: row.reply_to_preview,
      reply_to_sender_id: row.reply_to_sender_id,
      deleted: Boolean(row.is_deleted),
      reactions: reactionByMessage.get(row.id) || []
    }))
  });
});

app.post('/api/groups/:groupId/messages', requireUser, messageUpload.single('file'), (request, response) => {
  const groupId = Number(request.params.groupId);
  let body = typeof request.body?.body === 'string' ? request.body.body.trim() : '';
  let replyToMessageId = Number(request.body?.reply_to_message_id);
  if (!Number.isSafeInteger(replyToMessageId) || replyToMessageId < 1) replyToMessageId = null;
  if (!Number.isSafeInteger(groupId)) return response.status(400).json({ error: 'Choose a valid group.' });
  if (!isGroupMember(groupId, request.user.id)) {
    if (request.file) fs.unlink(request.file.path, () => {});
    return response.status(404).json({ error: 'This group is not available.' });
  }
  if (replyToMessageId !== null) {
    const replyRef = database.prepare('SELECT id FROM group_messages WHERE id = ? AND group_id = ?').get(replyToMessageId, groupId);
    if (!replyRef) {
      if (request.file) fs.unlink(request.file.path, () => {});
      return response.status(400).json({ error: 'That quoted message is not in this conversation.' });
    }
  }
  if (body.length > 10000) {
    if (request.file) fs.unlink(request.file.path, () => {});
    return response.status(400).json({ error: 'Messages cannot exceed 10,000 characters.' });
  }
  if (!body && !request.file) return response.status(400).json({ error: 'Messages must include text or a file.' });
  const setting = request.user.content_setting || '7+';
  const textBlocked = setting !== 'adult' && violatesContentSetting(body, setting);
  const storedBody = textBlocked ? 'This message violates the recievers content settings' : body;
  if (textBlocked && request.file) {
    fs.unlink(request.file.path, () => {});
    return response.status(400).json({ error: 'Attachments are blocked while content settings filter this message.' });
  }
  const result = database.prepare(`
    INSERT INTO group_messages (group_id, sender_id, body, attachment_name, attachment_type, attachment_path, reply_to_message_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    groupId,
    request.user.id,
    storedBody,
    request.file?.originalname || null,
    request.file?.mimetype || null,
    request.file?.filename || null,
    replyToMessageId
  );
  const message = database.prepare(`
    SELECT gm.id, gm.sender_id, users.name AS sender_name, gm.body, gm.attachment_name, gm.attachment_type, gm.created_at
    FROM group_messages gm JOIN users ON users.id = gm.sender_id WHERE gm.id = ?
  `).get(Number(result.lastInsertRowid));
  if (request.file) message.attachment_url = `/api/group-messages/${message.id}/attachment`;
  response.status(201).json({ message });
});

app.put('/api/group-messages/:messageId/reactions', requireUser, (request, response) => {
  const messageId = Number(request.params.messageId);
  let emoji = typeof request.body?.emoji === 'string' ? request.body.emoji.trim() : '';
  if (!Number.isSafeInteger(messageId) || messageId < 1) return response.status(400).json({ error: 'Choose a valid message.' });
  if (!emoji || emoji.length > 32) return response.status(400).json({ error: 'Choose a valid emoji reaction.' });
  const access = getGroupMessageAccess(messageId, request.user.id);
  if (!access) return response.status(404).json({ error: 'This message is not available.' });
  const deleted = database.prepare('SELECT deleted_at FROM group_messages WHERE id = ?').get(messageId);
  if (deleted?.deleted_at) return response.status(400).json({ error: 'You cannot react to a removed message.' });
  const existing = database.prepare('SELECT emoji FROM group_message_reactions WHERE message_id = ? AND user_id = ?')
    .get(messageId, request.user.id);
  if (existing?.emoji === emoji) {
    database.prepare('DELETE FROM group_message_reactions WHERE message_id = ? AND user_id = ?').run(messageId, request.user.id);
    return response.json({ reactions: listGroupMessageReactions(messageId) });
  }
  database.prepare(`
    INSERT INTO group_message_reactions (message_id, user_id, emoji, gif_url, gif_preview, gif_name)
    VALUES (?, ?, ?, NULL, NULL, NULL)
    ON CONFLICT(message_id, user_id) DO UPDATE SET emoji = excluded.emoji, gif_url = NULL, gif_preview = NULL, gif_name = NULL
  `).run(messageId, request.user.id, emoji);
  response.json({ reactions: listGroupMessageReactions(messageId) });
});

app.delete('/api/group-messages/:messageId', requireUser, (request, response) => {
  const messageId = Number(request.params.messageId);
  if (!Number.isSafeInteger(messageId) || messageId < 1) return response.status(400).json({ error: 'Choose a valid message.' });
  const access = getGroupMessageAccess(messageId, request.user.id);
  if (!access) return response.status(404).json({ error: 'This message is not available.' });
  if (access.sender_id !== request.user.id) return response.status(403).json({ error: 'You can only remove messages you sent.' });
  const existing = database.prepare('SELECT deleted_at, attachment_path FROM group_messages WHERE id = ?').get(messageId);
  if (existing?.deleted_at) return response.json({ success: true });
  database.prepare(`
    UPDATE group_messages SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ? WHERE id = ?
  `).run(request.user.id, messageId);
  if (existing?.attachment_path) {
    const filePath = path.join(uploadsDir, path.basename(existing.attachment_path));
    fs.unlink(filePath, (error) => {
      if (error && error.code !== 'ENOENT') console.error('Could not remove deleted group message attachment:', error.message);
    });
  }
  response.json({ success: true });
});

app.patch('/api/group-messages/:messageId', requireUser, (request, response) => {
  const messageId = Number(request.params.messageId);
  const body = typeof request.body?.body === 'string' ? request.body.body.trim() : '';
  if (!Number.isSafeInteger(messageId) || messageId < 1) return response.status(400).json({ error: 'Choose a valid message.' });
  if (!body) return response.status(400).json({ error: 'Messages cannot be empty.' });
  if (body.length > 10000) return response.status(400).json({ error: 'Messages cannot exceed 10,000 characters.' });
  const access = getGroupMessageAccess(messageId, request.user.id);
  if (!access) return response.status(404).json({ error: 'This message is not available.' });
  if (access.sender_id !== request.user.id) return response.status(403).json({ error: 'You can only edit messages you sent.' });
  const row = database.prepare(`
    SELECT deleted_at, attachment_path, attachment_url FROM group_messages WHERE id = ?
  `).get(messageId);
  if (!row || row.deleted_at) return response.status(400).json({ error: 'This message cannot be edited.' });
  if (row.attachment_path || row.attachment_url) return response.status(400).json({ error: 'Only text messages can be edited.' });
  const setting = request.user.content_setting || '7+';
  const storedBody = setting !== 'adult' && violatesContentSetting(body, setting)
    ? 'This message violates the recievers content settings'
    : body;
  database.prepare('UPDATE group_messages SET body = ? WHERE id = ?').run(storedBody, messageId);
  const message = database.prepare(`
    SELECT gm.id, gm.sender_id, users.name AS sender_name, gm.body, gm.created_at
    FROM group_messages gm JOIN users ON users.id = gm.sender_id WHERE gm.id = ?
  `).get(messageId);
  response.json({ message });
});

app.get('/api/group-messages/:messageId/attachment', requireUser, (request, response) => {
  const messageId = Number(request.params.messageId);
  const message = database.prepare(`
    SELECT gm.attachment_path, gm.attachment_name, gm.attachment_type, gm.group_id
    FROM group_messages gm
    WHERE gm.id = ? AND gm.deleted_at IS NULL
  `).get(messageId);
  if (!message?.attachment_path) return response.status(404).json({ error: 'This attachment is not available.' });
  if (!isGroupMember(message.group_id, request.user.id)) return response.status(404).json({ error: 'This attachment is not available.' });
  const filePath = path.join(uploadsDir, path.basename(message.attachment_path));
  const inlineTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav']);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (inlineTypes.has(message.attachment_type)) response.type(message.attachment_type);
  else {
    response.type('application/octet-stream');
    response.attachment(message.attachment_name || 'attachment');
  }
  response.sendFile(filePath, (error) => {
    if (error && !response.headersSent) response.status(404).end();
  });
});

app.put('/api/groups/:groupId/background', requireUser, (request, response) => {
  const groupId = Number(request.params.groupId);
  const image = request.body.image;
  if (!Number.isSafeInteger(groupId)) return response.status(400).json({ error: 'Choose a valid group.' });
  if (image !== null && (typeof image !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(image) || image.length > 2_800_000)) {
    return response.status(400).json({ error: 'Choose an image under 2 MB (PNG, JPG, GIF, or WebP).' });
  }
  if (!isGroupMember(groupId, request.user.id)) return response.status(404).json({ error: 'This group is not available.' });
  database.prepare(`
    INSERT INTO group_chat_preferences (user_id, group_id, background_image) VALUES (?, ?, ?)
    ON CONFLICT(user_id, group_id) DO UPDATE SET background_image = excluded.background_image
  `).run(request.user.id, groupId, image);
  response.json({ success: true });
});

app.put('/api/groups/:groupId/color', requireUser, (request, response) => {
  const groupId = Number(request.params.groupId);
  const color = request.body.color;
  if (!Number.isSafeInteger(groupId)) return response.status(400).json({ error: 'Choose a valid group.' });
  if (!chatPaletteColors.has(color)) return response.status(400).json({ error: 'Choose a color from the palette.' });
  if (!isGroupMember(groupId, request.user.id)) return response.status(404).json({ error: 'This group is not available.' });
  database.prepare(`
    INSERT INTO group_chat_preferences (user_id, group_id, background_color) VALUES (?, ?, ?)
    ON CONFLICT(user_id, group_id) DO UPDATE SET background_color = excluded.background_color
  `).run(request.user.id, groupId, color);
  response.json({ color });
});

app.put('/api/groups/:groupId/font', requireUser, (request, response) => {
  const groupId = Number(request.params.groupId);
  const family = typeof request.body.family === 'string' ? request.body.family.trim() : '';
  const fontData = request.body.data ?? null;
  if (!Number.isSafeInteger(groupId)) return response.status(400).json({ error: 'Choose a valid group.' });
  if (!validateChatFontInput(family, fontData)) {
    return response.status(400).json({ error: 'Choose a listed font or upload a valid WOFF, WOFF2, TTF, or OTF file under 2 MB.' });
  }
  if (!isGroupMember(groupId, request.user.id)) return response.status(404).json({ error: 'This group is not available.' });
  database.prepare(`
    INSERT INTO group_chat_preferences (user_id, group_id, font_family, font_data) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, group_id) DO UPDATE SET font_family = excluded.font_family, font_data = excluded.font_data
  `).run(request.user.id, groupId, family, fontData);
  response.json({ family });
});

app.post('/api/groups/:groupId/gifs', requireUser, async (request, response) => {
  const groupId = Number(request.params.groupId);
  const query = typeof request.body.query === 'string' ? request.body.query.trim().slice(0, 100) : '';
  if (!Number.isSafeInteger(groupId) || !isGroupMember(groupId, request.user.id)) {
    return response.status(404).json({ error: 'This group is not available.' });
  }
  if (!process.env.GIPHY_API_KEY) return response.status(503).json({ error: 'GIF search is not configured. Set GIPHY_API_KEY on the server.' });
  try {
    const endpoint = new URL('https://api.giphy.com/v1/gifs/search');
    endpoint.search = new URLSearchParams({ api_key: process.env.GIPHY_API_KEY, q: query || 'reactions', limit: '24', rating: 'g' });
    const result = await fetch(endpoint);
    const payload = await result.json();
    if (!result.ok) throw new Error('GIPHY could not complete the search.');
    response.json({ gifs: (payload.data || []).map((gif) => ({
      id: gif.id,
      preview: gif.images?.fixed_width_small?.url,
      url: gif.images?.original?.url,
      title: gif.title || 'GIF'
    })).filter((gif) => gif.preview && gif.url) });
  } catch (error) {
    response.status(502).json({ error: error.message || 'GIF search is temporarily unavailable.' });
  }
});

app.post('/api/groups/:groupId/gifs/send', requireUser, (request, response) => {
  const groupId = Number(request.params.groupId);
  const url = typeof request.body.url === 'string' ? request.body.url : '';
  const name = typeof request.body.name === 'string' ? request.body.name.slice(0, 200) : 'GIF';
  if (!Number.isSafeInteger(groupId) || !isGroupMember(groupId, request.user.id)) {
    return response.status(404).json({ error: 'This group is not available.' });
  }
  if (!/^https:\/\/media\d*\.giphy\.com\//.test(url)) return response.status(400).json({ error: 'Choose a valid GIPHY GIF.' });
  const setting = request.user.content_setting || '7+';
  if (setting !== 'adult') {
    const result = database.prepare(`
      INSERT INTO group_messages (group_id, sender_id, body) VALUES (?, ?, 'This message violates the recievers content settings')
    `).run(groupId, request.user.id);
    const message = database.prepare(`
      SELECT gm.id, gm.sender_id, users.name AS sender_name, gm.body, gm.created_at
      FROM group_messages gm JOIN users ON users.id = gm.sender_id WHERE gm.id = ?
    `).get(Number(result.lastInsertRowid));
    return response.status(201).json({ message });
  }
  const result = database.prepare(`
    INSERT INTO group_messages (group_id, sender_id, body, attachment_name, attachment_type, attachment_url)
    VALUES (?, ?, '', ?, 'image/gif', ?)
  `).run(groupId, request.user.id, name, url);
  const message = database.prepare(`
    SELECT gm.id, gm.sender_id, users.name AS sender_name, gm.body, gm.attachment_name, gm.attachment_type, gm.attachment_url, gm.created_at
    FROM group_messages gm JOIN users ON users.id = gm.sender_id WHERE gm.id = ?
  `).get(Number(result.lastInsertRowid));
  response.status(201).json({ message });
});

app.get('/api/groups/:groupId/background', requireUser, (request, response) => {
  const groupId = Number(request.params.groupId);
  if (!Number.isSafeInteger(groupId) || !isGroupMember(groupId, request.user.id)) {
    return response.status(404).json({ error: 'This group is not available.' });
  }
  const preference = database.prepare(`
    SELECT background_image, background_color, font_family, font_data
    FROM group_chat_preferences WHERE user_id = ? AND group_id = ?
  `).get(request.user.id, groupId);
  response.json({
    image: preference?.background_image || null,
    color: preference?.background_color || null,
    fontFamily: preference?.font_family || 'DM Sans',
    fontData: preference?.font_data || null
  });
});

app.post('/api/invitations', requireUser, async (request, response) => {
  const name = typeof request.body.name === 'string' ? request.body.name.trim() : '';
  const email = normalizeEmail(request.body.email);
  if (name.length < 2 || name.length > 80) return response.status(400).json({ error: 'Enter a name between 2 and 80 characters.' });
  if (!validEmail(email)) return response.status(400).json({ error: 'Enter a valid email address.' });
  if (email === request.user.email.toLowerCase()) return response.status(400).json({ error: 'You cannot invite yourself.' });

  const token = crypto.randomBytes(32).toString('base64url');
  let invitationId;
  try {
    const result = database.prepare(`
      INSERT INTO invitations (inviter_id, invitee_name, invitee_email, token_hash)
      VALUES (?, ?, ?, ?)
    `).run(request.user.id, name, email, hashToken(token));
    invitationId = Number(result.lastInsertRowid);
  } catch (error) {
    if (isUniqueConstraint(error)) return response.status(409).json({ error: 'You have already invited this email address.' });
    throw error;
  }

  const inviteUrl = `${appUrl}/invite/${token}`;
  const acceptLoginUrl = loginUrlWithInvite(token);
  const deliveredInApp = userWithEmailExists(email);
  let emailSent = false;
  let emailError = null;
  if (!deliveredInApp && resendApiKey) {
    try {
      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: mailFrom,
          to: [email],
          subject: `${request.user.name} invited you to join PiChat`,
          text: `${request.user.name} invited you to connect on PiChat. Sign in to accept: ${acceptLoginUrl}`,
          html: `<div style="font-family:Arial,sans-serif;color:#17251d;line-height:1.6"><p>${escapeHtml(name)}, ${escapeHtml(request.user.name)} invited you to connect on PiChat.</p><p><a href="${acceptLoginUrl}" style="display:inline-block;background:#244c39;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px">Accept invitation</a></p><p>Sign in to PiChat to accept. You can also view the invitation from the app after signing in.</p></div>`
        })
      });
      const resendResult = await resendResponse.json().catch(() => ({}));
      if (!resendResponse.ok) {
        throw new Error(resendResult.message || `Resend returned HTTP ${resendResponse.status}.`);
      }
      emailSent = true;
    } catch (error) {
      console.error('Resend could not send invitation email:', error.message);
      emailError = 'We could not send the email right now.';
    }
  } else if (!deliveredInApp) {
    emailError = 'We could not send the email right now.';
  }

  const invitation = database.prepare(`
    SELECT id, invitee_name AS name, invitee_email AS email, status, created_at
    FROM invitations WHERE id = ?
  `).get(invitationId);
  response.status(201).json({ invitation, emailSent, emailError, inviteUrl, deliveredInApp });
});

app.post('/api/received-invitations/:id/:decision', requireUser, (request, response) => {
  const decision = request.params.decision;
  if (!['accept', 'decline'].includes(decision)) return response.status(400).json({ error: 'Choose accept or decline.' });
  const invitationId = Number(request.params.id);
  if (!Number.isSafeInteger(invitationId)) return response.status(400).json({ error: 'Choose a valid invitation.' });
  const invitation = database.prepare(`
    SELECT id, invitee_email, status FROM invitations WHERE id = ? AND inviter_id != ?
  `).get(invitationId, request.user.id);
  if (!invitation || invitation.invitee_email.toLowerCase() !== request.user.email.toLowerCase()) {
    return response.status(404).json({ error: 'This invitation is not available.' });
  }
  if (invitation.status !== 'pending') {
    return response.status(409).json({ error: `This invitation has already been ${invitation.status}.` });
  }
  const newStatus = decision === 'accept' ? 'accepted' : 'declined';
  database.prepare('UPDATE invitations SET status = ? WHERE id = ? AND status = ?').run(newStatus, invitationId, 'pending');
  response.json({ status: newStatus });
});

app.post('/api/received-group-invites/:id/:decision', requireUser, (request, response) => {
  const decision = request.params.decision;
  if (!['accept', 'decline'].includes(decision)) return response.status(400).json({ error: 'Choose accept or decline.' });
  const inviteId = Number(request.params.id);
  if (!Number.isSafeInteger(inviteId)) return response.status(400).json({ error: 'Choose a valid invitation.' });
  const invitation = database.prepare(`
    SELECT id, invitee_email, status FROM group_invites WHERE id = ? AND inviter_id != ?
  `).get(inviteId, request.user.id);
  if (!invitation || invitation.invitee_email.toLowerCase() !== request.user.email.toLowerCase()) {
    return response.status(404).json({ error: 'This invitation is not available.' });
  }
  if (invitation.status !== 'pending') {
    return response.status(409).json({ error: `This invitation has already been ${invitation.status}.` });
  }
  const newStatus = decision === 'accept' ? 'accepted' : 'declined';
  const result = database.prepare('UPDATE group_invites SET status = ? WHERE id = ? AND status = ?').run(newStatus, inviteId, 'pending');
  if (result.changes === 0) return response.status(409).json({ error: 'This invitation could not be updated.' });
  if (decision === 'accept') joinGroupInviteById(inviteId);
  response.json({ status: newStatus });
});

app.get('/api/invite/:token', (request, response) => {
  const invitation = database.prepare(`
    SELECT invitations.invitee_name AS invitee_name, invitations.invitee_email AS invitee_email,
      invitations.status AS status, users.name AS inviter_name
    FROM invitations JOIN users ON users.id = invitations.inviter_id
    WHERE invitations.token_hash = ?
  `).get(hashToken(request.params.token));
  if (!invitation) return response.status(404).json({ error: 'This invitation link is invalid or expired.' });
  response.json({ invitation });
});

app.post('/api/invite/:token/:decision', (request, response) => {
  const decision = request.params.decision;
  if (!['accept', 'decline'].includes(decision)) return response.status(400).json({ error: 'Choose accept or decline.' });
  if (decision === 'decline') {
    return response.json({ status: 'pending' });
  }
  const result = database.prepare(`
    UPDATE invitations SET status = ? WHERE token_hash = ? AND status = 'pending'
  `).run('accepted', hashToken(request.params.token));
  if (result.changes === 0) {
    const invitation = database.prepare('SELECT status FROM invitations WHERE token_hash = ?').get(hashToken(request.params.token));
    if (!invitation) return response.status(404).json({ error: 'This invitation link is invalid or expired.' });
    return response.status(409).json({ error: `This invitation has already been ${invitation.status}.` });
  }
  response.json({ status: decision === 'accept' ? 'accepted' : 'declined' });
});

app.get('/invite/:token', (request, response) => response.sendFile(path.join(publicDir, 'index.html')));
app.get('/group-invite/:token', (request, response) => response.sendFile(path.join(publicDir, 'index.html')));
app.get('/manifest.webmanifest', (request, response) => {
  response.type('application/manifest+json');
  response.sendFile(path.join(publicDir, 'manifest.webmanifest'));
});
app.get('/sw.js', (request, response) => {
  response.set('Cache-Control', 'no-cache');
  response.type('application/javascript');
  response.sendFile(path.join(publicDir, 'sw.js'));
});
app.use(express.static(publicDir));
app.use((error, request, response, next) => {
  console.error(error);
  if (response.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') {
    return response.status(400).json({ error: 'The request body must contain valid JSON.' });
  }
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return response.status(413).json({ error: 'Files must be 100 MB or smaller.' });
  }
  const message = process.env.NODE_ENV === 'production'
    ? 'The server could not complete this request. Please try again; contact the app administrator if it continues.'
    : `The server could not complete this request: ${error.message || 'Unknown server error.'}`;
  response.status(500).json({ error: message });
});

app.listen(port, () => {
  console.log(`PiChat is running at ${appUrl}`);
});