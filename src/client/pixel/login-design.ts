export function designPixelLogin() {
  const card = document.querySelector<HTMLElement>('main.card')!;
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
    const element = document.createElement(tag); element.className = className; element.textContent = text; return element;
  };
  const scene = make('div', 'pixel-login-art'); scene.setAttribute('aria-hidden', 'true'); document.body.append(scene);
  const brand = make('div', 'pixel-login-brand');
  const bot = make('img'); bot.src = '/assets/pixel/office-bot.svg'; bot.alt = '';
  const wordmark = make('div'); wordmark.append(make('strong', '', 'PIXEL\nAGENT OFFICE'), make('small', '', 'COMMAND CENTER')); brand.append(bot, wordmark);
  card.querySelector('.logo')!.replaceWith(brand);
  card.querySelector('h1')!.textContent = 'Welcome back';
  card.querySelector('#sub')!.textContent = "Sign in to your team's shared office";
  const nameRow = card.querySelector<HTMLLabelElement>('#name-row')!; nameRow.hidden = false;
  nameRow.childNodes[0].textContent = 'Username';
  const name = card.querySelector<HTMLInputElement>('#name')!; name.placeholder = 'Enter your username';
  const password = card.querySelector<HTMLInputElement>('#password')!; password.placeholder = 'Enter your password';
  const passwordField = make('span', 'pixel-password-field'); password.replaceWith(passwordField); passwordField.append(password);
  const reveal = make('button', 'pixel-password-reveal', '◉'); reveal.type = 'button'; reveal.setAttribute('aria-label', 'Show password');
  reveal.onclick = () => { password.type = password.type === 'password' ? 'text' : 'password'; reveal.setAttribute('aria-label', password.type === 'password' ? 'Show password' : 'Hide password'); }; passwordField.append(reveal);
  card.querySelector('#submit')!.textContent = 'Sign In  →';
  const invitation = make('section', 'pixel-login-invitation');
  const inviteButton = make('button', '', 'Use invitation link to join your team'); inviteButton.type = 'button';
  const inviteForm = make('form', 'pixel-invitation-form'); inviteForm.hidden = true;
  const inviteLabel = make('label', '', 'Invitation link'); const inviteInput = make('input'); inviteInput.type = 'text'; inviteInput.required = true; inviteInput.placeholder = 'Paste your Office invitation link';
  const inviteError = make('p', 'error'); inviteError.setAttribute('role', 'alert');
  const proceed = make('button', '', 'Continue to invitation'); proceed.type = 'submit'; inviteLabel.append(inviteInput); inviteForm.append(inviteLabel, proceed, inviteError);
  inviteButton.onclick = () => { inviteForm.hidden = !inviteForm.hidden; if (!inviteForm.hidden) inviteInput.focus(); };
  inviteForm.onsubmit = event => {
    event.preventDefault();
    try {
      const value = inviteInput.value.trim();
      const url = /^[a-zA-Z0-9_-]+$/.test(value) ? new URL(`/join#${value}`, location.origin) : new URL(value, location.origin);
      if (url.origin !== location.origin || url.pathname !== '/join' || !url.hash.slice(1)) throw new Error('Use an invitation link for this Office.');
      location.assign(url.pathname + url.hash);
    } catch { inviteError.textContent = 'Use a valid invitation link for this Office.'; }
  };
  invitation.append(make('div', 'pixel-or', 'or'), inviteButton, inviteForm);
  const faces = make('div', 'pixel-login-faces'); faces.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 7; i++) { const face = make('span'); face.style.backgroundPosition = `${-(i % 4) * 52}px -76px`; faces.append(face); }
  const ready = make('p', 'pixel-login-ready', 'Your projects, tasks and agents are ready');
  const secure = make('div', 'pixel-login-secure'); secure.append(make('span', 'pixel-lock', '▣'), make('div', '', 'Secure team workspace'));
  secure.lastElementChild!.append(make('p', '', 'Your data, agents and sessions stay private to your team.'));
  card.append(invitation, faces, ready, secure);
}
