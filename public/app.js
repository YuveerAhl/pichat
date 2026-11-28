const app = document.querySelector('#app');
const toast = document.querySelector('#toast');
let currentUser = null;
let invitations = [];
let groupInvitations = [];
let receivedInvitations = [];
let receivedGroupInvitations = [];
let contacts = [];
let groups = [];
let activeView = 'invitations';
let activeContact = null;
let activeGroup = null;
let activeChatImage = null;
let activeChatColor = null;
let activeChatFontFamily = 'Nunito';
let activeChatFontData = null;
let toastTimer;
const fontOptions = [
  'DM Sans', 'Playfair Display', 'Montserrat', 'Poppins', 'Lora', 'Merriweather', 'Oswald',
  'Bebas Neue', 'Anton', 'Nunito', 'Raleway', 'Libre Baskerville', 'Cormorant Garamond',
  'Manrope', 'Roboto', 'Open Sans', 'Lato', 'Source Serif 4', 'Archivo', 'Work Sans',
  'Space Grotesk', 'Josefin Sans', 'Barlow Condensed', 'Abril Fatface', 'DM Serif Display'
];
const contentSettings = [
  { value: '7+', label: '7+ (NO bad language and nothing inappropriate)' },
  { value: '10+', label: '10+ (some minor bad language but nothing too vulgar and nothing inappropriate)' },
  { value: '13+', label: '13+ (minor bad language and very little inappropriate content (VERY LITTLE))' },
  { value: '16+', label: '16+ (bad language is allowed but less inappropriate content)' },
  { value: 'adult', label: 'Adult (Say anything you want to)' }
];
let emojiOptions = [];
let pendingReplyTo = null;
let editingMessageId = null;
let openReactionPickerFor = null;
const chatPalette = {
  red: { label: 'Vivid red', light: '#ff5555', dark: '#801c1c' },
  blue: { label: 'Bright blue', light: '#57a5ff', dark: '#173f78' },
  green: { label: 'Light green', light: '#b5e79c', dark: '#42652f' },
  turquoise: { label: 'Turquoise', light: '#68dfd2', dark: '#176a65' },
  pink: { label: 'Pink', light: '#f49bc0', dark: '#77374f' },
  black: { label: 'Black', light: '#777777', dark: '#171717' },
  brown: { label: 'Brown', light: '#bd8865', dark: '#583520' },
  orange: { label: 'Orange', light: '#ffac52', dark: '#86410c' }
};

async function api(url, options = {}) {
  const isFormData = options.body instanceof FormData;
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
    });
  } catch {
    throw new Error('Cannot reach the server. Check your connection and confirm the app is running, then try again.');
  }

  let responseBody;
  try {
    responseBody = await response.text();
  } catch {
    throw new Error('The connection ended before the server returned a response. Please try again.');
  }
  let data = null;
  try {
    data = responseBody ? JSON.parse(responseBody) : {};
  } catch {
    data = null;
  }
  if (!response.ok) {
    const statusMessages = {
      400: 'The server rejected the request. Check the information entered and try again.',
      401: 'Your session has expired. Please sign in again.',
      403: 'You do not have permission to complete this action.',
      404: 'The requested service or item could not be found. Reload the page and try again.',
      409: 'An account with that email already exists. Try signing in instead.',
      413: 'The selected file is too large. Choose a smaller file and try again.',
      429: 'Too many requests. Wait a moment and try again.',
      500: 'The server could not complete the request. Please try again; contact the app administrator if it continues.',
      502: 'A service this request depends on is temporarily unavailable. Please try again shortly.',
      503: 'This feature is temporarily unavailable. Please try again later.'
    };
    const message = typeof data?.error === 'string' && data.error.trim();
    throw new Error(message || statusMessages[response.status] || `The request failed (HTTP ${response.status}). Please try again.`);
  }
  if (!data || typeof data !== 'object') {
    throw new Error('The server returned an unreadable response. Reload the page and try again.');
  }
  return data;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3800);
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function avatar(name, image, extraClass = '') {
  return image
    ? `<span class="avatar ${extraClass}"><img src="${image}" alt="" /></span>`
    : `<span class="avatar ${extraClass}">${initials(name)}</span>`;
}

const brandLogoMark = '<span class="brand-mark-graphic" aria-hidden="true"><img class="brand-logo-img" src="/logo.png" width="900" height="895" alt="" decoding="async" /></span>';

function brandLink(light = false) {
  return `<a class="brand${light ? ' brand-light' : ''}" href="/" aria-label="PiChat home">${brandLogoMark}</a>`;
}

function brandMobile() {
  return `<div class="auth-mobile-brand">${brandLogoMark}</div>`;
}

function renderAuth(mode = 'signup') {
  const isSignup = mode === 'signup';
  app.innerHTML = `
    <section class="auth-layout">
      <div class="auth-art">
        ${brandLink(true)}
        <div class="art-copy">
          <span class="eyebrow">CHAT IN FULL CIRCLE</span>
          <h1>Good conversations<br />go round and round.</h1>
          <p>PiChat circles your favorite people in one cozy, infinite thread.</p>
        </div>
        <div class="photo-credit">π · A place for your people</div>
      </div>
      <section class="auth-panel">
        ${brandMobile()}
        <div class="auth-form-wrap">
          <div class="form-heading">
            <span class="eyebrow">${isSignup ? 'YOUR PEOPLE, IN ONE PLACE' : 'WELCOME BACK'}</span>
            <h2>${isSignup ? 'Make yourself at home.' : 'Good to have you back.'}</h2>
            <p>${isSignup ? 'Start with the basics. You can add your people in a moment.' : 'Sign in to catch up with your people.'}</p>
          </div>
          <form id="auth-form" class="form-stack">
            ${isSignup ? `
              <label class="photo-picker" for="profile-picture">
                <span class="photo-picker-avatar" id="photo-preview">+</span>
                <span><strong>Add a profile photo</strong><small>Optional · PNG, JPG, GIF or WebP</small></span>
                <input id="profile-picture" type="file" accept="image/png,image/jpeg,image/gif,image/webp" />
              </label>
              <label class="field"><span>Your name</span><input name="name" autocomplete="name" placeholder="e.g. Alex Morgan" required minlength="2" maxlength="80" /></label>
            ` : ''}
            <label class="field"><span>Email address</span><input name="email" type="email" autocomplete="email" placeholder="you@example.com" required /></label>
            <label class="field"><span>Password</span><input name="password" type="password" autocomplete="${isSignup ? 'new-password' : 'current-password'}" placeholder="${isSignup ? 'At least 8 characters' : 'Your password'}" required ${isSignup ? 'minlength="8"' : ''} maxlength="128" /></label>
            <p class="form-error" id="form-error" aria-live="polite"></p>
            <button class="button button-primary button-wide" type="submit">${isSignup ? 'Create your account' : 'Sign in'} <span aria-hidden="true">→</span></button>
          </form>
          <p class="auth-switch">${isSignup ? 'Already have an account?' : 'New to PiChat?'} <button id="switch-auth" class="text-button" type="button">${isSignup ? 'Sign in' : 'Create an account'}</button></p>
        </div>
        <p class="auth-footnote">Where π meets your people—in bubbles, not algorithms.</p>
      </section>
    </section>`;

  const pictureInput = document.querySelector('#profile-picture');
  let profilePicture = null;
  pictureInput?.addEventListener('change', async () => {
    const file = pictureInput.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('Choose a profile photo under 2 MB.');
      pictureInput.value = '';
      return;
    }
    profilePicture = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
    document.querySelector('#photo-preview').innerHTML = `<img src="${profilePicture}" alt="Profile photo preview" />`;
  });

  const authForm = document.querySelector('#auth-form');
  const errorElement = document.querySelector('#form-error');
  authForm.addEventListener('invalid', (event) => {
    if (errorElement.textContent) return;
    const field = event.target;
    const isMissing = field.validity.valueMissing;
    if (field.name === 'name') {
      errorElement.textContent = isMissing ? 'Enter your name.' : 'Name must be between 2 and 80 characters.';
    } else if (field.name === 'email') {
      errorElement.textContent = isMissing ? 'Enter your email address.' : 'Enter a valid email address.';
    } else if (field.name === 'password') {
      errorElement.textContent = isMissing
        ? 'Enter your password.'
        : 'Password must be between 8 and 128 characters.';
    } else {
      errorElement.textContent = field.validationMessage || 'Check the highlighted field and try again.';
    }
  }, true);
  authForm.addEventListener('input', () => {
    errorElement.textContent = '';
  });
  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    if (isSignup) payload.profilePicture = profilePicture;
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    button.innerHTML = 'One moment…';
    errorElement.textContent = '';
    try {
      const result = await api(`/api/${isSignup ? 'signup' : 'login'}`, { method: 'POST', body: JSON.stringify(payload) });
      currentUser = result.user;
      renderContentSettings();
    } catch (error) {
      errorElement.textContent = error.message;
      button.disabled = false;
      button.innerHTML = `${isSignup ? 'Create your account' : 'Sign in'} <span aria-hidden="true">→</span>`;
    }
  });
  document.querySelector('#switch-auth').addEventListener('click', () => renderAuth(isSignup ? 'login' : 'signup'));
}

function renderContentSettings() {
  document.documentElement.dataset.theme = currentUser.theme === 'dark' ? 'dark' : 'light';
  const existingSetting = currentUser.content_setting || '';
  const canReturn = Boolean(existingSetting);
  app.innerHTML = `
    <section class="auth-layout">
      <div class="auth-art">
        ${brandLink(true)}
        <div class="art-copy">
          <span class="eyebrow">CHAT IN FULL CIRCLE</span>
          <h1>Good conversations<br />go round and round.</h1>
          <p>PiChat circles your favorite people in one cozy, infinite thread.</p>
        </div>
        <div class="photo-credit">π · A place for your people</div>
      </div>
      <section class="auth-panel">
        ${brandMobile()}
        <div class="auth-form-wrap">
          <div class="form-heading">
            <span class="eyebrow">CONTENT SETTINGS</span>
            <h2>Content Settings</h2>
            <p>Choose what can appear in messages sent to you.</p>
          </div>
          <form id="content-settings-form" class="content-settings-form">
            <div class="content-setting-box">
              <label class="field" for="content-setting-select">
                <span>Choose your content setting</span>
                <select id="content-setting-select" name="contentSetting" required>
                  <option value="" disabled ${existingSetting ? '' : 'selected'}>Choose a setting</option>
                  ${contentSettings.map((setting) => `<option value="${setting.value}" ${existingSetting === setting.value ? 'selected' : ''}>${escapeText(setting.label)}</option>`).join('')}
                </select>
              </label>
              <p class="content-setting-note">Message text is checked before delivery. Images, GIFs, voice messages, and other attachments are delivered as sent. Text checks use word matching and may not catch every contextual or disguised phrase.</p>
            </div>
            <p class="form-error" id="content-setting-error" aria-live="polite"></p>
            <button class="button button-primary button-wide" type="submit">${canReturn ? 'Save content setting' : 'Continue'} <span aria-hidden="true">→</span></button>
            ${canReturn ? '<button id="content-settings-cancel" class="button button-outline button-wide" type="button">Back to PiChat</button>' : ''}
          </form>
        </div>
      </section>
    </section>`;

  document.querySelector('#content-settings-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const contentSetting = form.get('contentSetting');
    const button = event.currentTarget.querySelector('button[type="submit"]');
    const errorElement = document.querySelector('#content-setting-error');
    button.disabled = true;
    errorElement.textContent = '';
    try {
      const result = await api('/api/preferences/content-setting', {
        method: 'PUT',
        body: JSON.stringify({ contentSetting })
      });
      currentUser.content_setting = result.content_setting;
      if (canReturn) {
        renderDashboard();
        showToast('Your content setting has been updated.');
        return;
      }
      await loadInvitations();
      await loadContacts();
      renderDashboard();
    } catch (error) {
      errorElement.textContent = error.message;
      button.disabled = false;
    }
  });
  document.querySelector('#content-settings-cancel')?.addEventListener('click', renderDashboard);
}

async function loadInvitations() {
  const result = await api('/api/invitations');
  invitations = result.invitations;
  groupInvitations = result.groupInvitations || [];
  receivedInvitations = result.receivedInvitations || [];
  receivedGroupInvitations = result.receivedGroupInvitations || [];
}

async function loadContacts() {
  const result = await api('/api/contacts');
  contacts = result.contacts;
}

async function loadGroups() {
  const result = await api('/api/groups');
  groups = result.groups || [];
}

function renderDashboard() {
  if (!currentUser) return;
  document.documentElement.dataset.theme = currentUser.theme === 'dark' ? 'dark' : 'light';
  const accepted = contacts;
  const pending = invitations.filter((invite) => invite.status === 'pending').length;
  const pendingGroups = groupInvitations.filter((invite) => invite.status === 'pending').length;
  const pendingReceived = receivedInvitations.filter((invite) => invite.status === 'pending').length;
  const pendingReceivedGroups = receivedGroupInvitations.filter((invite) => invite.status === 'pending').length;
  const invitationBadgeCount = pending + pendingGroups + pendingReceived + pendingReceivedGroups;
  const selectedContact = !activeGroup ? contacts.find((contact) => contact.id === activeContact) : null;
  const selectedGroup = activeGroup ? groups.find((group) => group.id === activeGroup) : null;
  if (!selectedContact) activeContact = null;
  if (!selectedGroup) activeGroup = null;
  const inChat = Boolean(selectedContact || selectedGroup);
  const viewTitle = selectedGroup ? selectedGroup.name : selectedContact ? selectedContact.name : 'Invitations';
  const content = selectedGroup ? renderGroupChat(selectedGroup) : selectedContact ? renderChat(selectedContact) : renderInvitations();
  app.innerHTML = `
    <div class="dashboard-shell ${inChat ? 'chat-open' : ''}">
      <aside class="sidebar">
        ${brandLink()}
        <div class="workspace-label">YOUR SPACE</div>
        <nav class="side-nav" aria-label="Main navigation">
          <button class="nav-item ${!inChat ? 'active' : ''}" data-view="invitations"><span class="nav-icon">↗</span> Invitations ${invitationBadgeCount ? `<span class="nav-count">${invitationBadgeCount}</span>` : ''}</button>
          ${groups.map((group) => `<button class="nav-item group-nav-item ${activeGroup === group.id ? 'active' : ''}" type="button" data-group-id="${group.id}" title="${escapeText(group.name)}">${avatar(group.name, group.profile_picture, 'nav-avatar')}<span class="chat-nav-name">${escapeText(group.name)}</span></button>`).join('')}
          ${accepted.map((person) => `<button class="nav-item chat-nav-item ${activeContact === person.id ? 'active' : ''}" type="button" data-contact-id="${person.id || ''}" ${person.id ? '' : 'disabled'} title="${escapeText(person.name)}">${avatar(person.name, person.profile_picture, 'nav-avatar')}<span class="chat-nav-name">${escapeText(person.name)}</span></button>`).join('')}
          <button class="nav-item" id="nav-content-settings" type="button"><span class="nav-icon">⚙</span> Content settings</button>
        </nav>
        <div class="sidebar-bottom">
          <div class="sidebar-note"><span class="note-spark">✳</span><p>Good things are better when shared.</p></div>
          <div class="account-area">
            <button class="account-button" id="account-menu" type="button" aria-label="Edit your account">
              ${avatar(currentUser.name, currentUser.profile_picture)}
              <span class="account-details"><strong>${escapeText(currentUser.name)}</strong><small>${escapeText(currentUser.email)}</small></span>
              <span class="account-more" aria-hidden="true">✎</span>
            </button>
          </div>
        </div>
      </aside>
      <section class="main-panel">
        <header class="topbar"><span class="topbar-date">YOUR PICHAT CIRCLE</span><div class="topbar-actions"><button id="theme-toggle" class="signout-button" type="button" aria-label="Switch to ${currentUser.theme === 'dark' ? 'light' : 'dark'} mode">${currentUser.theme === 'dark' ? '☼ Light' : '◐ Dark'}</button><button id="sign-out" class="signout-button">Sign out <span aria-hidden="true">↗</span></button></div></header>
        <main class="content-area">
          <div class="page-heading"><div><span class="eyebrow">HELLO, ${escapeText(currentUser.name.split(' ')[0].toUpperCase())}</span><h1>${escapeText(viewTitle)}<span class="heading-period">.</span></h1><p>${selectedGroup ? `Group chat with ${escapeText(selectedGroup.name)}.` : selectedContact ? `Your conversation with ${escapeText(selectedContact.name)}.` : 'A little note to someone you would like to keep close.'}</p></div>${!inChat ? '<div class="page-heading-actions"><button class="button button-outline group-invite-trigger" type="button">Invite people to a group chat</button><button class="button button-primary invite-trigger" type="button"><span>＋</span> Invite someone</button></div>' : ''}</div>
          ${content}
          <footer class="content-footer"><span>PICHAT</span><span>Talk in circles—the good kind.</span></footer>
        </main>
      </section>
    </div>
    <div id="modal-root"></div>`;

  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => {
    activeView = button.dataset.view;
    activeContact = null;
    activeGroup = null;
    renderDashboard();
  }));
  document.querySelector('#nav-content-settings').addEventListener('click', renderContentSettings);
  document.querySelectorAll('[data-contact-id]').forEach((button) => button.addEventListener('click', () => {
    if (!button.dataset.contactId) return;
    activeContact = Number(button.dataset.contactId);
    activeGroup = null;
    activeChatImage = null;
    activeChatColor = null;
    pendingReplyTo = null;
    editingMessageId = null;
    openReactionPickerFor = null;
    renderDashboard();
  }));
  document.querySelectorAll('[data-group-id]').forEach((button) => button.addEventListener('click', () => {
    activeGroup = Number(button.dataset.groupId);
    activeContact = null;
    activeChatImage = null;
    activeChatColor = null;
    renderDashboard();
  }));
  document.querySelector('#back-to-contacts')?.addEventListener('click', () => {
    activeContact = null;
    activeGroup = null;
    activeChatImage = null;
    activeChatColor = null;
    activeView = 'invitations';
    renderDashboard();
  });
  document.querySelectorAll('.invite-trigger').forEach((button) => button.addEventListener('click', openInviteModal));
  document.querySelectorAll('.group-invite-trigger').forEach((button) => button.addEventListener('click', openGroupInviteModal));
  document.querySelector('#sign-out').addEventListener('click', signOut);
  document.querySelector('#theme-toggle').addEventListener('click', async () => {
    const theme = currentUser.theme === 'dark' ? 'light' : 'dark';
    try {
      await api('/api/preferences/theme', { method: 'PUT', body: JSON.stringify({ theme }) });
      currentUser.theme = theme;
      renderDashboard();
    } catch (error) {
      showToast(error.message);
    }
  });
  document.querySelector('#account-menu').addEventListener('click', openAccountModal);
  if (activeView === 'invitations' && !inChat) {
    document.querySelectorAll('[data-refresh]').forEach((button) => button.addEventListener('click', async () => {
      await loadInvitations();
      await loadContacts();
      await loadGroups();
      renderDashboard();
      showToast('Invitation statuses are up to date.');
    }));
    document.querySelectorAll('[data-received-invite-accept]').forEach((button) => button.addEventListener('click', () => respondToReceivedInvite(button, true)));
    document.querySelectorAll('[data-received-invite-decline]').forEach((button) => button.addEventListener('click', () => respondToReceivedInvite(button, false)));
  }
  if (activeGroup) {
    loadGroupMessages(activeGroup);
    loadGroupChatAppearance(activeGroup);
    syncComposerContext();
    bindChatAppearanceControls({
      backgroundApi: `/api/groups/${activeGroup}/background`,
      colorApi: `/api/groups/${activeGroup}/color`,
      fontApi: `/api/groups/${activeGroup}/font`
    });
    bindChatMediaControls({
      gifSearchApi: `/api/groups/${activeGroup}/gifs`,
      gifSendApi: `/api/groups/${activeGroup}/gifs/send`,
      postMessageApi: `/api/groups/${activeGroup}/messages`,
      reloadMessages: () => loadGroupMessages(activeGroup)
    });
    document.querySelector('#chat-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = document.querySelector('#message-input');
      const body = input.value.trim();
      const fileInput = document.querySelector('#message-file-input');
      const file = fileInput.files?.[0];
      if (!body && !file && !editingMessageId) return;
      if (body.length > 10000) return showToast('Messages can contain up to 10,000 characters.');
      if (file && file.size > 100 * 1024 * 1024) return showToast('Choose a file under 100 MB.');
      const button = event.currentTarget.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        if (editingMessageId) {
          if (!body) return showToast('Messages cannot be empty.');
          await api(`/api/group-messages/${editingMessageId}`, { method: 'PATCH', body: JSON.stringify({ body }) });
          editingMessageId = null;
          syncComposerContext();
        } else {
          const payload = new FormData();
          payload.append('body', body);
          if (file) payload.append('file', file);
          if (pendingReplyTo) payload.append('reply_to_message_id', String(pendingReplyTo.id));
          await api(`/api/groups/${activeGroup}/messages`, { method: 'POST', body: payload });
          pendingReplyTo = null;
          syncComposerContext();
          fileInput.value = '';
          document.querySelector('#selected-file-name').textContent = '';
        }
        input.value = '';
        await loadGroupMessages(activeGroup);
        input.focus();
      } catch (error) {
        showToast(error.message);
      } finally {
        button.disabled = false;
      }
    });
    document.querySelector('#reply-preview-cancel')?.addEventListener('click', () => {
      pendingReplyTo = null;
      syncComposerContext();
    });
    document.querySelector('#edit-preview-cancel')?.addEventListener('click', () => {
      editingMessageId = null;
      document.querySelector('#message-input').value = '';
      syncComposerContext();
    });
    document.querySelector('#chat-messages')?.addEventListener('click', handleChatMessageClick);
    document.querySelector('#message-input')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        document.querySelector('#chat-form').requestSubmit();
      }
    });
  }
  if (activeContact) {
    loadChatMessages(activeContact);
    loadChatBackground(activeContact);
    syncComposerContext();
    bindChatAppearanceControls({
      backgroundApi: `/api/contacts/${activeContact}/background`,
      colorApi: `/api/contacts/${activeContact}/color`,
      fontApi: `/api/contacts/${activeContact}/font`
    });
    bindChatMediaControls({
      gifSearchApi: `/api/contacts/${activeContact}/gifs`,
      gifSendApi: `/api/contacts/${activeContact}/gifs/send`,
      postMessageApi: `/api/contacts/${activeContact}/messages`,
      reloadMessages: () => loadChatMessages(activeContact)
    });
    document.querySelector('#chat-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = document.querySelector('#message-input');
      const body = input.value.trim();
      const fileInput = document.querySelector('#message-file-input');
      const file = fileInput.files?.[0];
      if (!body && !file && !editingMessageId) return;
      if (body.length > 10000) return showToast('Messages can contain up to 10,000 characters.');
      if (file && file.size > 100 * 1024 * 1024) return showToast('Choose a file under 100 MB.');
      const button = event.currentTarget.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        if (editingMessageId) {
          if (!body) return showToast('Messages cannot be empty.');
          await api(`/api/messages/${editingMessageId}`, { method: 'PATCH', body: JSON.stringify({ body }) });
          editingMessageId = null;
          syncComposerContext();
        } else {
          const payload = new FormData();
          payload.append('body', body);
          if (file) payload.append('file', file);
          if (pendingReplyTo) payload.append('reply_to_message_id', String(pendingReplyTo.id));
          await api(`/api/contacts/${activeContact}/messages`, { method: 'POST', body: payload });
          pendingReplyTo = null;
          syncComposerContext();
          fileInput.value = '';
          document.querySelector('#selected-file-name').textContent = '';
        }
        input.value = '';
        await loadChatMessages(activeContact);
        input.focus();
      } catch (error) {
        showToast(error.message);
      } finally {
        button.disabled = false;
      }
    });
    document.querySelector('#reply-preview-cancel')?.addEventListener('click', () => {
      pendingReplyTo = null;
      syncComposerContext();
    });
    document.querySelector('#edit-preview-cancel')?.addEventListener('click', () => {
      editingMessageId = null;
      document.querySelector('#message-input').value = '';
      syncComposerContext();
    });
    document.querySelector('#chat-messages')?.addEventListener('click', handleChatMessageClick);
    document.querySelector('#message-input')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        document.querySelector('#chat-form').requestSubmit();
      }
    });
  }
}

async function signOut() {
  try {
    await api('/api/logout', { method: 'POST' });
    currentUser = null;
    invitations = [];
    groupInvitations = [];
    receivedInvitations = [];
    receivedGroupInvitations = [];
    contacts = [];
    groups = [];
    activeContact = null;
    activeGroup = null;
    activeView = 'invitations';
    renderAuth('login');
  } catch (error) {
    showToast(error.message);
  }
}

function renderContacts(contacts) {
  if (!contacts.length) return `
    <section class="empty-state">
      <div class="empty-art" aria-hidden="true"><span class="empty-orbit orbit-one"></span><span class="empty-orbit orbit-two"></span><span class="empty-dot">+</span><span class="empty-stamp">A GOOD<br />PLACE TO<br />BEGIN</span></div>
      <span class="eyebrow">IT STARTS WITH ONE</span>
      <h2>No contacts here.</h2>
      <p>Your corner is ready. Invite someone you would like to keep in the loop.</p>
      <button class="button button-outline invite-trigger"><span>＋</span> Invite your first person</button>
    </section>`;
  return `<section class="contact-section"><div class="section-caption"><span>CONNECTED PEOPLE</span><span>${contacts.length} ${contacts.length === 1 ? 'PERSON' : 'PEOPLE'}</span></div><div class="people-list">${contacts.map((person, index) => `
    <button class="person-row ${person.id ? 'person-row-clickable' : 'person-row-unavailable'}" type="button" data-contact-id="${person.id || ''}" ${person.id ? '' : 'disabled'} style="--row-index:${index}">${avatar(person.name, person.profile_picture, 'person-avatar')}<span class="person-info"><strong>${escapeText(person.name)}</strong><small>${escapeText(person.email)}</small></span><span class="status-pill status-accepted"><span></span>${person.id ? 'Open chat' : 'Waiting for account'}</span><span class="person-arrow">↗</span></button>`).join('')}</div></section>`;
}

function renderChatPickersHtml() {
  return `<div class="message-pickers"><div id="emoji-picker" class="emoji-picker" hidden><input id="emoji-search" type="search" placeholder="Search emoji" aria-label="Search emoji by name" /><div id="emoji-results" class="emoji-grid"><span class="picker-status">Opening emoji…</span></div></div><div id="gif-picker" class="gif-picker" hidden><form id="gif-search-form"><input id="gif-search" type="search" placeholder="Search GIPHY" aria-label="Search GIPHY" /><button type="submit">Search</button></form><div id="gif-results" class="gif-results"><span class="picker-status">Search GIPHY to find a GIF.</span></div></div></div>`;
}

function renderChatComposerHtml({ placeholder = 'Write a message…', directChat = false } = {}) {
  const contexts = directChat ? `
      <div id="edit-preview" class="composer-context edit-context" hidden><span class="composer-context-label">Editing message</span><button id="edit-preview-cancel" class="composer-context-cancel" type="button" aria-label="Cancel editing">×</button></div>
      <div id="reply-preview" class="composer-context reply-context" hidden><span class="composer-context-label">Replying to</span><p id="reply-preview-text" class="reply-preview-text"></p><button id="reply-preview-cancel" class="composer-context-cancel" type="button" aria-label="Cancel quote reply">×</button></div>` : '';
  return `<form id="chat-form" class="chat-composer"><div class="composer-entry">${contexts}<span id="selected-file-name" class="selected-file-name" aria-live="polite"></span><textarea id="message-input" name="body" rows="1" maxlength="10000" placeholder="${escapeText(placeholder)}" aria-label="${escapeText(placeholder)}" autocorrect="on" autocomplete="off" spellcheck="true"></textarea><div class="composer-tools"><button id="emoji-toggle" class="composer-tool" type="button" title="Add emoji" aria-label="Add emoji">☺</button><button id="gif-toggle" class="composer-tool" type="button" title="Search GIFs" aria-label="Search GIFs">GIF</button><label class="composer-tool" for="message-file-input" title="Attach a file or sticker" aria-label="Attach a file or sticker">＋<input id="message-file-input" type="file" /></label><button id="voice-record" class="composer-tool" type="button" title="Record a voice message" aria-label="Record a voice message">🎙</button><button type="submit" aria-label="Send message" title="Send message">↑</button></div><span class="character-limit">10,000 max</span></div></form>`;
}

function bindChatMediaControls({ gifSearchApi, gifSendApi, postMessageApi, reloadMessages }) {
  document.querySelector('#emoji-toggle')?.addEventListener('click', () => {
    const picker = document.querySelector('#emoji-picker');
    picker.hidden = !picker.hidden;
    document.querySelector('#gif-picker').hidden = true;
    if (!picker.hidden) loadEmojiCatalog();
  });
  document.querySelector('#emoji-search')?.addEventListener('input', (event) => renderEmojiOptions(event.currentTarget.value));
  document.querySelector('#emoji-results')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-emoji]');
    if (!button) return;
    const input = document.querySelector('#message-input');
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.setRangeText(button.dataset.emoji, start, end, 'end');
    input.focus();
    document.querySelector('#emoji-picker').hidden = true;
  });
  document.querySelector('#gif-toggle')?.addEventListener('click', () => {
    const picker = document.querySelector('#gif-picker');
    picker.hidden = !picker.hidden;
    document.querySelector('#emoji-picker').hidden = true;
    if (!picker.hidden) document.querySelector('#gif-search').focus();
  });
  document.querySelector('#gif-search-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const results = document.querySelector('#gif-results');
    results.innerHTML = '<span class="picker-status">Searching…</span>';
    try {
      const result = await api(gifSearchApi, { method: 'POST', body: JSON.stringify({ query: document.querySelector('#gif-search').value }) });
      results.innerHTML = result.gifs.map((gif) => `<button class="gif-choice" type="button" data-gif-url="${escapeText(gif.url)}" data-gif-name="${escapeText(gif.title)}"><img src="${escapeText(gif.preview)}" alt="${escapeText(gif.title)}" loading="lazy" /></button>`).join('') || '<span class="picker-status">No GIFs found.</span>';
      results.querySelectorAll('[data-gif-url]').forEach((button) => button.addEventListener('click', async () => {
        try {
          await api(gifSendApi, { method: 'POST', body: JSON.stringify({ url: button.dataset.gifUrl, name: button.dataset.gifName }) });
          document.querySelector('#gif-picker').hidden = true;
          await reloadMessages();
        } catch (error) {
          showToast(error.message);
        }
      }));
    } catch (error) {
      results.innerHTML = `<span class="picker-status">${escapeText(error.message)}</span>`;
    }
  });
  document.querySelector('#voice-record')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (button.dataset.recording === 'true') {
      window.activeRecorder?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return showToast('Voice recording is not supported in this browser.');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.addEventListener('dataavailable', (recordEvent) => { if (recordEvent.data.size) chunks.push(recordEvent.data); });
      recorder.addEventListener('stop', async () => {
        stream.getTracks().forEach((track) => track.stop());
        button.dataset.recording = 'false';
        button.title = 'Record a voice message';
        button.textContent = '🎙';
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size > 100 * 1024 * 1024) return showToast('Voice message exceeds the 100 MB file limit.');
        const payload = new FormData();
        payload.append('body', '');
        payload.append('file', blob, `voice-message.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`);
        try {
          await api(postMessageApi, { method: 'POST', body: payload });
          await reloadMessages();
        } catch (error) {
          showToast(error.message);
        }
      }, { once: true });
      window.activeRecorder = recorder;
      recorder.start();
      button.dataset.recording = 'true';
      button.title = 'Stop recording';
      button.textContent = '■';
    } catch (error) {
      showToast(error.name === 'NotAllowedError' ? 'Allow microphone access to record a voice message.' : 'The microphone could not be opened.');
    }
  });
  document.querySelector('#message-file-input')?.addEventListener('change', (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      showToast('Choose a file under 100 MB.');
      event.currentTarget.value = '';
      return;
    }
    document.querySelector('#selected-file-name').textContent = file.name;
  });
}

function renderChatAppearanceControls() {
  const swatches = Object.entries(chatPalette).map(([color, option]) => `
    <button class="palette-swatch" type="button" data-chat-color="${color}" aria-label="${option.label}" aria-pressed="false" title="${option.label}" style="--swatch-light:${option.light};--swatch-dark:${option.dark}"><span>✓</span></button>`).join('');
  return `
      <details class="appearance-control"><summary class="chat-tool" title="Chat fonts" aria-label="Chat fonts">Fonts</summary><div class="appearance-menu"><label for="chat-font-select">Font family</label><select id="chat-font-select">${fontOptions.map((font) => `<option value="${escapeText(font)}" style="font-family:'${escapeText(font)}',sans-serif">${escapeText(font)}</option>`).join('')}</select><label class="font-upload" for="chat-font-input">Upload a font <small>WOFF, WOFF2, TTF, OTF · max 2 MB</small><input id="chat-font-input" type="file" accept=".woff,.woff2,.ttf,.otf,font/woff,font/woff2,font/ttf,font/otf" /></label></div></details>
      <div class="chat-tools"><div class="palette-control"><button id="chat-palette-toggle" class="chat-tool" type="button" title="Chat colors" aria-label="Chat colors" aria-expanded="false" aria-controls="chat-palette">🎨</button><div class="chat-palette" id="chat-palette" aria-label="Chat color palette" hidden>${swatches}</div></div><label class="chat-tool" title="Choose a background for this chat">▧<span>Background</span><input id="chat-background-input" type="file" accept="image/png,image/jpeg,image/gif,image/webp" /></label><button id="clear-chat-background" class="chat-tool chat-clear" type="button" title="Remove chat background" aria-label="Remove chat background">⌫</button></div>`;
}

function bindChatAppearanceControls({ backgroundApi, colorApi, fontApi }) {
  document.querySelector('#chat-palette-toggle')?.addEventListener('click', (event) => {
    const menu = document.querySelector('#chat-palette');
    const isOpen = menu.hidden;
    menu.hidden = !isOpen;
    event.currentTarget.setAttribute('aria-expanded', String(isOpen));
  });
  document.querySelectorAll('[data-chat-color]').forEach((button) => button.addEventListener('click', async () => {
    const color = button.dataset.chatColor;
    try {
      await api(colorApi, { method: 'PUT', body: JSON.stringify({ color }) });
      applyChatAppearance({ color });
      document.querySelectorAll('[data-chat-color]').forEach((swatch) => {
        swatch.setAttribute('aria-pressed', String(swatch.dataset.chatColor === color));
      });
      document.querySelector('#chat-palette').hidden = true;
      document.querySelector('#chat-palette-toggle').setAttribute('aria-expanded', 'false');
    } catch (error) {
      showToast(error.message);
    }
  }));
  const backgroundInput = document.querySelector('#chat-background-input');
  backgroundInput?.addEventListener('change', async () => {
    const file = backgroundInput.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('Choose a chat background under 2 MB.');
      backgroundInput.value = '';
      return;
    }
    try {
      const image = await readImageFile(file);
      await api(backgroundApi, { method: 'PUT', body: JSON.stringify({ image }) });
      applyChatAppearance({ image });
    } catch (error) {
      showToast(error.message);
    }
  });
  document.querySelector('#clear-chat-background')?.addEventListener('click', async () => {
    try {
      await api(backgroundApi, { method: 'PUT', body: JSON.stringify({ image: null }) });
      applyChatAppearance({ image: null });
    } catch (error) {
      showToast(error.message);
    }
  });
  document.querySelector('#chat-font-select')?.addEventListener('change', async (event) => {
    const family = event.currentTarget.value;
    try {
      await api(fontApi, { method: 'PUT', body: JSON.stringify({ family }) });
      applyChatFont(family, null);
    } catch (error) {
      showToast(error.message);
    }
  });
  document.querySelector('#chat-font-input')?.addEventListener('change', async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('Choose a font file under 2 MB.');
      event.currentTarget.value = '';
      return;
    }
    const family = file.name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 64) || 'Custom font';
    try {
      const data = await readImageFile(file);
      const fontData = data.replace(/^data:.*?;base64,/, `data:font/${fontMimeSubtype(file)};base64,`);
      await api(fontApi, { method: 'PUT', body: JSON.stringify({ family, data: fontData }) });
      applyChatFont(family, fontData);
      showToast(`${family} is now your chat font.`);
    } catch (error) {
      showToast(error.message);
    } finally {
      event.currentTarget.value = '';
    }
  });
}

function renderGroupChat(group) {
  return `<section class="chat-panel group-chat-panel" aria-label="Group chat ${escapeText(group.name)}">
    <header class="chat-header"><button id="back-to-contacts" class="chat-back" type="button" aria-label="Back to invitations">←</button>${avatar(group.name, group.profile_picture, 'chat-avatar')}<div class="chat-contact"><strong>${escapeText(group.name)}</strong><small>PiChat group</small></div>${renderChatAppearanceControls()}</header>
    <div class="chat-messages group-chat-messages" id="chat-messages" aria-live="polite"><p class="chat-loading">Opening your group chat…</p></div>
    ${renderChatPickersHtml()}${renderChatComposerHtml({ placeholder: 'Write a message to the group…', directChat: true })}
  </section>`;
}

function renderGroupChatMessage(message) {
  const own = message.sender_id === currentUser.id;
  const time = new Date(`${message.created_at.replace(' ', 'T')}Z`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const sender = own ? 'You' : (message.sender_name || 'Member');
  const replyQuote = message.reply_to_message_id && message.reply_to_preview
    ? `<blockquote class="message-quote">${escapeText(message.reply_to_preview)}</blockquote>`
    : '';
  const reactionPicker = openReactionPickerFor === message.id
    ? `<div class="message-reaction-picker" data-message-id="${message.id}"><div class="message-reaction-quick">${['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => `<button type="button" data-action="pick-reaction" data-emoji="${emoji}">${emoji}</button>`).join('')}<button type="button" class="message-reaction-more" data-action="more-reactions" title="More emoji">⋯</button></div></div>`
    : '';
  const reactions = renderMessageReactions(message.reactions);
  const senderAvatar = messageSenderAvatar(message, own);
  if (message.deleted) {
    const bubble = `<article class="message message-deleted message-bubble ${own ? 'message-own' : 'message-other'}">
        ${renderMessageActions(message, own)}
        <p class="message-removed">Message removed</p>
        <time>${time}</time>
      </article>`;
    return `<div class="group-message-stack ${own ? 'message-from-own' : 'message-from-other'}" data-message-id="${message.id}">
      <p class="message-sender-name">${escapeText(sender)}</p>
      ${messageRowHtml(own, senderAvatar, bubble)}
      ${reactions ? `<div class="message-reactions-below">${reactions}</div>` : ''}
    </div>`;
  }
  const attachment = message.attachment_url ? renderMessageAttachment(message) : '';
  const body = messageBodyParagraph(message.body, { attachment, replyQuote });
  const fewEmoji = body.includes('message-body-emoji-big');
  const bubble = `<article class="message message-bubble group-message ${own ? 'message-own' : 'message-other'}${fewEmoji ? ' message-emoji-only' : ''}">
      ${renderMessageActions(message, own)}
      ${reactionPicker}
      ${replyQuote}${body}${attachment}
      <time>${time}</time>
    </article>`;
  return `<div class="group-message-stack ${own ? 'message-from-own' : 'message-from-other'}" data-message-id="${message.id}">
    <p class="message-sender-name">${escapeText(sender)}</p>
    ${messageRowHtml(own, senderAvatar, bubble)}
    ${reactions ? `<div class="message-reactions-below">${reactions}</div>` : ''}
  </div>`;
}

async function loadGroupChatAppearance(groupId) {
  try {
    const result = await api(`/api/groups/${groupId}/background`);
    if (activeGroup === groupId) {
      applyChatAppearance({ image: result.image, color: result.color });
      applyChatFont(result.fontFamily || 'DM Sans', result.fontData || null);
      document.querySelectorAll('[data-chat-color]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.chatColor === result.color));
      });
    }
  } catch (error) {
    showToast(error.message);
  }
}

async function loadGroupMessages(groupId, { force = false } = {}) {
  try {
    const result = await api(`/api/groups/${groupId}/messages`);
    const list = document.querySelector('#chat-messages');
    if (!list || activeGroup !== groupId) return;
    const signature = JSON.stringify(result.messages.map((message) => [
      message.id,
      message.sender_id,
      message.body,
      message.attachment_url,
      message.created_at,
      message.deleted,
      message.reply_to_message_id,
      message.reply_to_preview,
      (message.reactions || []).map((reaction) => [reaction.user_id, reaction.emoji])
    ]));
    if (!force && list.dataset.messageSignature === signature) return;
    list.dataset.messageSignature = signature;
    const wasAtBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    list.innerHTML = result.messages.length
      ? result.messages.map((message) => renderGroupChatMessage(message)).join('')
      : '<p class="chat-empty">Say hello to the group.</p>';
    if (wasAtBottom || result.messages.length <= 1) list.scrollTop = list.scrollHeight;
  } catch (error) {
    showToast(error.message);
  }
}

function renderChat(contact) {
  return `<section class="chat-panel" aria-label="Chat with ${escapeText(contact.name)}">
    <header class="chat-header"><button id="back-to-contacts" class="chat-back" type="button" aria-label="Back to contacts">←</button>${avatar(contact.name, contact.profile_picture, 'chat-avatar')}<div class="chat-contact"><strong>${escapeText(contact.name)}</strong><small>Connected on PiChat</small></div>${renderChatAppearanceControls()}</header><div class="chat-messages" id="chat-messages" aria-live="polite"><p class="chat-loading">Opening your conversation…</p></div>
    ${renderChatPickersHtml()}${renderChatComposerHtml({ placeholder: 'Write a message…', directChat: true })}
  </section>`;
}

function messagePreviewText(message) {
  if (message.deleted) return '[Message removed]';
  if (message.body) return message.body;
  if (message.attachment_url) return message.attachment_type === 'image/gif' ? (message.attachment_name || 'GIF') : '[Media]';
  return '[Message]';
}

function isFewEmojiOnly(body) {
  if (!body || typeof body !== 'string') return false;
  const trimmed = body.trim();
  if (!trimmed) return false;
  const withoutEmoji = trimmed.replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u{1F3FB}-\u{1F3FF}]/gu, '').trim();
  if (withoutEmoji.length > 0) return false;
  const emojiCount = [...trimmed.matchAll(/\p{Extended_Pictographic}/gu)].length;
  return emojiCount >= 1 && emojiCount <= 3;
}

function messageBodyParagraph(body, { attachment, replyQuote }) {
  if (!body) return '';
  const fewEmoji = !attachment && !replyQuote && isFewEmojiOnly(body);
  const className = fewEmoji ? 'message-body message-body-emoji-big' : 'message-body';
  return `<p class="${className}">${escapeText(body)}</p>`;
}

function messageSenderAvatar(message, own) {
  const name = own ? currentUser.name : (message.sender_name || contacts.find((c) => c.id === message.sender_id)?.name || 'Member');
  const picture = own
    ? currentUser.profile_picture
    : (message.sender_profile_picture ?? contacts.find((c) => c.id === message.sender_id)?.profile_picture);
  return avatar(name, picture, 'message-avatar');
}

function messageRowHtml(own, senderAvatar, bubbleHtml, extraAttrs = '') {
  const side = own ? 'message-from-own' : 'message-from-other';
  const content = own ? `${bubbleHtml}${senderAvatar}` : `${senderAvatar}${bubbleHtml}`;
  return `<div class="message-row ${side}" ${extraAttrs}>${content}</div>`;
}

function renderMessageReactions(reactions = []) {
  if (!reactions.length) return '';
  const grouped = new Map();
  for (const reaction of reactions) {
    if (!reaction.emoji) continue;
    const entry = grouped.get(reaction.emoji) || { emoji: reaction.emoji, count: 0, mine: false };
    entry.count += 1;
    if (reaction.user_id === currentUser.id) entry.mine = true;
    grouped.set(reaction.emoji, entry);
  }
  const chips = [...grouped.values()].map((item) => `
    <button class="message-reaction-chip${item.mine ? ' is-mine' : ''}" type="button" data-action="react" data-emoji="${escapeText(item.emoji)}" title="${item.count} reaction${item.count === 1 ? '' : 's'}">
      ${escapeText(item.emoji)}<span class="reaction-count">${item.count > 1 ? item.count : ''}</span>
    </button>`).join('');
  return `<div class="message-reactions" role="group" aria-label="Reactions">${chips}</div>`;
}

function renderMessageActions(message, own) {
  if (message.deleted) return '';
  const canEdit = own && message.body && !message.attachment_url;
  return `
    <div class="message-actions" role="toolbar" aria-label="Message actions">
      <button type="button" class="message-action" data-action="react" title="React" aria-label="React to message">☺</button>
      <button type="button" class="message-action" data-action="quote" title="Quote in reply" aria-label="Quote in reply">↳</button>
      ${canEdit ? '<button type="button" class="message-action" data-action="edit" title="Edit message" aria-label="Edit message">✎</button>' : ''}
      ${own ? '<button type="button" class="message-action" data-action="delete" title="Delete message" aria-label="Delete message">🗑</button>' : ''}
    </div>`;
}

function renderChatMessage(message) {
  const own = message.sender_id === currentUser.id;
  const time = new Date(`${message.created_at.replace(' ', 'T')}Z`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const replyQuote = message.reply_to_message_id && message.reply_to_preview
    ? `<blockquote class="message-quote">${escapeText(message.reply_to_preview)}</blockquote>`
    : '';
  const senderAvatar = messageSenderAvatar(message, own);
  const rowAttrs = `data-message-id="${message.id}"`;
  if (message.deleted) {
    const bubble = `<article class="message message-deleted ${own ? 'message-own' : ''}">
      ${renderMessageActions(message, own)}
      <p class="message-removed">Message removed</p>
      <time>${time}</time>
    </article>`;
    return messageRowHtml(own, senderAvatar, bubble, rowAttrs);
  }
  const attachment = message.attachment_url ? renderMessageAttachment(message) : '';
  const body = messageBodyParagraph(message.body, { attachment, replyQuote });
  const fewEmoji = body.includes('message-body-emoji-big');
  const reactionPicker = openReactionPickerFor === message.id
    ? `<div class="message-reaction-picker" data-message-id="${message.id}"><div class="message-reaction-quick">${['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => `<button type="button" data-action="pick-reaction" data-emoji="${emoji}">${emoji}</button>`).join('')}<button type="button" class="message-reaction-more" data-action="more-reactions" title="More emoji">⋯</button></div></div>`
    : '';
  const bubble = `<article class="message ${own ? 'message-own' : ''}${fewEmoji ? ' message-emoji-only' : ''}">
    ${renderMessageActions(message, own)}
    ${reactionPicker}
    ${replyQuote}${body}${attachment}
    ${renderMessageReactions(message.reactions)}
    <time>${time}</time>
  </article>`;
  return messageRowHtml(own, senderAvatar, bubble, rowAttrs);
}

function syncComposerContext() {
  const replyPreview = document.querySelector('#reply-preview');
  const editPreview = document.querySelector('#edit-preview');
  const replyText = document.querySelector('#reply-preview-text');
  const input = document.querySelector('#message-input');
  const submit = document.querySelector('#chat-form button[type="submit"]');
  if (replyPreview) {
    const showReply = Boolean(pendingReplyTo && !editingMessageId);
    replyPreview.hidden = !showReply;
    if (showReply && replyText) replyText.textContent = pendingReplyTo.preview;
  }
  if (editPreview) editPreview.hidden = !editingMessageId;
  if (input) {
    input.placeholder = editingMessageId ? 'Edit your message…' : 'Write a message…';
    input.setAttribute('aria-label', editingMessageId ? 'Edit message' : 'Write a message');
  }
  if (submit) submit.title = editingMessageId ? 'Save edit' : 'Send message';
}

async function handleChatMessageClick(event) {
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton || (!activeContact && !activeGroup)) return;
  const isGroup = Boolean(activeGroup);
  const messageEl = actionButton.closest('[data-message-id]');
  const messageId = Number(messageEl?.dataset.messageId);
  if (!Number.isSafeInteger(messageId)) return;
  const action = actionButton.dataset.action;
  const emoji = actionButton.dataset.emoji;
  const reactionsApi = (id) => (isGroup ? `/api/group-messages/${id}/reactions` : `/api/messages/${id}/reactions`);
  const messageResourceApi = (id) => (isGroup ? `/api/group-messages/${id}` : `/api/messages/${id}`);
  const messagesListApi = isGroup ? `/api/groups/${activeGroup}/messages` : `/api/contacts/${activeContact}/messages`;
  const reloadMessages = () => (isGroup ? loadGroupMessages(activeGroup, { force: true }) : loadChatMessages(activeContact, { force: true }));

  if (action === 'pick-reaction' && emoji) {
    event.stopPropagation();
    try {
      await api(reactionsApi(messageId), { method: 'PUT', body: JSON.stringify({ emoji }) });
      openReactionPickerFor = null;
      await reloadMessages();
    } catch (error) {
      showToast(error.message);
    }
    return;
  }

  if (action === 'more-reactions') {
    event.stopPropagation();
    openReactionPickerFor = messageId;
    await loadEmojiCatalog();
    const picker = messageEl.querySelector('.message-reaction-picker');
    if (picker) {
      picker.innerHTML = `
        <input type="search" class="message-reaction-search" placeholder="Search emoji" aria-label="Search emoji for reaction" />
        <div class="message-reaction-results emoji-grid">${document.querySelector('#emoji-results')?.innerHTML || ''}</div>`;
      const search = picker.querySelector('.message-reaction-search');
      const results = picker.querySelector('.message-reaction-results');
      search?.addEventListener('input', () => {
        const normalizedQuery = search.value.trim().toLocaleLowerCase();
        const matches = emojiOptions.filter((item) => !normalizedQuery || item.name.toLocaleLowerCase().includes(normalizedQuery));
        results.innerHTML = matches.map((item) => `<button type="button" data-action="pick-reaction" data-emoji="${escapeText(item.emoji)}" aria-label="React with ${escapeText(item.name)}" title="${escapeText(item.name)}">${escapeText(item.emoji)}</button>`).join('') || '<span class="picker-status">No matching emoji.</span>';
      });
      search?.focus();
    }
    return;
  }

  if (action === 'react' && !emoji) {
    event.stopPropagation();
    openReactionPickerFor = openReactionPickerFor === messageId ? null : messageId;
    await reloadMessages();
    return;
  }

  if (action === 'react' && emoji) {
    try {
      await api(reactionsApi(messageId), { method: 'PUT', body: JSON.stringify({ emoji }) });
      await reloadMessages();
    } catch (error) {
      showToast(error.message);
    }
    return;
  }

  let message;
  try {
    const result = await api(messagesListApi);
    message = result.messages.find((item) => item.id === messageId);
  } catch (error) {
    showToast(error.message);
    return;
  }
  if (!message || message.deleted) return;

  if (action === 'quote') {
    pendingReplyTo = { id: message.id, preview: messagePreviewText(message) };
    editingMessageId = null;
    syncComposerContext();
    document.querySelector('#message-input')?.focus();
    return;
  }

  if (action === 'edit') {
    if (message.sender_id !== currentUser.id || !message.body || message.attachment_url) return;
    editingMessageId = message.id;
    pendingReplyTo = null;
    const input = document.querySelector('#message-input');
    if (input) input.value = message.body;
    syncComposerContext();
    input?.focus();
    return;
  }

  if (action === 'delete') {
    if (message.sender_id !== currentUser.id) return;
    try {
      await api(messageResourceApi(messageId), { method: 'DELETE' });
      if (editingMessageId === messageId) {
        editingMessageId = null;
        document.querySelector('#message-input').value = '';
        syncComposerContext();
      }
      await reloadMessages();
    } catch (error) {
      showToast(error.message);
    }
  }
}

async function loadChatMessages(contactId, { force = false } = {}) {
  try {
    const result = await api(`/api/contacts/${contactId}/messages`);
    const list = document.querySelector('#chat-messages');
    if (!list || activeContact !== contactId) return;
    const signature = JSON.stringify(result.messages.map((message) => [
      message.id,
      message.sender_id,
      message.body,
      message.attachment_url,
      message.created_at,
      message.deleted,
      message.reply_to_message_id,
      message.reply_to_preview,
      (message.reactions || []).map((reaction) => [reaction.user_id, reaction.emoji])
    ]));
    if (!force && list.dataset.messageSignature === signature) return;
    list.dataset.messageSignature = signature;
    const wasAtBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    list.innerHTML = result.messages.length
      ? result.messages.map((message) => renderChatMessage(message)).join('')
      : '<p class="chat-empty">A good conversation can start with a simple hello.</p>';
    if (wasAtBottom || result.messages.length <= 1) list.scrollTop = list.scrollHeight;
  } catch (error) {
    showToast(error.message);
  }
}

async function loadChatBackground(contactId) {
  try {
    const result = await api(`/api/contacts/${contactId}/background`);
    if (activeContact === contactId) {
      applyChatAppearance({ image: result.image, color: result.color });
      applyChatFont(result.fontFamily || 'DM Sans', result.fontData || null);
      document.querySelectorAll('[data-chat-color]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.chatColor === result.color));
      });
    }
  } catch (error) {
    showToast(error.message);
  }
}

function renderMessageAttachment(message) {
  const url = escapeText(message.attachment_url);
  const type = message.attachment_type || '';
  const name = escapeText(message.attachment_name || 'Attachment');
  if (['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(type)) return `<a class="message-attachment image-attachment" href="${url}" target="_blank" rel="noreferrer"><img src="${url}" alt="${name}" loading="lazy" /></a>`;
  if (type.startsWith('audio/')) return `<audio class="message-audio" controls src="${url}">Audio playback is not supported.</audio>`;
  return `<a class="message-file" href="${url}" download>${name} <span>Download</span></a>`;
}

async function loadEmojiCatalog() {
  if (emojiOptions.length) return renderEmojiOptions(document.querySelector('#emoji-search').value);
  const results = document.querySelector('#emoji-results');
  try {
    const catalog = await api('/api/emojis');
    emojiOptions = catalog.emojis;
    renderEmojiOptions(document.querySelector('#emoji-search').value);
  } catch (error) {
    results.innerHTML = `<span class="picker-status">${escapeText(error.message)}</span>`;
  }
}

function renderEmojiOptions(query = '') {
  const results = document.querySelector('#emoji-results');
  if (!results) return;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = emojiOptions.filter((item) => !normalizedQuery || item.name.toLocaleLowerCase().includes(normalizedQuery));
  results.innerHTML = matches.map((item) => `<button type="button" data-emoji="${escapeText(item.emoji)}" aria-label="Insert ${escapeText(item.name)}" title="${escapeText(item.name)}">${escapeText(item.emoji)}</button>`).join('') || '<span class="picker-status">No matching emoji.</span>';
}

function fontMimeSubtype(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  return extension === 'woff' || extension === 'woff2' ? extension : extension === 'ttf' ? 'ttf' : 'otf';
}

function applyChatFont(family, data) {
  activeChatFontFamily = family;
  activeChatFontData = data;
  const messages = document.querySelector('#chat-messages');
  const safeFamily = family.replace(/['\\]/g, '');
  if (messages) messages.style.fontFamily = `'${safeFamily}', sans-serif`;
  const composer = document.querySelector('.chat-composer');
  if (composer) composer.style.fontFamily = `'${safeFamily}', sans-serif`;
  let googleFontLink = document.querySelector('#chat-google-font');
  if (!data && fontOptions.includes(family)) {
    if (!googleFontLink) {
      googleFontLink = document.createElement('link');
      googleFontLink.id = 'chat-google-font';
      googleFontLink.rel = 'stylesheet';
      document.head.append(googleFontLink);
    }
    googleFontLink.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}&display=swap`;
  } else if (googleFontLink) {
    googleFontLink.remove();
  }
  const select = document.querySelector('#chat-font-select');
  if (select) {
    let customOption = select.querySelector('[data-custom-font]');
    if (!fontOptions.includes(family)) {
      if (!customOption) {
        customOption = document.createElement('option');
        customOption.dataset.customFont = 'true';
        select.prepend(customOption);
      }
      customOption.value = family;
      customOption.textContent = family;
      select.value = family;
    } else {
      customOption?.remove();
      select.value = family;
    }
  }
  let fontStyle = document.querySelector('#custom-chat-font');
  if (data) {
    if (!fontStyle) {
      fontStyle = document.createElement('style');
      fontStyle.id = 'custom-chat-font';
      document.head.append(fontStyle);
    }
    fontStyle.textContent = `@font-face{font-family:"${family.replace(/['"\\]/g, '')}";src:url("${data}")}`;
  } else if (fontStyle) {
    fontStyle.remove();
  }
}

function applyChatAppearance({ image = activeChatImage, color = activeChatColor } = {}) {
  activeChatImage = image;
  activeChatColor = color;
  const panel = document.querySelector('.chat-panel');
  const messages = document.querySelector('#chat-messages');
  const selected = chatPalette[color];
  const darkMode = document.documentElement.dataset.theme === 'dark';
  if (panel) {
    for (const property of ['--chat-light', '--chat-dark', '--chat-bubble', '--chat-bubble-ink']) panel.style.removeProperty(property);
    if (selected) {
      panel.style.setProperty('--chat-light', selected.light);
      panel.style.setProperty('--chat-dark', selected.dark);
      panel.style.setProperty('--chat-bubble', darkMode ? selected.light : selected.dark);
      panel.style.setProperty('--chat-bubble-ink', darkMode && color !== 'black' ? '#202820' : '#ffffff');
    }
    panel.dataset.hasImage = String(Boolean(image));
    panel.dataset.hasColor = String(Boolean(selected));
  }
  if (messages) {
    messages.style.backgroundImage = image ? `url("${image}")` : '';
    messages.style.backgroundColor = selected && !image ? (darkMode ? selected.dark : selected.light) : '';
  }
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('This image could not be opened.'));
    reader.readAsDataURL(file);
  });
}

function receivedInviteActions(invite, kind) {
  if (invite.status !== 'pending') {
    return `<span class="status-pill status-${invite.status}"><span></span>${statusLabel(invite.status)}</span>`;
  }
  return `<div class="invitation-row-actions"><button type="button" class="button button-primary button-compact" data-received-invite-accept data-kind="${kind}" data-id="${invite.id}">Accept</button><button type="button" class="button button-quiet button-compact" data-received-invite-decline data-kind="${kind}" data-id="${invite.id}">Decline</button></div>`;
}

async function respondToReceivedInvite(button, accept) {
  const id = button.dataset.id;
  const kind = button.dataset.kind;
  const endpoint = kind === 'group'
    ? `/api/received-group-invites/${encodeURIComponent(id)}/${accept ? 'accept' : 'decline'}`
    : `/api/received-invitations/${encodeURIComponent(id)}/${accept ? 'accept' : 'decline'}`;
  button.disabled = true;
  try {
    await api(endpoint, { method: 'POST' });
    await loadInvitations();
    await loadContacts();
    await loadGroups();
    renderDashboard();
    showToast(accept ? 'Invitation accepted—you can start chatting.' : 'Invitation declined.');
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
  }
}

function renderInvitations() {
  const inviteButtons = `<div class="invite-actions-row"><button class="button button-outline group-invite-trigger" type="button">Invite people to a group chat</button><button class="button button-outline invite-trigger" type="button"><span>＋</span> Invite someone</button></div>`;
  const receivedList = receivedInvitations.length
    ? `<section class="contact-section invitation-section"><div class="section-caption"><span>INVITATIONS FOR YOU</span></div><div class="people-list">${receivedInvitations.map((invite, index) => `
    <article class="person-row received-invite-row" style="--row-index:${index}">${avatar(invite.inviter_name, invite.inviter_picture, 'person-avatar')}<div class="person-info"><h3>${escapeText(invite.inviter_name)}</h3><p>${escapeText(invite.inviter_name)} invited you to chat on PiChat.</p></div>${receivedInviteActions(invite, 'direct')}</article>`).join('')}</div></section>`
    : '';
  const receivedGroupList = receivedGroupInvitations.length
    ? `<section class="contact-section invitation-section"><div class="section-caption"><span>GROUP INVITATIONS FOR YOU</span></div><div class="people-list">${receivedGroupInvitations.map((invite, index) => `
    <article class="person-row received-invite-row" style="--row-index:${index}">${avatar(invite.group_name, invite.group_picture, 'person-avatar')}<div class="person-info"><h3>${escapeText(invite.group_name)}</h3><p>${escapeText(invite.inviter_name)} invited you to this group chat.</p></div>${receivedInviteActions(invite, 'group')}</article>`).join('')}</div></section>`
    : '';
  const directList = invitations.length
    ? `<section class="contact-section invitation-section"><div class="section-caption"><span>INVITATIONS YOU SENT</span><button class="refresh-button" data-refresh title="Refresh invitation statuses" aria-label="Refresh invitation statuses">↻</button></div><div class="people-list">${invitations.map((person, index) => `
    <article class="person-row" style="--row-index:${index}">${avatar(person.name, null, 'person-avatar')}<div class="person-info"><h3>${escapeText(person.name)}</h3><p>${escapeText(person.email)}</p></div><span class="status-pill status-${person.status}"><span></span>${statusLabel(person.status)}</span><span class="person-arrow">↗</span></article>`).join('')}</div></section>`
    : '';
  const groupList = groupInvitations.length
    ? `<section class="contact-section invitation-section"><div class="section-caption"><span>GROUP INVITATIONS YOU SENT</span></div><div class="people-list">${groupInvitations.map((person, index) => `
    <article class="person-row group-invite-row" style="--row-index:${index}">${avatar(person.group_name, person.group_picture, 'person-avatar')}<div class="person-info"><h3>${escapeText(person.name)}</h3><p>${escapeText(person.email)} · ${escapeText(person.group_name)}</p></div><span class="status-pill status-${person.status}"><span></span>${statusLabel(person.status)}</span><span class="person-arrow">◎</span></article>`).join('')}</div></section>`
    : '';
  if (!invitations.length && !groupInvitations.length && !receivedInvitations.length && !receivedGroupInvitations.length) {
    return `<section class="empty-state empty-state-small"><div class="empty-invite-icon">↗</div><span class="eyebrow">A NOTE, ON ITS WAY</span><h2>No invitations yet.</h2><p>Invite someone or start a group chat—they will show up right here.</p>${inviteButtons}</section>`;
  }
  return `${receivedList}${receivedGroupList}${directList}${groupList}`;
}

function statusLabel(status) {
  return status === 'accepted' ? 'Accepted invitation' : status === 'declined' ? 'Declined invitation' : 'Invitation pending';
}

function openGroupInviteModal() {
  const modalRoot = document.querySelector('#modal-root');
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <section class="invite-modal group-invite-modal" role="dialog" aria-modal="true" aria-labelledby="group-invite-title">
        <button class="modal-close" id="modal-close" aria-label="Close dialog">×</button>
        <div class="modal-icon">◎</div><span class="eyebrow">START A CIRCLE</span>
        <h2 id="group-invite-title">Invite people to a group chat</h2>
        <p>Name the chat, add a group photo, and list everyone you want in it.</p>
        <form id="group-invite-form" class="form-stack">
          <label class="field"><span>Group chat name</span><input name="groupName" placeholder="e.g. Friday Night Crew" required minlength="2" maxlength="80" /></label>
          <label class="photo-picker" for="group-profile-picture">
            <span class="photo-picker-avatar" id="group-photo-preview">+</span>
            <span><strong>Group profile picture</strong><small>Optional · PNG, JPG, GIF or WebP</small></span>
            <input id="group-profile-picture" type="file" accept="image/png,image/jpeg,image/gif,image/webp" />
          </label>
          <p class="section-caption members-caption"><span>MEMBERS</span></p>
          <div id="group-members-list" class="group-members-list">
            <div class="group-member-row">
              <label class="field"><span>Name</span><input name="memberName" placeholder="Their name" required minlength="2" maxlength="80" /></label>
              <label class="field"><span>Email</span><input name="memberEmail" type="email" placeholder="they@example.com" required /></label>
            </div>
          </div>
          <button id="add-group-member" class="text-button" type="button">+ Add another member</button>
          <p class="form-error" id="group-invite-error" aria-live="polite"></p>
          <button class="button button-primary button-wide" type="submit">Send group invitations <span aria-hidden="true">→</span></button>
        </form>
        <p class="modal-footnote">Each person gets an email with your site link to accept or decline.</p>
      </section>
    </div>`;
  const close = () => { modalRoot.innerHTML = ''; };
  let groupProfilePicture = null;
  document.querySelector('#modal-close').addEventListener('click', close);
  document.querySelector('#modal-backdrop').addEventListener('click', (event) => { if (event.target.id === 'modal-backdrop') close(); });
  document.querySelector('#group-profile-picture')?.addEventListener('change', async () => {
    const file = document.querySelector('#group-profile-picture').files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('Choose a group photo under 2 MB.');
      document.querySelector('#group-profile-picture').value = '';
      return;
    }
    groupProfilePicture = await readImageFile(file);
    document.querySelector('#group-photo-preview').innerHTML = `<img src="${groupProfilePicture}" alt="" />`;
  });
  document.querySelector('#add-group-member').addEventListener('click', () => {
    const row = document.createElement('div');
    row.className = 'group-member-row';
    row.innerHTML = `
      <label class="field"><span>Name</span><input name="memberName" placeholder="Their name" required minlength="2" maxlength="80" /></label>
      <label class="field"><span>Email</span><input name="memberEmail" type="email" placeholder="they@example.com" required /></label>
      <button type="button" class="text-button remove-member" aria-label="Remove member">Remove</button>`;
    row.querySelector('.remove-member').addEventListener('click', () => row.remove());
    document.querySelector('#group-members-list').append(row);
  });
  document.querySelector('#group-invite-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const error = document.querySelector('#group-invite-error');
    const groupName = form.querySelector('input[name="groupName"]').value.trim();
    const names = [...form.querySelectorAll('input[name="memberName"]')].map((input) => input.value.trim());
    const emails = [...form.querySelectorAll('input[name="memberEmail"]')].map((input) => input.value.trim());
    const members = names.map((name, index) => ({ name, email: emails[index] }));
    button.disabled = true;
    error.textContent = '';
    try {
      const result = await api('/api/groups', { method: 'POST', body: JSON.stringify({ name: groupName, profilePicture: groupProfilePicture, members }) });
      await loadGroups();
      await loadInvitations();
      close();
      activeGroup = result.group.id;
      activeContact = null;
      activeView = 'invitations';
      renderDashboard();
      const emailed = result.invites.filter((item) => item.emailSent).length;
      const inApp = result.invites.filter((item) => item.deliveredInApp).length;
      const parts = [];
      if (emailed) parts.push(`${emailed} email(s) sent`);
      if (inApp) parts.push(`${inApp} added in PiChat for existing members`);
      showToast(`Group “${result.group.name}” created.${parts.length ? ` ${parts.join('; ')}.` : ''}`);
    } catch (requestError) {
      error.textContent = requestError.message;
      button.disabled = false;
    }
  });
  document.querySelector('input[name="groupName"]').focus();
}

function openAccountModal() {
  if (!currentUser) return;
  const modalRoot = document.querySelector('#modal-root');
  if (!modalRoot) return;
  const existingSetting = currentUser.content_setting || '';
  const photoPreview = currentUser.profile_picture
    ? `<img src="${currentUser.profile_picture}" alt="" />`
    : escapeText(initials(currentUser.name));
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <section class="invite-modal account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <button class="modal-close" id="modal-close" type="button" aria-label="Close dialog">×</button>
        <div class="modal-icon">◎</div>
        <span class="eyebrow">YOUR ACCOUNT</span>
        <h2 id="account-title">Edit your profile</h2>
        <p>Update how you appear in PiChat. Your email stays tied to this account.</p>
        <form id="account-form" class="form-stack">
          <label class="photo-picker" for="account-profile-picture">
            <span class="photo-picker-avatar" id="account-photo-preview">${photoPreview}</span>
            <span><strong>Profile photo</strong><small>PNG, JPG, GIF or WebP · under 2 MB</small></span>
            <input id="account-profile-picture" type="file" accept="image/png,image/jpeg,image/gif,image/webp" />
          </label>
          <label class="field"><span>Your name</span><input name="name" autocomplete="name" value="${escapeText(currentUser.name)}" required minlength="2" maxlength="80" /></label>
          <div class="field field-readonly">
            <span>Email address</span>
            <input value="${escapeText(currentUser.email)}" readonly tabindex="-1" aria-readonly="true" />
            <small class="field-hint">Email cannot be changed.</small>
          </div>
          <label class="field" for="account-content-setting">
            <span>Content setting</span>
            <select id="account-content-setting" name="contentSetting" required>
              <option value="" disabled ${existingSetting ? '' : 'selected'}>Choose a setting</option>
              ${contentSettings.map((setting) => `<option value="${setting.value}" ${existingSetting === setting.value ? 'selected' : ''}>${escapeText(setting.label)}</option>`).join('')}
            </select>
          </label>
          <p class="content-setting-note account-setting-note">Messages sent to you are checked against this setting.</p>
          <p class="form-error" id="account-error" aria-live="polite"></p>
          <button class="button button-primary button-wide" type="submit">Save changes <span aria-hidden="true">→</span></button>
        </form>
      </section>
    </div>`;

  let profilePicture;
  let profilePictureTouched = false;

  const close = () => { modalRoot.innerHTML = ''; };
  document.querySelector('#modal-close').addEventListener('click', close);
  document.querySelector('#modal-backdrop').addEventListener('click', (event) => {
    if (event.target.id === 'modal-backdrop') close();
  });
  document.addEventListener('keydown', function escapeModal(event) {
    if (event.key === 'Escape') {
      close();
      document.removeEventListener('keydown', escapeModal);
    }
  }, { once: true });

  const pictureInput = document.querySelector('#account-profile-picture');
  pictureInput.addEventListener('change', async () => {
    const file = pictureInput.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('Choose a profile photo under 2 MB.');
      pictureInput.value = '';
      return;
    }
    profilePictureTouched = true;
    profilePicture = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
    document.querySelector('#account-photo-preview').innerHTML = `<img src="${profilePicture}" alt="" />`;
  });

  document.querySelector('#account-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    const contentSetting = form.get('contentSetting');
    const button = event.currentTarget.querySelector('button[type="submit"]');
    const error = document.querySelector('#account-error');
    button.disabled = true;
    error.textContent = '';
    const payload = { name, contentSetting };
    if (profilePictureTouched) payload.profilePicture = profilePicture ?? null;
    try {
      const result = await api('/api/profile', { method: 'PUT', body: JSON.stringify(payload) });
      currentUser = { ...currentUser, ...result.user };
      close();
      renderDashboard();
      showToast('Your account has been updated.');
    } catch (requestError) {
      error.textContent = requestError.message;
      button.disabled = false;
    }
  });
  document.querySelector('#account-form input[name="name"]').focus();
}

function openInviteModal() {
  const modalRoot = document.querySelector('#modal-root');
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <section class="invite-modal" role="dialog" aria-modal="true" aria-labelledby="invite-title">
        <button class="modal-close" id="modal-close" aria-label="Close dialog">×</button>
        <div class="modal-icon">↗</div><span class="eyebrow">MAKE THE FIRST MOVE</span>
        <h2 id="invite-title">Send a little hello.</h2><p>We will send them an email with your invitation.</p>
        <form id="invite-form" class="form-stack">
          <label class="field"><span>Their name</span><input name="name" placeholder="e.g. Jamie Lee" required minlength="2" maxlength="80" /></label>
          <label class="field"><span>Their email</span><input name="email" type="email" placeholder="jamie@example.com" required /></label>
          <p class="form-error" id="invite-error" aria-live="polite"></p>
          <button class="button button-primary button-wide" type="submit">Send invitation <span aria-hidden="true">→</span></button>
        </form>
        <p class="modal-footnote">They can accept or decline from the email.</p>
      </section>
    </div>`;
  const close = () => { modalRoot.innerHTML = ''; };
  document.querySelector('#modal-close').addEventListener('click', close);
  document.querySelector('#modal-backdrop').addEventListener('click', (event) => { if (event.target.id === 'modal-backdrop') close(); });
  document.addEventListener('keydown', function escapeModal(event) {
    if (event.key === 'Escape') { close(); document.removeEventListener('keydown', escapeModal); }
  }, { once: true });
  document.querySelector('#invite-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const button = event.currentTarget.querySelector('button[type="submit"]');
    const error = document.querySelector('#invite-error');
    button.disabled = true;
    button.textContent = 'Sending…';
    error.textContent = '';
    try {
      const result = await api('/api/invitations', { method: 'POST', body: JSON.stringify(payload) });
      invitations.unshift(result.invitation);
      close();
      activeView = 'invitations';
      renderDashboard();
      if (result.deliveredInApp) {
        showToast(`${result.invitation.name} is already on PiChat. They will see your invitation in Invitations.`);
      } else if (result.emailSent) showInviteLink(result.inviteUrl, `Invitation sent to ${result.invitation.email}.`, true);
      else showInviteLink(result.inviteUrl, result.emailError);
    } catch (requestError) {
      error.textContent = requestError.message;
      button.disabled = false;
      button.innerHTML = 'Send invitation <span aria-hidden="true">→</span>';
    }
  });
  document.querySelector('#invite-form input[name="name"]').focus();
}

function showInviteLink(url, message, emailSent = false) {
  const modalRoot = document.querySelector('#modal-root');
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop"><section class="invite-modal link-modal" role="dialog" aria-modal="true" aria-labelledby="link-title">
      <button class="modal-close" id="modal-close" aria-label="Close dialog">×</button>
      <div class="modal-icon">✓</div><span class="eyebrow">${emailSent ? 'INVITATION SENT' : 'INVITATION SAVED'}</span><h2 id="link-title">${emailSent ? 'Your invitation link is ready.' : 'Invitation saved, email not sent.'}</h2>
      <p>${emailSent ? `${escapeText(message)} You can also share the link directly.` : `${escapeText(message)} Share the link below to invite them now.`}</p>
      <div class="share-link"><input id="share-url" readonly value="${url}" aria-label="Invitation link" /><button id="copy-link" class="button button-primary">Copy link</button></div>
      <button id="done-link" class="text-button done-link">Done</button>
    </section></div>`;
  const close = () => { modalRoot.innerHTML = ''; };
  document.querySelector('#modal-close').addEventListener('click', close);
  document.querySelector('#done-link').addEventListener('click', close);
  document.querySelector('#modal-backdrop').addEventListener('click', (event) => { if (event.target.id === 'modal-backdrop') close(); });
  document.querySelector('#copy-link').addEventListener('click', async (event) => {
    await navigator.clipboard.writeText(url);
    event.currentTarget.textContent = 'Copied';
  });
}

function inviteLoginRedirect(token) {
  const params = new URLSearchParams({ auth: 'login', invite: token });
  window.location.replace(`/?${params}`);
}

async function renderGroupInviteResponse(token) {
  app.innerHTML = `<div class="response-loading"><span class="brand-mark">${brandLogoMark}</span><p>Opening your group invitation…</p></div>`;
  try {
    const result = await api(`/api/group-invite/${encodeURIComponent(token)}`);
    const invite = result.invitation;
    const groupAvatar = invite.group_picture ? avatar(invite.group_name, invite.group_picture, 'response-group-avatar') : `<span class="response-letter">${initials(invite.group_name)}</span>`;
    app.innerHTML = `
      <section class="response-page">${brandLink()}
        <div class="response-card">
          <div class="response-art">${groupAvatar}<span class="response-flower">◎</span></div>
          <span class="eyebrow">GROUP CHAT INVITATION</span>
          <h1>${escapeText(invite.group_name)}</h1>
          <p>${escapeText(invite.inviter_name)} invited you to join a PiChat group chat called <strong>${escapeText(invite.group_name)}</strong>.</p>
          <p class="response-site-link">PiChat: <a href="${escapeText(invite.app_url)}">${escapeText(invite.app_url)}</a></p>
          ${invite.status === 'pending' ? `<div class="response-actions"><button class="button button-primary" id="accept-group-invite">Accept invitation <span aria-hidden="true">→</span></button><button class="button button-quiet" id="decline-group-invite">Decline</button></div>` : `<div class="response-final status-pill status-${invite.status}"><span></span>${statusLabel(invite.status)}</div>`}
          <span class="response-recipient">INVITED: ${escapeText(invite.invitee_name)} · ${escapeText(invite.invitee_email)}</span>
          <p class="response-message" id="response-message" aria-live="polite"></p>
        </div><p class="response-footer">PICHAT · WHERE CONVERSATIONS KEEP GOING</p>
      </section>`;
    document.querySelector('#accept-group-invite')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await api('/api/session');
        await api(`/api/group-invite/${encodeURIComponent(token)}/accept`, { method: 'POST' });
        window.location.replace('/');
        return;
      } catch {
        inviteLoginRedirect(token);
      }
    });
    document.querySelector('#decline-group-invite')?.addEventListener('click', () => {
      /* Declining from the email link page does not change the invitation. */
    });
  } catch (error) {
    app.innerHTML = `<section class="response-page">${brandLink()}<div class="response-card invalid-invite"><div class="modal-icon">!</div><span class="eyebrow">INVITATION UNAVAILABLE</span><h1>This link has<br /><span>lost its way.</span></h1><p>${escapeText(error.message)}</p><a class="button button-primary" href="/">Go to PiChat <span aria-hidden="true">→</span></a></div></section>`;
  }
}

async function renderInviteResponse(token) {
  app.innerHTML = `<div class="response-loading"><span class="brand-mark">${brandLogoMark}</span><p>Opening your invitation…</p></div>`;
  try {
    const result = await api(`/api/invite/${encodeURIComponent(token)}`);
    const invite = result.invitation;
    app.innerHTML = `
      <section class="response-page">${brandLink()}
        <div class="response-card">
          <div class="response-art"><span class="response-ring ring-one"></span><span class="response-ring ring-two"></span><span class="response-letter">${initials(invite.inviter_name)}</span><span class="response-flower">✳</span></div>
          <span class="eyebrow">A LITTLE NOTE FOR YOU</span>
          <h1>${escapeText(invite.inviter_name)}<br /><span>thought of you.</span></h1>
          <p>${escapeText(invite.inviter_name)} invited you to connect on PiChat—a cozy circle for endless good talk.</p>
          ${invite.status === 'pending' ? `<div class="response-actions"><button class="button button-primary" id="accept-invite">Accept invitation <span aria-hidden="true">→</span></button><button class="button button-quiet" id="decline-invite">Decline</button></div>` : `<div class="response-final status-pill status-${invite.status}"><span></span>${statusLabel(invite.status)}</div>`}
          <span class="response-recipient">INVITED: ${escapeText(invite.invitee_name)} · ${escapeText(invite.invitee_email)}</span>
          <p class="response-message" id="response-message" aria-live="polite"></p>
        </div><p class="response-footer">PICHAT · WHERE CONVERSATIONS KEEP GOING</p>
      </section>`;
    document.querySelector('#accept-invite')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await api('/api/session');
        await api(`/api/invite/${encodeURIComponent(token)}/accept`, { method: 'POST' });
        window.location.replace('/');
        return;
      } catch {
        inviteLoginRedirect(token);
      }
    });
    document.querySelector('#decline-invite')?.addEventListener('click', () => {
      /* Declining from the email link page does not change the invitation. */
    });
  } catch (error) {
    app.innerHTML = `<section class="response-page">${brandLink()}<div class="response-card invalid-invite"><div class="modal-icon">!</div><span class="eyebrow">INVITATION UNAVAILABLE</span><h1>This link has<br /><span>lost its way.</span></h1><p>${escapeText(error.message)}</p><a class="button button-primary" href="/">Go to PiChat <span aria-hidden="true">→</span></a></div></section>`;
  }
}

function escapeText(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

async function start() {
  const groupInviteMatch = window.location.pathname.match(/^\/group-invite\/([^/]+)$/);
  if (groupInviteMatch) return renderGroupInviteResponse(decodeURIComponent(groupInviteMatch[1]));
  const inviteMatch = window.location.pathname.match(/^\/invite\/([^/]+)$/);
  if (inviteMatch) return renderInviteResponse(decodeURIComponent(inviteMatch[1]));
  const urlParams = new URLSearchParams(window.location.search);
  const authMode = urlParams.get('auth') === 'login' ? 'login' : 'signup';
  try {
    const result = await api('/api/session');
    currentUser = result.user;
    if (urlParams.has('invite') || urlParams.has('auth')) {
      window.history.replaceState({}, '', '/');
    }
    if (currentUser.content_setting) {
      await loadInvitations();
      await loadContacts();
      await loadGroups();
      renderDashboard();
    } else {
      renderContentSettings();
    }
  } catch {
    if (urlParams.has('invite') || urlParams.has('auth')) {
      window.history.replaceState({}, '', '/');
    }
    renderAuth(authMode);
  }
  setInterval(async () => {
    if (!currentUser || (!activeContact && !activeGroup && activeView === 'invitations') || document.hidden || document.querySelector('#modal-root .modal-backdrop')) return;
    try {
      const previousContacts = JSON.stringify(contacts);
      const previousGroups = JSON.stringify(groups);
      await loadInvitations();
      await loadContacts();
      await loadGroups();
      if ((activeView === 'invitations' && !activeContact && !activeGroup) || previousContacts !== JSON.stringify(contacts) || previousGroups !== JSON.stringify(groups)) renderDashboard();
    } catch { /* A later refresh will retry if the session expires. */ }
  }, 15000);
  setInterval(() => {
    if (currentUser && activeContact && !document.hidden) loadChatMessages(activeContact);
    if (currentUser && activeGroup && !document.hidden) loadGroupMessages(activeGroup);
  }, 3000);
}

start();